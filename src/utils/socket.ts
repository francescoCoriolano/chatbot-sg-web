import { Socket, io } from 'socket.io-client';

// Singleton pattern for the Socket.IO client connection
let socket: Socket | null = null;
let socketInitialized = false;
let isSocketMode = true; // Flag to track if we're using Socket.IO or fallback API polling
let pollingInterval: NodeJS.Timeout | null = null;
const POLLING_INTERVAL = 5000; // 5 seconds

// Read configuration from Next.js config where available
const getSocketConfig = () => {
  const path = process.env.NEXT_PUBLIC_SOCKET_PATH || '/api/socketio';
  const timeout = parseInt(process.env.NEXT_PUBLIC_SOCKET_TIMEOUT || '20000', 10);
  return { path, timeout };
};

// Function to fetch messages via API when socket fails
const pollMessages = async () => {
  try {
    const response = await fetch('/api/slack-chat');
    if (response.ok) {
      const data = await response.json();
      if (data.messages && Array.isArray(data.messages)) {
        // Dispatch a custom event with the messages
        window.dispatchEvent(
          new CustomEvent('api_messages', {
            detail: { messages: data.messages },
          }),
        );
      }
    }
  } catch (error) {
    console.error('Error polling messages:', error);
  }
};

// Start polling for messages when socket fails
const startPolling = () => {
  if (pollingInterval) return;

  console.info('Falling back to API polling for messages');
  isSocketMode = false;

  // Poll immediately then at regular intervals
  pollMessages();
  pollingInterval = setInterval(pollMessages, POLLING_INTERVAL);
};

// Stop polling if socket reconnects
const stopPolling = () => {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  isSocketMode = true;
};

export const initializeSocket = () => {
  if (socketInitialized) {
    return socket;
  }

  try {
    socketInitialized = true;
    const { path, timeout } = getSocketConfig();

    // Create the socket connection with optimized config
    socket = io(typeof window !== 'undefined' ? window.location.origin : '', {
      path,
      reconnection: true,
      reconnectionAttempts: 5, // Limit reconnection attempts in production
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout,
      autoConnect: true,
      transports: ['polling', 'websocket'],
      forceNew: false,
      multiplex: true,
    });

    // Set up connection event handlers
    socket.on('connect', () => {
      console.info('Socket connected');
      stopPolling(); // Stop polling if it was active

      // Subscribe to events and request missed messages
      socket?.emit('subscribe_events', { events: ['chat_message', 'slack_message'] });

      setTimeout(() => {
        socket?.emit('get_missed_messages', { requestId: Date.now() });
      }, 1000);
    });

    socket.on('disconnect', reason => {
      console.info('Socket disconnected:', reason);

      // Only start polling for certain disconnect reasons that indicate server issues
      if (
        [
          'transport close',
          'transport error',
          'server disconnect',
          'io server disconnect',
        ].includes(reason)
      ) {
        startPolling();
      }
    });

    socket.on('connect_error', err => {
      console.error('Socket connection error:', err.message);

      // Check if we've reached max reconnection attempts or if this is on Vercel
      if (isProductionVercel()) {
        startPolling(); // Switch to polling in production Vercel environment
      } else {
        setTimeout(() => {
          if (socket) socket.connect();
        }, 5000);
      }
    });

    // Set up reconnection handlers
    socket.io.on('reconnect', attempt => {
      console.info('Socket reconnected after', attempt, 'attempts');
      stopPolling(); // Stop polling if it was active
      socket?.emit('subscribe_events', { events: ['chat_message', 'slack_message'] });
    });

    socket.io.on('reconnect_attempt', attempt => {
      if (socket && attempt > 1) {
        socket.io.opts.transports = ['polling'];
      }

      // After several failures, fall back to polling
      if (attempt >= 3) {
        startPolling();
      }
    });

    socket.io.on('reconnect_error', error => {
      console.error('Socket reconnection error:', error);
      startPolling();
    });

    socket.io.on('reconnect_failed', () => {
      console.error('Socket reconnection failed');
      socketInitialized = false;
      startPolling();
    });

    // Ensure socket connects
    if (!socket.connected) {
      socket.connect();
    }

    return socket;
  } catch (error) {
    console.error('Error initializing socket:', error);
    socketInitialized = false;
    startPolling();
    return null;
  }
};

// Helper to detect Vercel production environment
const isProductionVercel = () => {
  return (
    typeof window !== 'undefined' &&
    (window.location.hostname.endsWith('vercel.app') ||
      process.env.NEXT_PUBLIC_VERCEL_ENV === 'production')
  );
};

export const getSocket = () => {
  if (!socket || !socketInitialized) {
    return initializeSocket();
  }
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
    socketInitialized = false;
  }
  stopPolling();
};

export const isSocketConnected = () => {
  return socket?.connected || false;
};

export const isUsingSocketMode = () => {
  return isSocketMode;
};

export const sendMessageViaSocket = (message: any) => {
  const socket = getSocket();
  if (socket && socket.connected) {
    socket.emit('chat_message', message);
    return true;
  }
  return false;
};

export default {
  initializeSocket,
  getSocket,
  disconnectSocket,
  isSocketConnected,
  isUsingSocketMode,
  sendMessageViaSocket,
};
