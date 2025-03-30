const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

// Initialize connection count
global.connectionCount = 0;

app.prepare().then(() => {
  // Create HTTP server
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // Create Socket.IO server directly here
  const io = new Server(server, {
    path: "/api/socketio",
    addTrailingSlash: false,
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ["polling", "websocket"],
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // Store recent messages in memory for reconnecting clients
  const recentMessages = {
    chat_message: [],
    slack_message: [],
  };

  // Maximum number of recent messages to keep in memory
  const MAX_RECENT_MESSAGES = 50;

  // Basic Socket.IO event handlers
  io.on("connection", (socket) => {
    // Increment global connection count
    global.connectionCount++;
    console.log(`Socket connected: ${socket.id}, total connections: ${global.connectionCount}`);

    // Send welcome message
    socket.emit("welcome", {
      message: "Welcome to the Socket.IO server!",
      socketId: socket.id,
      timestamp: new Date().toISOString(),
    });

    // Send recent messages to newly connected clients
    if (recentMessages.chat_message.length > 0) {
      console.log(`Sending ${recentMessages.chat_message.length} recent chat messages to new client`);
      recentMessages.chat_message.forEach((message) => {
        socket.emit("chat_message", message);
      });
    }

    if (recentMessages.slack_message.length > 0) {
      console.log(`Sending ${recentMessages.slack_message.length} recent slack messages to new client`);
      recentMessages.slack_message.forEach((message) => {
        socket.emit("slack_message", message);
      });
    }

    // Handle disconnection
    socket.on("disconnect", () => {
      global.connectionCount--;
      console.log(`Socket disconnected: ${socket.id}, total connections: ${global.connectionCount}`);
    });

    // Handle chat messages
    socket.on("chat_message", (data) => {
      console.log("Chat message received:", data);

      // Store the message in our recent messages cache
      recentMessages.chat_message.push(data);
      if (recentMessages.chat_message.length > MAX_RECENT_MESSAGES) {
        recentMessages.chat_message.shift(); // Remove oldest message
      }

      io.emit("chat_message", data);
    });

    // Handle Slack messages
    socket.on("slack_message", (data) => {
      console.log("Slack message received:", data);

      // Ensure the message has the isFromSlack flag set to true
      const messageWithSource = {
        ...data,
        isFromSlack: true,
      };

      // Store the message in our recent messages cache
      recentMessages.slack_message.push(messageWithSource);
      if (recentMessages.slack_message.length > MAX_RECENT_MESSAGES) {
        recentMessages.slack_message.shift(); // Remove oldest message
      }

      io.emit("slack_message", messageWithSource);
    });

    // Handle subscription requests
    socket.on("subscribe_events", (data) => {
      console.log(`Client ${socket.id} subscribing to events:`, data.events);

      // Nothing special to do here since we're broadcasting to all clients by default
      // But we could implement selective subscriptions in the future
    });

    // Handle requests for missed messages
    socket.on("get_missed_messages", (data) => {
      console.log(`Client ${socket.id} requesting missed messages:`, data);

      // Send all recent messages to the client
      if (recentMessages.chat_message.length > 0) {
        console.log(`Sending ${recentMessages.chat_message.length} chat messages`);
        recentMessages.chat_message.forEach((message) => {
          socket.emit("chat_message", message);
        });
      }

      if (recentMessages.slack_message.length > 0) {
        console.log(`Sending ${recentMessages.slack_message.length} slack messages`);
        recentMessages.slack_message.forEach((message) => {
          socket.emit("slack_message", message);
        });
      }

      socket.emit("missed_messages_complete", {
        requestId: data.requestId,
        count: recentMessages.chat_message.length + recentMessages.slack_message.length,
      });
    });
  });

  // Make the HTTP server and Socket.IO accessible globally
  global.httpServer = server;
  global.socketIO = io;

  // Start the server
  const port = process.env.PORT || 3000;
  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${port}`);
  });
});
