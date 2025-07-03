'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Message } from '@/types';
import {
  initializeSocket,
  disconnectSocket,
  getSocket,
  isSocketConnected,
  isUsingSocketMode,
  sendMessageViaSocket,
} from '@/utils/socket';
import { Socket } from 'socket.io-client';
import SocketDebug from '@/components/SocketDebug';

interface TypingUser {
  id: string;
  name?: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('chat-messages');
      // Start with empty messages by default
      return [];
    }
    return [];
  });
  const [newMessage, setNewMessage] = useState('');
  const [username, setUsername] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('chat-username') || '';
    }
    return '';
  });
  const [isSettingUsername, setIsSettingUsername] = useState(!username);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localModeOnly, setLocalModeOnly] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
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
  // Add state for channel deletion
  const [isDeletingChannel, setIsDeletingChannel] = useState<boolean>(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  // Add state for modal visibility
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  // Add state for logout confirmation dialog
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState<boolean>(false);
  // Add state for chat window visibility
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);

  // Add state for selected question
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);

  // Reference to track if component is mounted
  const mounted = useRef(true);
  // Reference for chat window to detect outside clicks
  const chatWindowRef = useRef<HTMLDivElement>(null);

  // Add a state to track the fallback mode
  const [usingFallbackMode, setUsingFallbackMode] = useState(false);

  // Check localStorage at startup
  useEffect(() => {
    // If no username, don't load messages
    if (!username) {
      console.log('No username set, not loading messages');
      return;
    }

    // Log the initial localStorage state
    const savedMessages = localStorage.getItem('chat-messages');
    console.log(
      'Initial localStorage state:',
      savedMessages ? `${savedMessages.length} chars` : 'empty',
    );

    // Clear messages if username just changed
    setMessages([]);

    // Store empty messages to localStorage
    localStorage.setItem('chat-messages', '[]');

    console.log('Starting with fresh message state for user:', username);
  }, [username]);

  useEffect(() => {
    console.log('Syncing messages to localStorage:', messages.length, 'messages');
    localStorage.setItem('chat-messages', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('chat-username', username);
  }, [username]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Setup Socket.IO connection
  useEffect(() => {
    // Don't establish connection until username is set
    if (!username) return;

    // Make sure the socketio API is initialized
    const ensureSocketServer = async () => {
      try {
        // Use the App Router endpoint to initialize the socket
        console.log('Initializing Socket.IO server...');
        const initResponse = await fetch('/api/socket-init');
        const initData = await initResponse.json();

        if (initData.success) {
          console.log('Socket server initialized:', initData.status);
        } else {
          console.error('Failed to initialize socket server:', initData.error);
          setError('Failed to connect to chat server. Please refresh the page.');
        }
      } catch (error) {
        console.error('Error initializing socket server:', error);
        setError('Failed to connect to chat server. Please refresh the page.');
      }
    };

    // Check and initialize the socket server if needed
    ensureSocketServer();

    // Initialize Socket.IO
    const socket = initializeSocket();
    socketRef.current = socket;

    if (!socket) {
      setError('Failed to connect to chat server. Please refresh the page.');
      return;
    }

    // Connection events
    const onConnect = () => {
      setIsConnected(true);
      setError(null);
    };

    const onDisconnect = (reason: string) => {
      setIsConnected(false);

      if (reason === 'io server disconnect') {
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
      setError('Failed to reconnect after multiple attempts. Please refresh the page.');
    };

    // Handle new messages from the server
    const onChatMessage = (message: Message) => {
      // Check if this message is from this user or relevant to this user
      const isRelevantMessage =
        message.sender === username ||
        (userChannel && message.channelId === userChannel) ||
        message.targetUser === username;

      if (!isRelevantMessage && message.sender !== username) {
        console.log(`Skipping chat message not relevant to user ${username}:`, message.id);
        return;
      }

      // Add the message to our state if we don't already have it
      setMessages(prevMessages => {
        // Check if we already have this message - use both ID and timestamp for reliable deduplication
        const isDuplicate = prevMessages.some(
          msg =>
            msg.id === message.id ||
            (message.sender === username &&
              msg.text === message.text &&
              msg.sender === message.sender &&
              Math.abs(new Date(msg.timestamp).getTime() - new Date(message.timestamp).getTime()) <
                5000),
        );

        if (isDuplicate) return prevMessages;

        // Add new message and sort
        const newMessages = [...prevMessages, message];
        return newMessages.sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
      });
    };

    // Handle Slack messages
    const onSlackMessage = (message: Message) => {
      console.log('🎯 SLACK MESSAGE RECEIVED:', {
        messageId: message.id,
        sender: message.sender,
        text: message.text,
        channelId: message.channelId,
        targetUser: message.targetUser,
        currentUser: username,
        currentUserChannel: userChannel,
      });

      // Only skip if we're confident it's our message (has our clientMessageId or slackTs)
      const isCertainlyOurMessage =
        (message.sender === username && message.id && sentMessageIds.has(message.id)) ||
        (message.id && slackTimestamps.has(message.id));

      if (isCertainlyOurMessage) {
        console.log('🎯 SKIPPING - This is certainly our own message');
        return;
      }

      // Make message filtering more permissive for Slack messages
      const isRelevantMessage =
        message.sender === username ||
        (userChannel && message.channelId === userChannel) ||
        message.targetUser === username ||
        // Also accept messages from channels that contain chat-app-[username]
        (message.channelId && message.channelId.includes(`chat-app-${username}`)) ||
        // Accept all Slack messages when no channel is set (during initial setup)
        (!userChannel && message.isFromSlack);

      console.log('🎯 RELEVANCE CHECK:', {
        isRelevantMessage,
        reasons: {
          senderMatch: message.sender === username,
          channelMatch: userChannel && message.channelId === userChannel,
          targetUserMatch: message.targetUser === username,
          channelNameMatch: message.channelId && message.channelId.includes(`chat-app-${username}`),
          noChannelSetAndFromSlack: !userChannel && message.isFromSlack,
        },
      });

      if (!isRelevantMessage) {
        console.log(`🎯 SKIPPING - Message not relevant to user ${username}:`, message.id);
        return;
      }

      // Ensure the message is marked as from Slack
      const slackMessage = {
        ...message,
        isFromSlack: true,
      };

      console.log('🎯 ADDING SLACK MESSAGE TO STATE:', slackMessage);

      // Add the Slack message to our state
      setMessages(prevMessages => {
        console.log('🎯 CURRENT MESSAGES COUNT:', prevMessages.length);

        // Check if we already have this message (prevent duplicates)
        const isDuplicate = prevMessages.some(
          msg =>
            msg.id === slackMessage.id ||
            (msg.text === slackMessage.text &&
              msg.sender === slackMessage.sender &&
              Math.abs(
                new Date(msg.timestamp).getTime() - new Date(slackMessage.timestamp).getTime(),
              ) < 5000),
        );

        if (isDuplicate) {
          console.log('🎯 SKIPPING - Message already exists (duplicate)');
          return prevMessages;
        }

        // If the message was very recent, show typing indicator
        const messageTime = new Date(slackMessage.timestamp).getTime();
        const now = Date.now();
        if (now - messageTime < 5000 && slackMessage.userId) {
          // Add typing indicator that will auto-remove
          setSlackTypingUsers(prev => {
            // Check if we already have this user typing
            if (prev.some(u => u.id === slackMessage.userId)) {
              return prev;
            }

            // Add new typing user
            const typingUser = {
              id: slackMessage.userId as string,
              name: slackMessage.sender,
            };

            // Auto-clear after 3 seconds
            setTimeout(() => {
              setSlackTypingUsers(prev => prev.filter(u => u.id !== slackMessage.userId));
            }, 3000);

            return [...prev, typingUser];
          });
        }

        // Add new message and sort
        const newMessages = [...prevMessages, slackMessage];
        const sortedMessages = newMessages.sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );

        console.log('🎯 NEW MESSAGES COUNT AFTER ADD:', sortedMessages.length);
        return sortedMessages;
      });
    };

    // Manually fetch Slack messages periodically to ensure we have the latest
    const fetchSlackMessages = async () => {
      if (!username) return;

      try {
        const response = await fetch(`/api/slack-chat?username=${encodeURIComponent(username)}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch Slack messages: ${response.status}`);
        }

        const data = await response.json();
        const slackMessages = data.messages || [];

        console.log(`Received ${slackMessages.length} messages for user ${username}`);

        // Merge with existing messages
        setMessages(prevMessages => {
          const existingIds = new Set(prevMessages.map(msg => msg.id));
          const newMessages = [...prevMessages];
          let hasNewMessages = false;

          slackMessages.forEach((msg: Message) => {
            // Only skip messages we're certain we sent ourselves
            const isCertainlyOurMessage =
              (msg.sender === username && sentMessageIds.has(msg.id)) ||
              (msg.id && slackTimestamps.has(msg.id));

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
            console.log('Added missing Slack message from API:', messageWithFlag);
          });

          if (!hasNewMessages) {
            return prevMessages;
          }

          return newMessages.sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
          );
        });
      } catch (error) {
        console.error('Error fetching Slack messages:', error);
      }
    };

    // Register all event handlers
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('welcome', onWelcome);
    socket.io.on('reconnect', onReconnect);
    socket.io.on('reconnect_attempt', onReconnectAttempt);
    socket.io.on('reconnect_error', onReconnectError);
    socket.io.on('reconnect_failed', onReconnectFailed);
    socket.on('chat_message', onChatMessage);
    socket.on('slack_message', onSlackMessage);
    socket.on('missed_messages_complete', (data: any) => {
      // Messages have been loaded
    });

    // When connected, double check for existing Slack messages
    socket.on('connect', () => {
      setTimeout(fetchSlackMessages, 1000);
    });

    // Set up periodic polling for Slack messages as a fallback
    const pollInterval = setInterval(fetchSlackMessages, 15000); // Poll every 15 seconds

    // Fetch initial data
    const fetchInitialMessages = async () => {
      if (!username) return;

      try {
        const response = await fetch(`/api/slack-chat?username=${encodeURIComponent(username)}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch initial messages: ${response.status}`);
        }

        const data = await response.json();
        const slackMessages = data.messages || [];

        console.log(`Fetched ${slackMessages.length} initial messages for user ${username}`);

        // Merge with existing messages
        setMessages(prevMessages => {
          const existingIds = new Set(prevMessages.map(msg => msg.id));
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
            console.log('Added initial Slack message:', messageWithFlag);
          });

          return newMessages.sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
          );
        });
      } catch (error) {
        console.error('Error fetching initial messages:', error);
      }
    };

    fetchInitialMessages();

    // Check if we're in socket mode or fallback mode
    const checkConnectionMode = () => {
      const usingSocket = isUsingSocketMode();
      setUsingFallbackMode(!usingSocket);
    };

    // Check initially and on reconnection attempts
    checkConnectionMode();
    socket.on('connect', () => {
      onConnect();
      checkConnectionMode();
    });

    socket.on('disconnect', reason => {
      onDisconnect(reason);
      checkConnectionMode();
    });

    // Listen for messages from the API polling fallback
    const handleApiMessages = (event: CustomEvent) => {
      if (!event.detail || !event.detail.messages) return;

      const apiMessages = event.detail.messages;

      setMessages(prevMessages => {
        const existingIds = new Set(prevMessages.map(msg => msg.id));
        const newMessages = [...prevMessages];

        apiMessages.forEach((msg: Message) => {
          // Skip if already in messages
          if (existingIds.has(msg.id)) {
            return;
          }

          // Ensure proper flags
          const messageWithFlags = {
            ...msg,
            isFromSlack: !!msg.isFromSlack,
          };

          newMessages.push(messageWithFlags);
        });

        return newMessages.sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
      });
    };

    // Register the event listener for API polling
    window.addEventListener('api_messages', handleApiMessages as EventListener);

    return () => {
      // Cleanup by removing all event listeners
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('welcome', onWelcome);
      socket.off('chat_message', onChatMessage);
      socket.off('slack_message', onSlackMessage);
      socket.off('missed_messages_complete');

      // Clear polling interval
      clearInterval(pollInterval);

      // Remove API polling event listener
      window.removeEventListener('api_messages', handleApiMessages as EventListener);

      // Track component unmount
      mounted.current = false;
    };
  }, [username]);

  // Clean up socket on component unmount
  useEffect(() => {
    return () => {
      disconnectSocket();
    };
  }, []);

  // Fetch user's dedicated channel
  const fetchUserChannel = async () => {
    if (!username) return;

    console.log('Fetching channel for user:', username);
    try {
      const response = await fetch(`/api/user-channel?username=${encodeURIComponent(username)}`);
      console.log('API response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('User channel API response:', data);

        if (data.channelId) {
          console.log('Setting userChannel state to:', data.channelId);
          setUserChannel(data.channelId);
          setUserChannelName(data.channelName || data.channelId);
          console.log('Updated userChannel state');
        } else {
          console.log('No channelId in response, not updating state');
        }
      } else {
        console.error('Failed to fetch user channel, status:', response.status);
      }
    } catch (error) {
      console.error('Error fetching user channel:', error);
    }
  };

  // Call this when username is set and when sending a message
  useEffect(() => {
    if (username) {
      fetchUserChannel();

      // Set up interval to periodically check for channel
      const channelCheckInterval = setInterval(fetchUserChannel, 10000);
      return () => clearInterval(channelCheckInterval);
    }
  }, [username]);

  // Add an effect to refetch channel after sending a message
  useEffect(() => {
    if (messages.length > 0 && username && !userChannel) {
      // If we have messages but no channel, try to fetch it
      console.log('Message detected but no channel, fetching channel');
      fetchUserChannel();
    }
  }, [messages, username, userChannel]);

  // Also fetch channel after sending a message
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
    setNewMessage('');

    // Create local message
    const localMessage: Message = {
      id: messageId,
      text: messageText,
      sender: username,
      timestamp: new Date().toISOString(),
      isFromSlack: false,
    };

    // Add message to local state immediately for better UX
    setMessages(prev => [...prev, localMessage]);

    try {
      // Try to send via socket first if we're in socket mode
      const socketSent = sendMessageViaSocket(localMessage);

      if (socketSent) {
        console.info('Message sent via socket');
        // Fetch channel after sending message
        setTimeout(fetchUserChannel, 2000);
        setIsLoading(false);
        return;
      }

      // Fallback to API call if socket is not available or failed
      console.info('Falling back to API call for sending message');

      const response = await fetch('/api/slack-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: messageText,
          sender: username,
          userId: 'user_' + messageId,
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
        setError(
          "Messages are only saved locally. The bot doesn't have permission to send to Slack.",
        );
      }

      if (!response.ok) {
        throw new Error('Failed to send message to Slack');
      }

      // Fetch channel after sending message
      setTimeout(fetchUserChannel, 2000);
    } catch (error) {
      console.error('Error sending message:', error);
      setError('Failed to send message to Slack, but your message is saved locally');
    } finally {
      if (mounted.current) {
        setIsLoading(false);
      }
    }
  };

  const handleSetUsername = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('📝 === HANDLE SET USERNAME CALLED ===');
    console.log('📝 Username entered:', username.trim());
    console.log('📝 Current selectedQuestion:', selectedQuestion);
    console.log('📝 Current messages length:', messages.length);

    if (username.trim()) {
      // Set flag that we're setting username
      setIsSettingUsername(false);
      console.log('📝 Set isSettingUsername to false');

      // Clear any old messages
      localStorage.setItem('chat-messages', '[]');
      console.log('📝 Cleared localStorage messages');

      console.log('📝 Username set, messages cleared for fresh start');

      // If there's a selected question, send it immediately to create channel
      if (selectedQuestion) {
        console.log('🚀 PROCESSING SELECTED QUESTION:', selectedQuestion);
        console.log('🚀 Username:', username);
        console.log('🚀 Current messages length:', messages.length);

        const messageId = Date.now().toString();
        const localMessage: Message = {
          id: messageId,
          text: selectedQuestion,
          sender: username,
          timestamp: new Date().toISOString(),
          isFromSlack: false,
        };

        console.log('🚀 Created local message object:', localMessage);

        // Add to sent messages tracking
        sentMessageIds.add(messageId);
        console.log('🚀 Added to sentMessageIds:', messageId);

        // Clear input field and add message to local state immediately for better UX
        setMessages([localMessage]);
        console.log('🚀 Added selected question to local messages');

        console.log('🚀 Sending selected question to create channel:', selectedQuestion);

        // Send the message using the same flow as regular messages
        const sendSelectedQuestion = async () => {
          console.log('🚀 Starting sendSelectedQuestion function...');
          setIsLoading(true);
          setError(null);

          try {
            // Try to send via socket first if we're in socket mode (same as regular messages)
            const socketSent = sendMessageViaSocket(localMessage);

            if (socketSent) {
              console.log('🚀 ✅ Selected question sent via socket');
              // Fetch channel after sending message
              setTimeout(fetchUserChannel, 2000);
              setIsLoading(false);
              setSelectedQuestion(null);
              return;
            }

            // Fallback to API call if socket is not available or failed
            console.log('🚀 Falling back to API call for selected question');

            const response = await fetch('/api/slack-chat', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                message: selectedQuestion,
                sender: username,
                userId: 'user_' + messageId,
                clientMessageId: messageId,
              }),
            });

            const data = await response.json();
            console.log('🚀 API response data:', data);

            // If message was sent to Slack, track the timestamp
            if (data.slackStatus?.success && data.slackStatus.slackTs) {
              slackTimestamps.add(data.slackStatus.slackTs);
              console.log('🚀 Added slack timestamp:', data.slackStatus.slackTs);
            }

            // Check for local-only mode
            if (data.localOnly) {
              setLocalModeOnly(true);
              setError(
                "Messages are only saved locally. The bot doesn't have permission to send to Slack.",
              );
            }

            if (!response.ok) {
              throw new Error('Failed to send selected question to Slack');
            }

            console.log('🚀 ✅ Selected question sent successfully via API');

            // Fetch channel after sending message
            setTimeout(fetchUserChannel, 2000);
          } catch (error) {
            console.error('🚀 ❌ Error sending selected question:', error);
            setError('Failed to send question to Slack, but your message is saved locally');
          } finally {
            if (mounted.current) {
              setIsLoading(false);
            }
            // Clear the selected question AFTER sending
            console.log('🚀 Clearing selectedQuestion...');
            setSelectedQuestion(null);
          }
        };

        // Send immediately
        console.log('🚀 Calling sendSelectedQuestion immediately...');
        sendSelectedQuestion();
      } else {
        console.log('🚀 No selected question, starting with empty messages');
        // No selected question, start with empty messages
        setMessages([]);
      }

      // Focus the message input after a short delay to ensure DOM is updated
      setTimeout(() => {
        messageInputRef.current?.focus();
      }, 200);
    }
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
  };

  // Add a status indicator for the connection mode
  const renderConnectionStatus = () => {
    const socketConnected = isSocketConnected();

    if (socketConnected) {
      return (
        <div className="flex items-center text-xs text-white">
          <div className="mr-1 h-1.5 w-1.5 rounded-full bg-green-400"></div>
          Live
        </div>
      );
    } else if (usingFallbackMode) {
      return (
        <div className="flex items-center text-xs text-white">
          <div className="mr-1 h-1.5 w-1.5 rounded-full bg-amber-400"></div>
          Polling
        </div>
      );
    } else {
      return (
        <div className="flex items-center text-xs text-white">
          <div className="mr-1 h-1.5 w-1.5 rounded-full bg-red-400"></div>
          Offline
        </div>
      );
    }
  };

  // Add function to delete user channel
  const handleDeleteChannel = async () => {
    if (deleteConfirmation !== username) {
      setError('Please enter your username correctly to confirm deletion');
      return;
    }

    setIsDeletingChannel(true);
    setError(null);
    setSuccessMessage('');

    try {
      const response = await fetch(
        `/api/user-channel?username=${encodeURIComponent(username)}&confirm=true`,
        {
          method: 'DELETE',
        },
      );

      const data = await response.json();

      if (response.ok && data.success) {
        // Show success message first so user knows the deletion was successful
        setSuccessMessage(
          'Your channel has been successfully deleted. You will be logged out in 3 seconds...',
        );

        // Clear channel info
        setUserChannel(null);
        setUserChannelName(null);
        setDeleteConfirmation('');
        setIsDeletingChannel(false);

        // Set a delay before logging out so the user can see the success message
        setTimeout(() => {
          // Clear username from localStorage
          localStorage.removeItem('chat-username');

          // Clear messages from localStorage
          localStorage.removeItem('chat-messages');

          // Ensure localStorage is empty by setting an empty array
          localStorage.setItem('chat-messages', '[]');

          // Disconnect from socket
          disconnectSocket();

          // Reset state
          setUsername('');
          setMessages([]);
          setUserChannel(null);
          setUserChannelName(null);
          setIsSettingUsername(true);
          sentMessageIds.clear();
          slackTimestamps.clear();
          setSuccessMessage('');
          setError(null);
          setIsConnected(false);
          setSelectedQuestion(null);

          console.log(
            'User logged out after channel deletion, cleared session data and disconnected socket',
          );
          setIsModalOpen(false);

          // Force reload to ensure clean state
          window.location.reload();
        }, 3000);
      } else {
        setError(data.error || 'Failed to delete channel');
        setIsDeletingChannel(false);
      }
    } catch (error) {
      console.error('Error deleting channel:', error);
      setError('An error occurred while trying to delete the channel');
      setIsDeletingChannel(false);
    }
  };

  // Handle logout confirmation
  const confirmLogout = () => {
    // Clear username from localStorage
    localStorage.removeItem('chat-username');

    // Clear messages from localStorage
    localStorage.removeItem('chat-messages');

    // Ensure localStorage is empty by setting an empty array
    localStorage.setItem('chat-messages', '[]');

    // Disconnect from socket
    disconnectSocket();

    // Reset state
    setUsername('');
    setMessages([]);
    setUserChannel(null);
    setUserChannelName(null);
    setIsSettingUsername(true);
    sentMessageIds.clear();
    slackTimestamps.clear();
    setSuccessMessage('');
    setError(null);
    setIsConnected(false);
    // selectedQuestion will be reset on page reload

    console.log('User logged out, cleared session data and disconnected socket');
    setIsLogoutModalOpen(false);

    // Force reload to ensure clean state
    window.location.reload();
  };

  // Reset channel information when username changes
  useEffect(() => {
    // Reset channel info when username changes
    setUserChannel(null);
    setUserChannelName(null);
    // DON'T reset selectedQuestion here - let it persist until message is sent
  }, [username]);

  // Focus message input when chat becomes available
  useEffect(() => {
    if (!isSettingUsername && messageInputRef.current) {
      setTimeout(() => {
        messageInputRef.current?.focus();
      }, 100);
    }
  }, [isSettingUsername]);

  // Debug message state changes
  useEffect(() => {
    console.log(
      '🎯 DEBUG - Messages state changed:',
      messages.length,
      'messages, selectedQuestion:',
      selectedQuestion,
    );
    console.log('🎯 DEBUG - Messages array:', messages);
    if (messages.length > 0) {
      console.log('🎯 DEBUG - First message:', messages[0]);
    }
  }, [messages, selectedQuestion]);

  // Handle clicking outside chat window to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (chatWindowRef.current && !chatWindowRef.current.contains(event.target as Node)) {
        setIsChatOpen(false);
      }
    };

    if (isChatOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isChatOpen]);

  // Toggle chat window
  const toggleChat = () => {
    setIsChatOpen(!isChatOpen);

    // Focus message input when opening chat (if not setting username)
    if (!isChatOpen && !isSettingUsername) {
      setTimeout(() => {
        messageInputRef.current?.focus();
      }, 100);
    }
  };

  // Close chat window
  const closeChat = () => {
    setIsChatOpen(false);
  };

  const handleQuestionClick = (question: string) => {
    console.log('🔥 === Question clicked ===');
    console.log('🔥 Question:', question);
    console.log('🔥 Current selectedQuestion before:', selectedQuestion);
    console.log('🔥 Current messages length before:', messages.length);
    console.log('🔥 Current isSettingUsername:', isSettingUsername);

    setSelectedQuestion(question);
    setIsChatOpen(true);

    console.log('🔥 Set selectedQuestion to:', question);
    console.log('🔥 Opened chat window');

    // Focus message input when opening chat (if not setting username)
    if (!isSettingUsername) {
      setTimeout(() => {
        messageInputRef.current?.focus();
      }, 100);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-100">
      <div className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <MessageSquare className="h-8 w-8 text-blue-600" />
              <h1 className="ml-3 text-2xl font-bold text-gray-900">- Chat App -</h1>
              {!isSettingUsername && localModeOnly && (
                <span className="ml-3 rounded-full bg-yellow-100 px-2 py-1 text-xs text-yellow-600">
                  Local Mode Only
                </span>
              )}
              {!isSettingUsername && (
                <span className="ml-3 rounded-full px-2 py-1 text-xs">
                  {renderConnectionStatus()}
                </span>
              )}
              {!isSettingUsername && userChannelName && (
                <span className="ml-3 rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-600">
                  Slack Channel: {userChannelName}
                </span>
              )}
            </div>
            {!isSettingUsername && (
              <div className="flex items-center space-x-3">
                {userChannel ? (
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-md transition-colors hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="mr-1 h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                    Delete Channel
                  </button>
                ) : (
                  <span className="text-sm text-gray-400">No channel created yet</span>
                )}
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-500">Logged in as {username}</span>
                  <button
                    onClick={() => setIsLogoutModalOpen(true)}
                    className="ml-2 flex items-center rounded-md bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-300 focus:ring-2 focus:ring-gray-400 focus:outline-none"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="mr-1 h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                      />
                    </svg>
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chatbot Window - Fixed position bottom right */}
      {isChatOpen && (
        <div className="fixed right-4 bottom-[36px] z-40" ref={chatWindowRef}>
          <div className="flex h-[485px] w-[405px] flex-col border border-gray-200 bg-white shadow-2xl">
            {isSettingUsername ? (
              <div className="flex h-full items-center justify-center p-6">
                <div className="w-full text-center">
                  <MessageSquare className="mx-auto mb-3 h-8 w-8 text-blue-600" />
                  <h2 className="mb-2 text-lg font-bold text-gray-900">Welcome to Chat</h2>
                  <p className="mb-4 text-sm text-gray-600">Enter your username to start</p>

                  <form onSubmit={handleSetUsername} className="space-y-3">
                    <div>
                      <input
                        type="text"
                        id="username"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        placeholder="Enter your username"
                        autoFocus
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!username.trim()}
                      className="flex w-full cursor-pointer items-center justify-center rounded-lg border border-transparent bg-[#262525] px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Start Chatting
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              <>
                {/* Chat Header - Clickable to close */}
                <div
                  className="cursor-pointer bg-[#262525] px-4 py-3 text-white transition-colors"
                  onClick={closeChat}
                  title="Click to close chat"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <MessageSquare className="mr-2 h-5 w-5" />
                      <span className="text-sm font-medium">Chat</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      {renderConnectionStatus()}
                      <span className="text-xs font-bold opacity-75">___</span>
                    </div>
                  </div>
                </div>

                {/* Messages Area */}
                <div className="flex-1 space-y-2 overflow-y-auto bg-gray-50 p-3">
                  {error && (
                    <div
                      className="relative rounded border border-yellow-200 bg-yellow-50 px-2 py-1 text-xs text-yellow-700"
                      role="alert"
                    >
                      <span className="block">{error}</span>
                    </div>
                  )}

                  {successMessage && (
                    <div className="relative rounded border border-green-200 bg-green-50 px-2 py-1 text-xs text-green-800">
                      <span className="block">{successMessage}</span>
                    </div>
                  )}

                  {messages.map(message => {
                    // Debug log for message rendering
                    console.log(
                      `🎨 RENDERING message - id: ${message.id}, from: ${message.sender}, text: "${message.text}", isFromSlack: ${message.isFromSlack}`,
                    );

                    return (
                      <div
                        key={message.id}
                        className={`flex ${message.sender === username ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`message-bubble max-w-xs rounded-lg px-3 py-2 text-xs shadow-sm ${
                            message.sender === username
                              ? 'bg-blue-600 text-white'
                              : message.isFromSlack
                                ? 'border border-green-200 bg-green-100 text-gray-900'
                                : 'border border-gray-200 bg-white text-gray-900'
                          }`}
                        >
                          <div className="mb-1 text-xs font-medium">
                            {message.sender}
                            {message.isFromSlack && (
                              <span className="ml-1 rounded bg-green-200 px-1 text-xs text-green-800">
                                Slack
                              </span>
                            )}
                            <span className="ml-1 text-xs opacity-75">
                              {formatDistanceToNow(new Date(message.timestamp), {
                                addSuffix: true,
                              })}
                            </span>
                          </div>
                          <p className="text-xs break-words whitespace-pre-wrap">{message.text}</p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input Section */}
                <form onSubmit={handleSendMessage} className="rounded-b-lg border-t bg-white p-3">
                  <div className="flex space-x-2">
                    <input
                      ref={messageInputRef}
                      type="text"
                      value={newMessage}
                      onChange={handleInputChange}
                      placeholder="Ask anything here"
                      className="flex-1 rounded-full border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:ring-1 focus:outline-none"
                      disabled={isLoading}
                      //disabled={isLoading || !isConnected}
                    />
                    <button
                      type="submit"
                      disabled={isLoading || !newMessage.trim()}
                      //disabled={isLoading || !newMessage.trim() || !isConnected}
                      className="inline-flex cursor-pointer items-center justify-center text-white transition-colors duration-200 focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                      title="Send message"
                    >
                      <img src="/images/icons/arrowUp.svg" alt="Send" className="h-10 w-10" />
                    </button>
                  </div>
                  {slackTypingUsers.length > 0 && (
                    <div className="mt-2 text-xs text-green-600">
                      <span className="inline-block">
                        <span className="typing-dot-chat">•</span>
                        <span className="typing-dot-chat">•</span>
                        <span className="typing-dot-chat">•</span>
                      </span>
                      <span className="ml-1">
                        {slackTypingUsers.length === 1
                          ? `${slackTypingUsers[0].name} is typing...`
                          : `${slackTypingUsers.length} people are typing...`}
                      </span>
                    </div>
                  )}
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* Chat Trigger Bar - Fixed at bottom of screen with sliding animation */}
      <div className="fixed right-0 bottom-0 left-0 z-30">
        <div className="font-founders h-[36px] overflow-hidden bg-[#262525]">
          <div className="sliding-questions flex h-full items-center text-[22px] font-light whitespace-nowrap">
            {/* First set of questions */}
            <div
              className="inline-flex flex-shrink-0 cursor-pointer items-center px-6 text-center transition-colors hover:bg-gray-800"
              onClick={() => handleQuestionClick('Can you tell me more about Studio Graphene?')}
            >
              <span className="text-[22px]">Can you tell me more about Studio Graphene?</span>
            </div>
            <div className="mx-4 flex items-center">
              <div className="flex h-6 w-6 items-center justify-center rounded-full">
                <img src="/images/icons/blue.svg" alt="separator" className="h-4 w-4" />
              </div>
            </div>
            <div
              className="inline-flex flex-shrink-0 cursor-pointer items-center px-6 text-center transition-colors hover:bg-gray-800"
              onClick={() => handleQuestionClick('What AI services do you currently offer?')}
            >
              <span className="text-[22px]">What AI services do you currently offer?</span>
            </div>
            <div className="mx-4 flex items-center">
              <div className="flex h-6 w-6 items-center justify-center rounded-full">
                <img src="/images/icons/green.svg" alt="separator" className="h-4 w-4" />
              </div>
            </div>
            <div
              className="inline-flex flex-shrink-0 cursor-pointer items-center px-6 text-center transition-colors hover:bg-gray-800"
              onClick={() => handleQuestionClick('What technologies do you use?')}
            >
              <span className="text-[22px]">What technologies do you use?</span>
            </div>
            <div className="mx-4 flex items-center">
              <div className="flex h-6 w-6 items-center justify-center rounded-full">
                <img src="/images/icons/yellow.svg" alt="separator" className="h-4 w-4" />
              </div>
            </div>

            {/* Duplicate set for seamless looping */}
            <div
              className="inline-flex flex-shrink-0 cursor-pointer items-center px-6 text-center transition-colors hover:bg-gray-800"
              onClick={() => handleQuestionClick('Can you tell me more about Studio Graphene?')}
            >
              <span className="text-[22px]">Can you tell me more about Studio Graphene?</span>
            </div>
            <div className="mx-4 flex items-center">
              <div className="flex h-6 w-6 items-center justify-center rounded-full">
                <img src="/images/icons/pink.svg" alt="separator" className="h-4 w-4" />
              </div>
            </div>
            <div
              className="inline-flex flex-shrink-0 cursor-pointer items-center px-6 text-center transition-colors hover:bg-gray-800"
              onClick={() => handleQuestionClick('What AI services do you currently offer?')}
            >
              <span className="text-[22px]">What AI services do you currently offer?</span>
            </div>
            <div className="mx-4 flex items-center">
              <div className="flex h-6 w-6 items-center justify-center rounded-full">
                <img src="/images/icons/blue.svg" alt="separator" className="h-4 w-4" />
              </div>
            </div>
            <div
              className="inline-flex flex-shrink-0 cursor-pointer items-center px-6 text-center transition-colors hover:bg-gray-800"
              onClick={() => handleQuestionClick('What technologies do you use?')}
            >
              <span className="text-[22px]">What technologies do you use?</span>
            </div>
            <div className="mx-4 flex items-center">
              <div className="flex h-6 w-6 items-center justify-center rounded-full">
                <img src="/images/icons/green.svg" alt="separator" className="h-4 w-4" />
              </div>
            </div>

            {/* Third set for extra seamless looping */}
            <div
              className="inline-flex flex-shrink-0 cursor-pointer items-center px-6 text-center transition-colors hover:bg-gray-800"
              onClick={() => handleQuestionClick('Can you tell me more about Studio Graphene?')}
            >
              <span className="text-[22px]">Can you tell me more about Studio Graphene?</span>
            </div>
            <div className="mx-4 flex items-center">
              <div className="flex h-6 w-6 items-center justify-center rounded-full">
                <img src="/images/icons/yellow.svg" alt="separator" className="h-4 w-4" />
              </div>
            </div>
            <div
              className="inline-flex flex-shrink-0 cursor-pointer items-center px-6 text-center transition-colors hover:bg-gray-800"
              onClick={() => handleQuestionClick('What AI services do you currently offer?')}
            >
              <span className="text-[22px]">What AI services do you currently offer?</span>
            </div>
            <div className="mx-4 flex items-center">
              <div className="flex h-6 w-6 items-center justify-center rounded-full">
                <img src="/images/icons/pink.svg" alt="separator" className="h-4 w-4" />
              </div>
            </div>
            <div
              className="inline-flex flex-shrink-0 cursor-pointer items-center px-6 text-center transition-colors hover:bg-gray-800"
              onClick={() => handleQuestionClick('What technologies do you use?')}
            >
              <span className="text-[22px]">What technologies do you use?</span>
            </div>
          </div>
        </div>
      </div>

      {/* Socket Debug Component */}
      <SocketDebug />

      {/* Delete Channel Modal */}
      {isModalOpen && (
        <div className="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-[#262525]">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <h3 className="mb-4 text-lg font-bold text-red-600">Delete Channel Confirmation</h3>
            <p className="mb-4">
              Are you sure you want to delete your Slack channel? This action cannot be undone.
            </p>
            <p className="mb-2 text-sm text-gray-600">
              <strong>Important:</strong> Deleting your channel will also log you out of the
              application.
            </p>
            <p className="mb-4 text-sm text-gray-600">
              Please type your username <strong>{username}</strong> to confirm deletion:
            </p>
            <input
              type="text"
              value={deleteConfirmation}
              onChange={e => setDeleteConfirmation(e.target.value)}
              className="mb-4 w-full rounded border border-gray-300 p-2"
              placeholder="Enter your username to confirm"
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setDeleteConfirmation('');
                }}
                className="rounded bg-gray-300 px-4 py-2 hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteChannel}
                disabled={isDeletingChannel || deleteConfirmation !== username}
                className="rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600 disabled:bg-red-300"
              >
                {isDeletingChannel ? 'Deleting...' : 'Confirm Delete & Logout'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {isLogoutModalOpen && (
        <div className="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-[#262525]">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <h3 className="mb-4 text-lg font-bold text-gray-700">Confirm Logout</h3>
            <p className="mb-6">
              Are you sure you want to log out? This will clear your message history and you&apos;ll
              need to enter your username again to continue.
            </p>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setIsLogoutModalOpen(false)}
                className="rounded bg-gray-300 px-4 py-2 hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={confirmLogout}
                className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
              >
                Confirm Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
