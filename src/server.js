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

    // Handle disconnection
    socket.on("disconnect", () => {
      global.connectionCount--;
      console.log(`Socket disconnected: ${socket.id}, total connections: ${global.connectionCount}`);
    });

    // Handle chat messages
    socket.on("chat_message", (data) => {
      console.log("Chat message received:", data);
      io.emit("chat_message", data);
    });

    // Handle Slack messages
    socket.on("slack_message", (data) => {
      console.log("Slack message received:", data);
      io.emit("slack_message", data);
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
