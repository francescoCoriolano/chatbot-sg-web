import { Socket, io } from "socket.io-client";

// Singleton pattern for the Socket.IO client connection
let socket: Socket | null = null;
let socketInitialized = false;

export const initializeSocket = () => {
  if (socketInitialized) {
    return socket;
  }

  try {
    console.log("Initializing Socket.IO client");
    socketInitialized = true;

    // Create the socket connection
    socket = io(typeof window !== "undefined" ? window.location.origin : "", {
      path: "/api/socketio",
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 30000,
      autoConnect: true,
      transports: ["polling", "websocket"], // Start with polling first, then upgrade to websocket
      forceNew: false,
      multiplex: true,
      withCredentials: false,
    });

    // Log connection events
    socket.on("connect", () => {
      console.log("Socket connected, ID:", socket?.id);

      // Re-subscribe to events on reconnect to ensure we receive all events
      socket?.emit("subscribe_events", { events: ["chat_message", "slack_message"] });

      // When the socket connects, tell the server to send any missed messages
      setTimeout(() => {
        socket?.emit("get_missed_messages", { requestId: Date.now() });
      }, 1000);
    });

    socket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
    });

    socket.on("connect_error", (err) => {
      console.error("Socket connection error:", err.message);
      // Retry connection after delay
      setTimeout(() => {
        if (socket) {
          console.log("Attempting to reconnect socket...");
          socket.connect();
        }
      }, 5000);
    });

    socket.io.on("reconnect", (attempt) => {
      console.log("Socket reconnected after", attempt, "attempts");

      // Force a refresh of event subscriptions
      socket?.emit("subscribe_events", { events: ["chat_message", "slack_message"] });
    });

    socket.io.on("reconnect_attempt", (attempt) => {
      console.log("Socket reconnection attempt:", attempt);
      // Force transport to polling on reconnection attempts
      if (socket && attempt > 1) {
        socket.io.opts.transports = ["polling"];
      }
    });

    socket.io.on("reconnect_error", (error) => {
      console.error("Socket reconnection error:", error);
    });

    socket.io.on("reconnect_failed", () => {
      console.error("Socket reconnection failed");
      socketInitialized = false; // Allow reinitializing
    });

    // Make sure socket connects
    if (!socket.connected) {
      socket.connect();
    }

    return socket;
  } catch (error) {
    console.error("Error initializing socket:", error);
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
    console.log("Disconnecting socket");
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
