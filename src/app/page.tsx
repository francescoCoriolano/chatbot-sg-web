"use client";

import { useState, useEffect, useRef } from "react";
import { Send, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Message } from "@/types";
import { initializeSocket, disconnectSocket } from "@/utils/socket";
import { Socket } from "socket.io-client";
import SocketDebug from "@/components/SocketDebug";

interface TypingUser {
  id: string;
  name?: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("chat-messages");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [newMessage, setNewMessage] = useState("");
  const [username, setUsername] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("chat-username") || "";
    }
    return "";
  });
  const [isSettingUsername, setIsSettingUsername] = useState(!username);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localModeOnly, setLocalModeOnly] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [slackTypingUsers, setSlackTypingUsers] = useState<TypingUser[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  // Track message IDs sent by this client to prevent duplicates from Slack polling
  const [sentMessageIds] = useState<Set<string>>(new Set());
  // Track Slack timestamps for messages we've sent
  const [slackTimestamps] = useState<Set<string>>(new Set());
  // User's dedicated Slack channel
  const [userChannel, setUserChannel] = useState<string | null>(null);
  const [userChannelName, setUserChannelName] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem("chat-messages", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem("chat-username", username);
  }, [username]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Setup Socket.IO connection
  useEffect(() => {
    // Don't establish connection until username is set
    if (!username) return;

    // Make sure the socketio API is initialized
    const ensureSocketServer = async () => {
      try {
        // Use the App Router endpoint to initialize the socket
        console.log("Initializing Socket.IO server...");
        const initResponse = await fetch("/api/socket-init");
        const initData = await initResponse.json();

        if (initData.success) {
          console.log("Socket server initialized:", initData.status);
        } else {
          console.error("Failed to initialize socket server:", initData.error);
          setError("Failed to connect to chat server. Please refresh the page.");
        }
      } catch (error) {
        console.error("Error initializing socket server:", error);
        setError("Failed to connect to chat server. Please refresh the page.");
      }
    };

    // Check and initialize the socket server if needed
    ensureSocketServer();

    // Initialize Socket.IO
    const socket = initializeSocket();
    socketRef.current = socket;

    if (!socket) {
      setError("Failed to connect to chat server. Please refresh the page.");
      return;
    }

    // Connection events
    const onConnect = () => {
      setIsConnected(true);
      setError(null);
    };

    const onDisconnect = (reason: string) => {
      setIsConnected(false);

      if (reason === "io server disconnect") {
        // Server initiated disconnect - need to reconnect manually
        socket.connect();
      }
    };

    const onConnectError = (err: Error) => {
      setError(`Connection error: ${err.message}. Retrying...`);
    };

    // Handle welcome message
    const onWelcome = (data: any) => {
      setIsConnected(true);
    };

    // Handle reconnect events
    const onReconnect = (attemptNumber: number) => {
      setIsConnected(true);
      setError(null);
    };

    const onReconnectAttempt = (attemptNumber: number) => {
      setError(`Connection lost. Reconnecting (attempt ${attemptNumber})...`);
    };

    const onReconnectError = (err: Error) => {
      setError(`Reconnection error: ${err.message}`);
    };

    const onReconnectFailed = () => {
      setError("Failed to reconnect after multiple attempts. Please refresh the page.");
    };

    // Handle new messages from the server
    const onChatMessage = (message: Message) => {
      // Add the message to our state if we don't already have it
      setMessages((prevMessages) => {
        // Check if we already have this message - use both ID and timestamp for reliable deduplication
        const isDuplicate = prevMessages.some(
          (msg) =>
            msg.id === message.id || (message.sender === username && msg.text === message.text && msg.sender === message.sender && Math.abs(new Date(msg.timestamp).getTime() - new Date(message.timestamp).getTime()) < 5000)
        );

        if (isDuplicate) return prevMessages;

        // Add new message and sort
        const newMessages = [...prevMessages, message];
        return newMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      });
    };

    // Handle Slack messages
    const onSlackMessage = (message: Message) => {
      // Only skip if we're confident it's our message (has our clientMessageId or slackTs)
      const isCertainlyOurMessage = (message.sender === username && message.id && sentMessageIds.has(message.id)) || (message.id && slackTimestamps.has(message.id));

      if (isCertainlyOurMessage) return;

      // Ensure the message is marked as from Slack
      const slackMessage = {
        ...message,
        isFromSlack: true,
      };

      // If this message has a target user and it's not for the current user, tag it
      if (message.targetUser && message.targetUser !== username) {
        slackMessage.text = `[To ${message.targetUser}] ${slackMessage.text}`;
      }

      // Add the Slack message to our state
      setMessages((prevMessages) => {
        // Check if we already have this message (prevent duplicates)
        const isDuplicate = prevMessages.some(
          (msg) => msg.id === slackMessage.id || (msg.text === slackMessage.text && msg.sender === slackMessage.sender && Math.abs(new Date(msg.timestamp).getTime() - new Date(slackMessage.timestamp).getTime()) < 5000)
        );

        if (isDuplicate) return prevMessages;

        // If the message was very recent, show typing indicator
        const messageTime = new Date(slackMessage.timestamp).getTime();
        const now = Date.now();
        if (now - messageTime < 5000 && slackMessage.userId) {
          // Add typing indicator that will auto-remove
          setSlackTypingUsers((prev) => {
            // Check if we already have this user typing
            if (prev.some((u) => u.id === slackMessage.userId)) {
              return prev;
            }

            // Add new typing user
            const typingUser = {
              id: slackMessage.userId as string,
              name: slackMessage.sender,
            };

            // Auto-clear after 3 seconds
            setTimeout(() => {
              setSlackTypingUsers((prev) => prev.filter((u) => u.id !== slackMessage.userId));
            }, 3000);

            return [...prev, typingUser];
          });
        }

        // Add new message and sort
        const newMessages = [...prevMessages, slackMessage];
        return newMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      });
    };

    // Manually fetch Slack messages periodically to ensure we have the latest
    const fetchSlackMessages = async () => {
      try {
        const response = await fetch("/api/slack-chat");

        if (!response.ok) {
          throw new Error(`Failed to fetch Slack messages: ${response.status}`);
        }

        const data = await response.json();
        const slackMessages = data.messages || [];

        // Merge with existing messages
        setMessages((prevMessages) => {
          const existingIds = new Set(prevMessages.map((msg) => msg.id));
          const newMessages = [...prevMessages];
          let hasNewMessages = false;

          slackMessages.forEach((msg: Message) => {
            // Only skip messages we're certain we sent ourselves
            const isCertainlyOurMessage = (msg.sender === username && sentMessageIds.has(msg.id)) || (msg.id && slackTimestamps.has(msg.id));

            if (isCertainlyOurMessage) {
              console.log(`Skipping our own message from Slack API (positive match): ${msg.id}`);
              return;
            }

            // Basic deduplication check - only check exact ID match
            if (existingIds.has(msg.id)) {
              return;
            }

            // Ensure all Slack messages have isFromSlack flag
            const messageWithFlag = {
              ...msg,
              isFromSlack: true,
            };
            newMessages.push(messageWithFlag);
            hasNewMessages = true;
            console.log("Added missing Slack message from API:", messageWithFlag);
          });

          if (!hasNewMessages) {
            return prevMessages;
          }

          return newMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        });
      } catch (error) {
        console.error("Error fetching Slack messages:", error);
      }
    };

    // Register all event handlers
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("welcome", onWelcome);
    socket.io.on("reconnect", onReconnect);
    socket.io.on("reconnect_attempt", onReconnectAttempt);
    socket.io.on("reconnect_error", onReconnectError);
    socket.io.on("reconnect_failed", onReconnectFailed);
    socket.on("chat_message", onChatMessage);
    socket.on("slack_message", onSlackMessage);
    socket.on("missed_messages_complete", (data: any) => {
      // Messages have been loaded
    });

    // When connected, double check for existing Slack messages
    socket.on("connect", () => {
      setTimeout(fetchSlackMessages, 1000);
    });

    // Set up periodic polling for Slack messages as a fallback
    const pollInterval = setInterval(fetchSlackMessages, 15000); // Poll every 15 seconds

    // Fetch initial data
    const fetchInitialMessages = async () => {
      try {
        const response = await fetch("/api/slack-chat");

        if (!response.ok) {
          throw new Error(`Failed to fetch initial messages: ${response.status}`);
        }

        const data = await response.json();
        const slackMessages = data.messages || [];

        // Merge with existing messages
        setMessages((prevMessages) => {
          const existingIds = new Set(prevMessages.map((msg) => msg.id));
          const newMessages = [...prevMessages];

          slackMessages.forEach((msg: Message) => {
            // Skip if existing by ID
            if (existingIds.has(msg.id)) {
              return;
            }

            // Ensure all Slack messages have isFromSlack flag
            const messageWithFlag = {
              ...msg,
              isFromSlack: true,
            };
            newMessages.push(messageWithFlag);
            console.log("Added initial Slack message:", messageWithFlag);
          });

          return newMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        });
      } catch (error) {
        console.error("Error fetching initial messages:", error);
      }
    };

    fetchInitialMessages();

    return () => {
      // Cleanup by removing all event listeners
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("welcome", onWelcome);
      socket.off("chat_message", onChatMessage);
      socket.off("slack_message", onSlackMessage);
      socket.off("missed_messages_complete");

      // Clear polling interval
      clearInterval(pollInterval);
    };
  }, [username]);

  // Clean up socket on component unmount
  useEffect(() => {
    return () => {
      disconnectSocket();
    };
  }, []);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    const messageId = Date.now().toString();
    const messageText = newMessage.trim();

    // Add to sent messages tracking to prevent duplicates
    sentMessageIds.add(messageId);

    // Clear input field immediately for better UX
    setNewMessage("");

    // Create local message
    const localMessage: Message = {
      id: messageId,
      text: messageText,
      sender: username,
      timestamp: new Date().toISOString(),
      isFromSlack: false,
    };

    // Add message to local state immediately for better UX
    setMessages((prev) => [...prev, localMessage]);

    try {
      // Directly emit message to socket if connected
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit("chat_message", localMessage);
        setIsLoading(false);
        return;
      } else {
        console.warn("Socket not connected, falling back to API call");
      }

      // Fallback to API call if socket is not available
      const response = await fetch("/api/slack-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: messageText,
          sender: username,
          userId: "user_" + messageId,
          clientMessageId: messageId,
        }),
      });

      const data = await response.json();

      // If message was sent to Slack, track the timestamp
      if (data.slackStatus?.success && data.slackStatus.slackTs) {
        slackTimestamps.add(data.slackStatus.slackTs);
      }

      // Check for local-only mode
      if (data.localOnly) {
        setLocalModeOnly(true);
        setError("Messages are only saved locally. The bot doesn't have permission to send to Slack.");
      }

      if (!response.ok) {
        throw new Error("Failed to send message to Slack");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setError("Failed to send message to Slack, but your message is saved locally");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetUsername = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      setIsSettingUsername(false);
    }
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
  };

  // Fetch user's dedicated channel
  const fetchUserChannel = async () => {
    if (!username) return;

    try {
      const response = await fetch(`/api/user-channel?username=${encodeURIComponent(username)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.channelId) {
          setUserChannel(data.channelId);
          setUserChannelName(data.channelName);
        }
      }
    } catch (error) {
      console.error("Error fetching user channel:", error);
    }
  };

  // Call this when username is set
  useEffect(() => {
    if (username) {
      fetchUserChannel();
    }
  }, [username]);

  if (isSettingUsername) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Welcome to Chat</h2>
          <form onSubmit={handleSetUsername} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                Choose your username
              </label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm px-3 py-2 text-gray-900 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="Enter your username"
              />
            </div>
            <button
              type="submit"
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Start Chatting
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <MessageSquare className="h-8 w-8 text-blue-600" />
              <h1 className="ml-3 text-2xl font-bold text-gray-900">Chat App</h1>
              {localModeOnly && <span className="ml-3 text-xs text-yellow-600 bg-yellow-100 px-2 py-1 rounded-full">Local Mode Only</span>}
              {isConnected && <span className="ml-3 text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full">Connected</span>}
              {!isConnected && <span className="ml-3 text-xs text-red-600 bg-red-100 px-2 py-1 rounded-full">Disconnected</span>}
              {userChannelName && <span className="ml-3 text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded-full">Slack Channel: {userChannelName}</span>}
            </div>
            <span className="text-sm text-gray-500">Logged in as {username}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow-xl h-[calc(100vh-200px)] flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {error && (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded relative" role="alert">
                <span className="block sm:inline">{error}</span>
              </div>
            )}
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500 text-center">No messages yet. Be the first to send a message!</p>
              </div>
            ) : (
              messages.map((message) => {
                // Debug log for message rendering
                console.log(`Rendering message - id: ${message.id}, from: ${message.sender}, isFromSlack: ${message.isFromSlack}`);

                return (
                  <div key={message.id} className={`flex ${message.sender === username ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`message-bubble rounded-lg px-4 py-2 max-w-sm shadow ${
                        message.sender === username ? "bg-blue-600 text-white" : message.isFromSlack ? "bg-green-100 text-gray-900 border border-green-200" : "bg-gray-100 text-gray-900 border border-gray-200"
                      }`}
                    >
                      <div className="text-sm font-medium mb-1">
                        {message.sender}
                        {message.isFromSlack && (
                          <span className="text-xs bg-green-200 text-green-800 px-1 rounded ml-1">
                            Slack
                            {message.channelName && ` (${message.channelName})`}
                          </span>
                        )}
                        <span className="text-xs opacity-75 ml-2">{formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })}</span>
                      </div>
                      <p className="whitespace-pre-wrap break-words">{message.text}</p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="p-4 border-t">
            <div className="flex space-x-4">
              <input
                type="text"
                value={newMessage}
                onChange={handleInputChange}
                placeholder="Type your message..."
                className="flex-1 rounded-lg border border-gray-300 shadow-sm px-3 py-2 text-gray-900 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                disabled={isLoading || !isConnected}
              />
              <button
                type="submit"
                disabled={isLoading || !newMessage.trim() || !isConnected}
                className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                title="Send message"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
            {slackTypingUsers.length > 0 && (
              <div className="text-xs text-green-600 mt-1 ml-2">
                <span className="inline-block">
                  <span className="typing-dot">•</span>
                  <span className="typing-dot">•</span>
                  <span className="typing-dot">•</span>
                </span>
                <span className="ml-1">{slackTypingUsers.length === 1 ? `${slackTypingUsers[0].name} is typing in Slack...` : `${slackTypingUsers.length} people are typing in Slack...`}</span>
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Socket Debug Component */}
      <SocketDebug />
    </div>
  );
}
