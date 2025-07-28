'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, MessageSquare, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Image from 'next/image';
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
  const [email, setEmail] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('chat-email') || '';
    }
    return '';
  });
  const [isSettingUsername, setIsSettingUsername] = useState(!username || !email);
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
  // Add state to track if user has started chatting (to hide Chat Trigger Bar)
  const [hasStartedChatting, setHasStartedChatting] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('has-started-chatting') === 'true';
    }
    return false;
  });
  // Add state for chat minimize functionality
  const [isChatMinimized, setIsChatMinimized] = useState(false);
  // Add state for unread messages count
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  // Track which messages have already been counted for unread notifications
  const [countedUnreadMessages] = useState<Set<string>>(new Set());

  // Add state for selected question
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);

  // Reference to track if component is mounted
  const mounted = useRef(true);
  // Reference for chat window to detect outside clicks
  const chatWindowRef = useRef<HTMLDivElement>(null);
  // Refs to access current state values in event handlers without causing re-runs
  const isChatMinimizedRef = useRef(isChatMinimized);
  const userChannelRef = useRef(userChannel);

  // Update refs when state changes
  useEffect(() => {
    isChatMinimizedRef.current = isChatMinimized;
  }, [isChatMinimized]);

  useEffect(() => {
    userChannelRef.current = userChannel;
  }, [userChannel]);

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
    localStorage.setItem('chat-email', email);
  }, [email]);

  // Sync hasStartedChatting state with localStorage
  useEffect(() => {
    localStorage.setItem('has-started-chatting', hasStartedChatting.toString());
  }, [hasStartedChatting]);

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
        (userChannelRef.current && message.channelId === userChannelRef.current) ||
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

        // Increment unread count if chat is minimized and message is not from current user
        if (
          isChatMinimizedRef.current &&
          message.sender !== username &&
          !countedUnreadMessages.has(message.id)
        ) {
          console.log(
            `📢 Incrementing unread count for message from ${message.sender}, chat minimized: ${isChatMinimizedRef.current}`,
          );
          countedUnreadMessages.add(message.id);
          setUnreadMessagesCount(prev => {
            const newCount = prev + 1;
            console.log(`📢 Unread count: ${prev} -> ${newCount}`);
            return newCount;
          });
        }

        // Add new message and sort
        const newMessages = [...prevMessages, message];
        return newMessages.sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
      });
    };

    // Handle Slack messages
    const onSlackMessage = (message: Message) => {
      console.log('🔄 Received slack message:', message);
      setMessages(prev => {
        const exists = prev.some(msg => msg.id === message.id);
        if (!exists) {
          // Increment unread count if chat is minimized and message is not from current user
          if (
            isChatMinimizedRef.current &&
            message.sender !== username &&
            !countedUnreadMessages.has(message.id)
          ) {
            console.log(
              `📢 [Slack] Incrementing unread count for message from ${message.sender}, chat minimized: ${isChatMinimizedRef.current}`,
            );
            countedUnreadMessages.add(message.id);
            setUnreadMessagesCount(prevCount => {
              const newCount = prevCount + 1;
              console.log(`📢 [Slack] Unread count: ${prevCount} -> ${newCount}`);
              return newCount;
            });
          }
          return [...prev, message];
        }
        return prev;
      });
    };

    // Manually fetch Slack messages periodically to ensure we have the latest
    const fetchSlackMessages = async () => {
      if (!username || !email) return;

      try {
        const response = await fetch(
          `/api/slack-chat?username=${encodeURIComponent(username)}&email=${encodeURIComponent(email)}`,
        );

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
          let newUnreadCount = 0;

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

            // Count new messages from others for unread notification
            if (
              isChatMinimizedRef.current &&
              msg.sender !== username &&
              !countedUnreadMessages.has(msg.id)
            ) {
              countedUnreadMessages.add(msg.id);
              newUnreadCount++;
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

          // Update unread count if there are new messages and chat is minimized
          if (newUnreadCount > 0) {
            setUnreadMessagesCount(prev => prev + newUnreadCount);
          }

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
      if (!username || !email) return;

      try {
        const response = await fetch(
          `/api/slack-chat?username=${encodeURIComponent(username)}&email=${encodeURIComponent(email)}`,
        );

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
  }, [username, email]);

  // Clean up socket on component unmount
  useEffect(() => {
    return () => {
      disconnectSocket();
    };
  }, []);

  // Fetch user's dedicated channel
  const fetchUserChannel = async () => {
    if (!username || !email) return;

    console.log('Fetching channel for user:', username, 'with email:', email);
    try {
      const response = await fetch(
        `/api/user-channel?username=${encodeURIComponent(username)}&email=${encodeURIComponent(email)}`,
      );
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
    if (username && email) {
      fetchUserChannel();

      // Set up interval to periodically check for channel
      const channelCheckInterval = setInterval(fetchUserChannel, 10000);
      return () => clearInterval(channelCheckInterval);
    }
  }, [username, email]);

  // Add an effect to refetch channel after sending a message
  useEffect(() => {
    if (messages.length > 0 && username && email && !userChannel) {
      // If we have messages but no channel, try to fetch it
      console.log('Message detected but no channel, fetching channel');
      fetchUserChannel();
    }
  }, [messages, username, email, userChannel]);

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
      email: email,
      timestamp: new Date().toISOString(),
      isFromSlack: false,
    };

    console.log('🔥 FRONTEND: Created localMessage object:', {
      id: localMessage.id,
      sender: localMessage.sender,
      email: localMessage.email,
      text: localMessage.text.substring(0, 50) + '...',
      hasEmail: !!localMessage.email,
      hasUsername: !!localMessage.sender,
      allKeys: Object.keys(localMessage),
    });

    // Add message to local state immediately for better UX
    setMessages(prev => [...prev, localMessage]);

    try {
      // Try to send via socket first if we're in socket mode
      const socketSent = sendMessageViaSocket(localMessage);

      console.log('🔥 FRONTEND: Socket send result:', socketSent);

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
          email: email,
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
    console.log('📝 Email entered:', email.trim());
    console.log('📝 Current selectedQuestion:', selectedQuestion);
    console.log('📝 Current messages length:', messages.length);

    if (username.trim() && email.trim()) {
      // Set flag that we're setting username
      setIsSettingUsername(false);
      // Set flag that user has started chatting (for localStorage persistence)
      setHasStartedChatting(true);
      console.log('📝 Set isSettingUsername to false');
      console.log('📝 Set hasStartedChatting to true');

      // Clear any old messages
      localStorage.setItem('chat-messages', '[]');
      console.log('📝 Cleared localStorage messages');

      console.log('📝 Username and email set, messages cleared for fresh start');

      // If there's a selected question, send it immediately to create channel
      if (selectedQuestion) {
        console.log('🚀 PROCESSING SELECTED QUESTION:', selectedQuestion);
        console.log('🚀 Username:', username);
        console.log('🚀 Email:', email);
        console.log('🚀 Current messages length:', messages.length);

        const messageId = Date.now().toString();
        const localMessage: Message = {
          id: messageId,
          text: selectedQuestion,
          sender: username,
          email: email,
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
                email: email,
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

    if (socketConnected && username && !isChatMinimized) {
      return (
        <div className="flex items-center text-xs font-bold text-green-400">
          <div className="mr-1 h-1.5 w-1.5 rounded-full bg-green-400"></div>
          Live
        </div>
      );
    } else if (usingFallbackMode && !isChatMinimized) {
      return (
        <div className="flex items-center text-xs font-bold text-white">
          <div className="mr-1 h-1.5 w-1.5 rounded-full bg-amber-400"></div>
          Polling
        </div>
      );
    } else {
      return (
        <div className="flex items-center text-xs font-bold text-white">
          {/* <div className="mr-1 h-1.5 w-1.5 rounded-full bg-red-400"></div>
          Offline */}
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
        `/api/user-channel?username=${encodeURIComponent(username)}&email=${encodeURIComponent(email)}&confirm=true`,
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
          localStorage.removeItem('chat-email');

          // Clear messages from localStorage
          localStorage.removeItem('chat-messages');

          // Ensure localStorage is empty by setting an empty array
          localStorage.setItem('chat-messages', '[]');

          // Disconnect from socket
          disconnectSocket();

          // Reset state
          setUsername('');
          setEmail('');
          setMessages([]);
          setUserChannel(null);
          setUserChannelName(null);
          setIsSettingUsername(true);
          setIsChatOpen(false);
          setIsChatMinimized(false);
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
    localStorage.removeItem('chat-email');
    localStorage.removeItem('chat-messages');
    localStorage.removeItem('has-started-chatting');

    // Disconnect socket
    disconnectSocket();

    // Reset states
    setUsername('');
    setEmail('');
    setMessages([]);
    setUserChannel(null);
    setUserChannelName(null);
    setIsSettingUsername(true);
    setHasStartedChatting(false);
    setIsChatOpen(false);
    setIsChatMinimized(false);
    setUnreadMessagesCount(0);
    countedUnreadMessages.clear(); // Clear tracked message IDs
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
  }, [username, email]);

  // Focus message input when chat becomes available
  useEffect(() => {
    if (!isSettingUsername && messageInputRef.current) {
      setTimeout(() => {
        messageInputRef.current?.focus();
      }, 100);
    }
  }, [isSettingUsername]);

  // Debug notification widget
  useEffect(() => {
    console.log(
      `📢 Notification widget check: isChatMinimized=${isChatMinimized}, unreadMessagesCount=${unreadMessagesCount}, should show=${isChatMinimized && unreadMessagesCount > 0}`,
    );
  }, [isChatMinimized, unreadMessagesCount]);

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

    // Reset minimized state when opening chat
    if (!isChatOpen) {
      setIsChatMinimized(false);
      setUnreadMessagesCount(0); // Reset unread messages when opening chat
      countedUnreadMessages.clear(); // Clear tracked message IDs
    }

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
    setIsChatMinimized(false);
  };

  // Minimize chat window (show only header)
  const minimizeChat = () => {
    setIsChatMinimized(true);
  };

  // Restore chat window from minimized state
  const restoreChat = () => {
    console.log(`📢 Restoring chat, resetting unread count from ${unreadMessagesCount} to 0`);
    setIsChatMinimized(false);
    setUnreadMessagesCount(0); // Reset unread messages when chat is opened
    countedUnreadMessages.clear(); // Clear tracked message IDs
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
                <span className="mr-auto ml-3 rounded-full px-2 py-1 text-xs">
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
                    className="flex cursor-pointer items-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-md transition-colors hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none"
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
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chatbot Window - Fixed position bottom right */}
      {isChatOpen && (
        <div
          ref={chatWindowRef}
          className={`fixed right-5 z-40 ${isChatMinimized ? 'bottom-0' : 'bottom-5'}`}
        >
          <div
            className={`flex ${isChatMinimized ? 'h-auto' : 'h-[485px]'} w-[405px] flex-col border border-gray-200 bg-white shadow-2xl`}
          >
            <div
              className="h-[42px] cursor-pointer rounded-t-[12px] bg-black px-4 py-3 text-white transition-colors"
              title={isChatMinimized ? 'Click to restore chat' : 'Click to close chat'}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <span className="mr-2 text-sm font-bold">Studio Graphene</span>
                  {isChatMinimized && unreadMessagesCount > 0 && (
                    <div className="mr-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
                      {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
                    </div>
                  )}
                  {renderConnectionStatus()}
                </div>
                <div className="flex justify-between space-x-2">
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      isChatMinimized ? restoreChat() : minimizeChat();
                    }}
                    className={`cursor-pointer text-xs opacity-75 transition-opacity hover:opacity-100 ${!isChatMinimized ? 'mt-2' : ''}`}
                    title={isChatMinimized ? 'Expand chat' : 'Minimize chat'}
                  >
                    <Image
                      src={
                        isChatMinimized
                          ? '/images/icons/explandChatIconArrow.svg'
                          : '/images/icons/reduceIcon.svg'
                      }
                      alt={isChatMinimized ? 'expand' : 'minimize'}
                      width={16}
                      height={16}
                      className="h-3.5 w-3.5"
                    />
                  </button>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      setIsLogoutModalOpen(true);
                    }}
                    className="cursor-pointer text-xs font-bold opacity-75 transition-opacity hover:opacity-100"
                    title="Logout"
                  >
                    <Image
                      src="/images/icons/closeIcon.svg"
                      alt="close"
                      width={16}
                      height={16}
                      className="h-3.5 w-3.5"
                    />
                  </button>
                </div>
              </div>
            </div>
            {!isChatMinimized && (
              <>
                {isSettingUsername ? (
                  <div className="flex h-full items-center justify-between rounded-b-[12px] bg-[#262525] p-6">
                    <div className="h-full w-full text-start">
                      <h2 className="mb-2 text-lg font-bold">Let&apos;s dive in!</h2>
                      <p className="t mb-4 w-[266px] text-[40px] leading-[32px]">
                        Share your details to kick things off.
                      </p>

                      <form onSubmit={handleSetUsername} className="mt-[78px] space-y-3">
                        <div>
                          <label
                            htmlFor="username"
                            className="mb-2 block text-left text-[12px] font-bold"
                          >
                            Username
                          </label>
                          <input
                            type="text"
                            id="username"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            className="block w-full rounded-lg border border-gray-300 !bg-[#262525] px-3 py-2 text-sm !text-white placeholder-[#ffffff7a] shadow-sm transition-colors focus:outline-none"
                            placeholder="Enter your username"
                            autoFocus
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="email"
                            className="mb-2 block text-left text-[12px] font-bold"
                          >
                            Email
                          </label>
                          <input
                            type="email"
                            id="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            className="block w-full rounded-lg border border-gray-300 !bg-[#262525] px-3 py-2 text-sm !text-white placeholder-[#ffffff7a] shadow-sm transition-colors focus:outline-none"
                            placeholder="Enter your email"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={!username.trim() || !email.trim()}
                          className="relative flex max-h-[40px] w-full cursor-pointer items-center justify-end focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <div className="text-md flex h-[40px] items-center rounded-full bg-white px-6 py-3 font-bold text-black shadow-sm">
                            send
                          </div>
                          <Image
                            src="/images/icons/redArrowRight.svg"
                            alt="send arrow"
                            width={40}
                            height={40}
                          />
                        </button>
                      </form>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Messages Area */}
                    <div className="relative flex-1 space-y-2 overflow-y-auto bg-[#262525] p-3">
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

                      {/* Logout Modal - Inside Chat Window */}
                      {isLogoutModalOpen && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#05050599]">
                          <div className="relative flex h-[260px] w-[310px] flex-col rounded-lg bg-white p-5 shadow-lg">
                            <button
                              onClick={() => setIsLogoutModalOpen(false)}
                              className="absolute top-2 right-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-gray-500"
                            >
                              <Image
                                src="/images/icons/closeIconBlack.svg"
                                alt="close"
                                width={16}
                                height={16}
                                className="h-3.5 w-3.5"
                              />
                            </button>
                            <div className="mt-auto flex flex-col justify-between">
                              <h3 className="mt-6 mb-3 text-[36px] leading-[32px] !font-[200] tracking-[0] text-gray-700">
                                Do you want to close the chat?
                              </h3>
                              <p className="mr-4 mb-4 text-xs text-gray-600">
                                If you leave now any messages exchanged during your absence will be
                                lost when you come back to the chat.
                              </p>
                              <div className="mt-[15px] flex space-x-2">
                                <button
                                  onClick={confirmLogout}
                                  className="h-[40px] w-full cursor-pointer rounded-full bg-black px-3 py-1 text-[20px] font-bold text-white"
                                >
                                  close chat
                                </button>
                              </div>
                            </div>
                          </div>
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
                            {message.sender !== username && (
                              <div className="flex-shrink-0">
                                <Image
                                  src="/images/sgLogo.svg"
                                  alt="Studio Graphene Logo"
                                  width={32}
                                  height={32}
                                  className="h-8 w-8"
                                />
                              </div>
                            )}
                            <div
                              className={`message-bubble max-w-xs px-3 py-2 text-xs shadow-sm ${
                                message.sender === username
                                  ? 'rounded-tl-[20px] rounded-tr-[2px] rounded-br-[20px] rounded-bl-[20px] bg-blue-600 text-white'
                                  : message.isFromSlack
                                    ? 'rounded-tl-[2px] rounded-tr-[20px] rounded-br-[20px] rounded-bl-[20px] bg-[#454545] text-white'
                                    : 'rounded-tl-[2px] rounded-tr-[20px] rounded-br-[20px] rounded-bl-[20px] border border-gray-200 bg-white text-gray-900'
                              }`}
                            >
                              <div className="mb-1 text-xs font-medium">
                                {/* {message.sender} */}
                                {/* {message.isFromSlack && (
                                  <span className="ml-1 rounded bg-green-200 px-1 text-xs text-green-800">
                                    Slack
                                  </span>
                                )} */}
                                <span className="text-xs opacity-75">
                                  {formatDistanceToNow(new Date(message.timestamp), {
                                    addSuffix: true,
                                  })}
                                </span>
                              </div>
                              <p className="text-xs break-words whitespace-pre-wrap">
                                {message.text}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Input Section */}
                    <form
                      onSubmit={handleSendMessage}
                      className="rounded-b-lg bg-[#262525] p-5 pb-6"
                    >
                      <div className="flex space-x-2">
                        <input
                          ref={messageInputRef}
                          type="text"
                          value={newMessage}
                          onChange={handleInputChange}
                          placeholder="Ask anything here"
                          className="mr-0 flex-1 rounded-full border border-white !bg-transparent px-3 py-2 text-sm !text-white placeholder-white shadow-sm focus:ring-1 focus:outline-none"
                          disabled={isLoading}
                          //disabled={isLoading || !isConnected}
                        />
                        <div className="flex items-center space-x-2">
                          {/* <button
                            onClick={handleSendMessage}
                            disabled={isLoading || !newMessage.trim()}
                            //disabled={isLoading || !newMessage.trim() || !isConnected}
                            className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300"
                          >
                            {isLoading ? 'Sending...' : 'Send'}
                          </button> */}
                          <button
                            onClick={handleSendMessage}
                            disabled={isLoading || !newMessage.trim()}
                            className="relative flex max-h-[40px] w-full cursor-pointer items-center justify-end focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Image
                              src="/images/icons/redArrowRight.svg"
                              alt="send arrow"
                              width={40}
                              height={40}
                              className="rotate-270"
                            />
                          </button>
                        </div>
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
              </>
            )}
          </div>
        </div>
      )}

      {/* Chat Trigger Bar - Fixed at bottom of screen with sliding animation */}
      {!isChatOpen && (
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
                  <Image
                    src="/images/icons/blue.svg"
                    alt="separator"
                    className="h-4 w-4"
                    width={16}
                    height={16}
                  />
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
                  <Image
                    src="/images/icons/green.svg"
                    alt="separator"
                    className="h-4 w-4"
                    width={16}
                    height={16}
                  />
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
                  <Image
                    src="/images/icons/yellow.svg"
                    alt="separator"
                    className="h-4 w-4"
                    width={16}
                    height={16}
                  />
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
                  <Image
                    src="/images/icons/pink.svg"
                    alt="separator"
                    className="h-4 w-4"
                    width={16}
                    height={16}
                  />
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
                  <Image
                    src="/images/icons/blue.svg"
                    alt="separator"
                    className="h-4 w-4"
                    width={16}
                    height={16}
                  />
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
                  <Image
                    src="/images/icons/green.svg"
                    alt="separator"
                    className="h-4 w-4"
                    width={16}
                    height={16}
                  />
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
                  <Image
                    src="/images/icons/yellow.svg"
                    alt="separator"
                    className="h-4 w-4"
                    width={16}
                    height={16}
                  />
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
                  <Image
                    src="/images/icons/pink.svg"
                    alt="separator"
                    className="h-4 w-4"
                    width={16}
                    height={16}
                  />
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
      )}

      {/* Socket Debug Component */}
      <SocketDebug />

      {/* Delete Channel Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#05050599]">
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
    </div>
  );
}
