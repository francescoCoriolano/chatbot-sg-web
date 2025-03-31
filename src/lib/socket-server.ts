import { Server as ServerIO } from 'socket.io';
import { Server as NetServer } from 'http';
import { Socket as NetSocket } from 'net';
import { NextApiRequest, NextApiResponse } from 'next';

// Define better types for Socket.IO integration
interface SocketServer extends NetServer {
  io?: ServerIO;
}

interface NextApiResponseSocket extends NetSocket {
  server: SocketServer;
}

export interface SocketIONextApiResponse extends NextApiResponse {
  socket: NextApiResponseSocket;
}

// Add type for global to avoid TypeScript errors
declare global {
  var socketIO: ServerIO | undefined;
  var connectionCount: number;
}

// Keep a global reference to the Socket.IO server instance
let io: ServerIO | null = null;
let initializationInProgress = false;
let initializationError: Error | null = null;

// Store the io instance globally to ensure availability
const storeGlobalIO = (socketIO: ServerIO) => {
  io = socketIO;
  global.socketIO = socketIO;
  return socketIO;
};

// Get the global io instance
const getGlobalIO = (): ServerIO | null => {
  if (io) return io;
  return global.socketIO || null;
};

/**
 * Initialize the Socket.IO server
 */
export const initSocketServer = (req: any, res: any): ServerIO | null => {
  try {
    // If we already have an IO instance, use it
    const existingIO = getGlobalIO();
    if (existingIO) {
      console.log('Socket.IO server already initialized with', connectionCount, 'connections');
      return existingIO;
    }

    // If there's an initialization already in progress, don't try to create another one
    if (initializationInProgress) {
      console.log('Socket.IO server initialization in progress, waiting...');
      return null;
    }

    initializationInProgress = true;

    // We're using a different approach for App Router
    // We'll create our own HTTP server
    const httpServer = global.httpServer;

    if (!httpServer) {
      console.error('HTTP server not available - manually creating server instance');

      // Create a new Socket.IO server that will work with Next.js
      io = new ServerIO({
        path: '/api/socketio',
        addTrailingSlash: false,
        cors: {
          origin: '*',
          methods: ['GET', 'POST'],
        },
        // Longer polling duration for more reliable connections
        pingTimeout: 60000,
        pingInterval: 25000,
        transports: ['polling', 'websocket'],
        allowEIO3: true,
      });
    } else {
      // Create using the existing HTTP server
      const newIO = new ServerIO(httpServer, {
        path: '/api/socketio',
        addTrailingSlash: false,
        cors: {
          origin: '*',
          methods: ['GET', 'POST'],
        },
        pingTimeout: 60000,
        pingInterval: 25000,
        transports: ['polling', 'websocket'],
        allowEIO3: true,
      });

      console.log('Socket.IO server attached to existing HTTP server');

      // Store the IO instance globally
      storeGlobalIO(newIO);
    }

    // Set up event handlers
    if (io) {
      io.on('connection', socket => {
        // Connection count now tracked in server.js
        console.log('New client connected from lib socket server, ID:', socket.id);

        // Send welcome message
        socket.emit('welcome', {
          message: 'Welcome to the Socket.IO server!',
          socketId: socket.id,
          timestamp: new Date().toISOString(),
        });

        // Handle chat messages
        socket.on('chat_message', data => {
          console.log('Chat message received:', data);
          if (io) {
            io.emit('chat_message', data);
          }
        });

        // Handle Slack messages
        socket.on('slack_message', data => {
          console.log('Slack message received:', data);
          if (io) {
            io.emit('slack_message', data);
          }
        });

        socket.on('disconnect', () => {
          // Connection count now tracked in server.js
          console.log('Client disconnected from lib socket server, ID:', socket.id);
        });
      });
    }

    console.log('Socket.IO server initialized successfully');
    initializationInProgress = false;
    initializationError = null;
    return io;
  } catch (error) {
    console.error('Failed to initialize Socket.IO server:', error);
    initializationInProgress = false;
    initializationError = error instanceof Error ? error : new Error(String(error));
    return null;
  }
};

/**
 * Broadcast a message to all connected clients
 */
export const broadcastMessage = (
  event: string,
  message: any,
  retry = true,
  maxRetries = 5,
  currentRetry = 0,
): boolean => {
  try {
    // Get the latest instance of io
    const socketIO = getGlobalIO();

    if (!socketIO) {
      console.warn(`No Socket.IO server available to broadcast ${event} message`);

      // If retry is enabled and we haven't exhausted our retries
      if (retry && currentRetry < maxRetries) {
        const nextRetry = currentRetry + 1;
        const delay = Math.min(100 * Math.pow(2, currentRetry), 3000); // Exponential backoff with higher max delay

        console.log(
          `Will retry broadcast (${nextRetry}/${maxRetries}) in ${delay}ms for message: ${JSON.stringify(message)}`,
        );

        setTimeout(() => {
          const success = broadcastMessage(event, message, retry, maxRetries, nextRetry);
          if (success) {
            console.log(`Successfully broadcast ${event} message on retry ${nextRetry}`);
          } else if (nextRetry === maxRetries) {
            console.error(
              `Failed to broadcast ${event} message after ${maxRetries} retries: ${JSON.stringify(message)}`,
            );
          }
        }, delay);
      }

      return false;
    }

    // Get the current connection count from global
    const connections = getConnectionCount();

    // Log full message details in development
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Broadcasting ${event} message:`, JSON.stringify(message));
    }

    // Check if we have clients connected
    if (connections === 0) {
      console.warn(
        `Broadcasting ${event} message, but no clients are connected. Storing for later delivery.`,
      );
      // We should still emit the event even if no clients are connected
      // as they might connect later and Socket.IO will buffer recent events
    }

    // For slack messages, ensure the isFromSlack flag is set
    if (event === 'slack_message') {
      // Create a copy with the isFromSlack flag explicitly set to true
      const messageWithSource = {
        ...message,
        isFromSlack: true,
      };

      console.log(`Broadcasting ${event} message to ${connections} clients with isFromSlack=true`);
      socketIO.emit(event, messageWithSource);

      // Also broadcast to all sockets individually to ensure delivery
      socketIO.sockets.sockets.forEach(socket => {
        console.log(`Sending ${event} directly to socket ${socket.id}`);
        socket.emit(event, messageWithSource);
      });

      return true;
    }

    // For other message types
    console.log(`Broadcasting ${event} message to ${connections} clients`);
    socketIO.emit(event, message);

    return true;
  } catch (error) {
    console.error(`Error broadcasting ${event} message:`, error);
    return false;
  }
};

/**
 * Get the current Socket.IO server instance
 */
export const getSocketIO = (): ServerIO | null => {
  return getGlobalIO();
};

/**
 * Get the current connection count
 */
export const getConnectionCount = (): number => {
  return global.connectionCount || 0;
};

/**
 * Get the current initialization status
 */
export const getInitializationStatus = (): {
  initialized: boolean;
  initializing: boolean;
  error: string | null;
} => {
  return {
    initialized: !!io,
    initializing: initializationInProgress,
    error: initializationError ? initializationError.message : null,
  };
};
