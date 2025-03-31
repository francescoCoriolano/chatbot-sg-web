import { Socket, io } from 'socket.io-client';

// Singleton pattern for the Socket.IO client connection
let socket: Socket | null = null;
let socketInitialized = false;

export const initializeSocket = () => {
  if (socketInitialized) {
    return socket;
  }

  try {
    socketInitialized = true;

    // Create the socket connection with optimized config
    socket = io(typeof window !== 'undefined' ? window.location.origin : '', {
      path: '/api/socketio',
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 30000,
      autoConnect: true,
      transports: ['polling', 'websocket'],
      forceNew: false,
      multiplex: true,
    });

    // Set up connection event handlers
    socket.on('connect', () => {
      console.log('Socket connected');

      // Subscribe to events and request missed messages
      socket?.emit('subscribe_events', { events: ['chat_message', 'slack_message'] });

      setTimeout(() => {
        socket?.emit('get_missed_messages', { requestId: Date.now() });
      }, 1000);
    });

    socket.on('disconnect', reason => {
      console.log('Socket disconnected:', reason);
    });

    socket.on('connect_error', err => {
      console.error('Socket connection error:', err.message);
      setTimeout(() => {
        if (socket) socket.connect();
      }, 5000);
    });

    // Set up reconnection handlers
    socket.io.on('reconnect', attempt => {
      console.log('Socket reconnected after', attempt, 'attempts');
      socket?.emit('subscribe_events', { events: ['chat_message', 'slack_message'] });
    });

    socket.io.on('reconnect_attempt', attempt => {
      if (socket && attempt > 1) {
        socket.io.opts.transports = ['polling'];
      }
    });

    socket.io.on('reconnect_error', error => {
      console.error('Socket reconnection error:', error);
    });

    socket.io.on('reconnect_failed', () => {
      console.error('Socket reconnection failed');
      socketInitialized = false;
    });

    // Ensure socket connects
    if (!socket.connected) {
      socket.connect();
    }

    return socket;
  } catch (error) {
    console.error('Error initializing socket:', error);
    socketInitialized = false;
    return null;
  }
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
};

export const isSocketConnected = () => {
  return socket?.connected || false;
};

export default {
  initializeSocket,
  getSocket,
  disconnectSocket,
  isSocketConnected,
};
