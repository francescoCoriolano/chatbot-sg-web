'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, MessageSquare, X } from 'lucide-react';
import Image from 'next/image';
import { Message } from '@/types';
import { disconnectSocket, isSocketConnected } from '@/utils/socket';
import { Socket } from 'socket.io-client';
import SocketDebug from '@/components/SocketDebug';

// Imported components
import { AppHeader } from '@/components/AppHeader';
import { QuestionBar } from '@/components/QuestionBar';
import { DeleteChannelModal } from '@/components/modals/DeleteChannelModal';
import { ChatWindow } from '@/components/chat/ChatWindow';

// Import the useSocket hook
import { useSocket } from '@/hooks/useSocket';

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
  const [localModeOnly, setLocalModeOnly] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const [slackTypingUsers, setSlackTypingUsers] = useState<TypingUser[]>([]);

  // Track message IDs sent by this client to prevent duplicates from Slack polling
  const [sentMessageIds] = useState<Set<string>>(new Set());
  // Track Slack timestamps for messages we've sent
  const [slackTimestamps] = useState<Set<string>>(new Set());
  // User's dedicated Slack channel
  const [userChannel, setUserChannel] = useState<string | null>(null);
  const [userChannelName, setUserChannelName] = useState<string | null>(null);
  // Add state for channel deletion
  const [isDeletingChannel, setIsDeletingChannel] = useState<boolean>(false);
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

  // Use the socket hook
  const {
    isConnected,
    usingFallbackMode,
    error: socketError,
    sendMessage: sendSocketMessage,
    onChatMessage,
    onSlackMessage,
  } = useSocket(username, email);

  // Combine socket error with local error
  const [localError, setLocalError] = useState<string | null>(null);
  const error = socketError || localError;
  const setError = setLocalError;

  // Update refs when state changes
  useEffect(() => {
    isChatMinimizedRef.current = isChatMinimized;
  }, [isChatMinimized]);

  useEffect(() => {
    userChannelRef.current = userChannel;
  }, [userChannel]);

  // Setup message handlers for the socket hook
  useEffect(() => {
    // Handle new messages from the server
    onChatMessage((message: Message) => {
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
    });

    // Handle Slack messages
    onSlackMessage((message: Message) => {
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
    });
  }, [username, onChatMessage, onSlackMessage]);

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

  // Setup message fetching and polling (socket connection is handled by useSocket hook)
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
      const socketSent = sendSocketMessage(localMessage);

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

  const handleSetUsername = (username: string, email: string) => {
    console.log('📝 === HANDLE SET USERNAME CALLED ===');
    console.log('📝 Username entered:', username);
    console.log('📝 Email entered:', email);
    console.log('📝 Current selectedQuestion:', selectedQuestion);
    console.log('📝 Current messages length:', messages.length);

    if (username.trim() && email.trim()) {
      // Update state
      setUsername(username);
      setEmail(email);
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
            const socketSent = sendSocketMessage(localMessage);

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

  // Add function to delete user channel
  const handleDeleteChannel = async (confirmationText: string) => {
    if (confirmationText !== username) {
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
          // setIsConnected(false); // This is now handled by useSocket
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
    // setIsConnected(false); // This is now handled by useSocket
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

  // Get connection status for header
  const getConnectionStatus = (): 'live' | 'polling' | 'offline' => {
    const socketConnected = isSocketConnected();

    if (socketConnected && username && !isChatMinimized) {
      return 'live';
    } else if (usingFallbackMode && !isChatMinimized) {
      return 'polling';
    } else {
      return 'offline';
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-100">
      <AppHeader
        username={username}
        isSettingUsername={isSettingUsername}
        localModeOnly={localModeOnly}
        userChannel={userChannel}
        userChannelName={userChannelName}
        connectionStatus={getConnectionStatus()}
        onDeleteChannel={() => setIsModalOpen(true)}
      />

      {/* Chatbot Window - Fixed position bottom right */}
      <ChatWindow
        ref={chatWindowRef}
        isOpen={isChatOpen}
        isMinimized={isChatMinimized}
        unreadMessagesCount={unreadMessagesCount}
        username={username}
        email={email}
        isSettingUsername={isSettingUsername}
        messages={messages}
        newMessage={newMessage}
        isLoading={isLoading}
        slackTypingUsers={slackTypingUsers}
        error={error}
        successMessage={successMessage}
        isLogoutModalOpen={isLogoutModalOpen}
        connectionStatus={getConnectionStatus()}
        onClose={closeChat}
        onMinimize={minimizeChat}
        onRestore={restoreChat}
        onLogout={confirmLogout}
        onSendMessage={handleSendMessage}
        onMessageChange={handleInputChange}
        onSetUsername={handleSetUsername}
        onCloseLogoutModal={() => setIsLogoutModalOpen(false)}
        onOpenLogoutModal={() => setIsLogoutModalOpen(true)}
        messageInputRef={messageInputRef as React.RefObject<HTMLInputElement>}
        messagesEndRef={messagesEndRef as React.RefObject<HTMLDivElement>}
      />

      {/* Chat Trigger Bar - Fixed at bottom of screen with sliding animation */}
      {!isChatOpen && <QuestionBar onQuestionClick={handleQuestionClick} />}

      {/* Socket Debug Component */}
      <SocketDebug />

      {/* Delete Channel Modal */}
      <DeleteChannelModal
        isOpen={isModalOpen}
        username={username}
        isDeleting={isDeletingChannel}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleDeleteChannel}
      />
    </div>
  );
}
