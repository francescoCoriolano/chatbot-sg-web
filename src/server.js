const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");
const { App } = require("@slack/bolt");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

// Initialize connection count
global.connectionCount = 0;

// Store recent messages in memory for reconnecting clients
const recentMessages = {
  chat_message: [],
  slack_message: [],
};

// Make the recentMessages accessible globally
global.recentMessages = recentMessages;

// Maximum number of recent messages to keep in memory
const MAX_RECENT_MESSAGES = 50;

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

  // Check Slack configuration
  console.log("Checking Slack configuration:");
  console.log(`- SLACK_BOT_TOKEN: ${process.env.SLACK_BOT_TOKEN ? "✅ Configured" : "❌ Missing"}`);
  console.log(`- SLACK_APP_TOKEN: ${process.env.SLACK_APP_TOKEN ? "✅ Configured" : "❌ Missing"}`);
  console.log(`- SLACK_CHANNEL_ID: ${process.env.SLACK_CHANNEL_ID ? "✅ Configured" : "❌ Missing"}`);

  // Initialize Slack app with Socket Mode
  const slackApp = new App({
    token: process.env.SLACK_BOT_TOKEN,
    appToken: process.env.SLACK_APP_TOKEN,
    socketMode: true,
  });

  // Start the Slack app
  (async () => {
    try {
      await slackApp.start();
      console.log("⚡️ Slack app is running in Socket Mode!");

      // Listen for message events from Slack
      slackApp.message(async ({ message, say }) => {
        console.log("Received message from Slack:", message);

        // Skip messages from our app and system messages
        if (message.subtype || message.bot_id) {
          console.log("Skipping bot/system message");
          return;
        }

        // Format the message for our app
        const slackMessage = {
          id: message.ts || Date.now().toString(),
          text: message.text || "",
          sender: message.user_profile?.real_name || "Slack User",
          userId: message.user || "unknown_slack_user",
          timestamp: new Date(parseInt(message.ts?.split(".")[0]) * 1000).toISOString(),
          isFromSlack: true,
        };

        // Store in recent messages cache
        recentMessages.slack_message.push(slackMessage);
        if (recentMessages.slack_message.length > MAX_RECENT_MESSAGES) {
          recentMessages.slack_message.shift(); // Remove oldest message
        }

        // Broadcast to all connected clients
        io.emit("slack_message", slackMessage);

        console.log("Broadcasted Slack message to clients:", slackMessage);
      });
    } catch (error) {
      console.error("⚠️ Error starting Slack app:", error);
    }
  })();

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
      recentMessages.chat_message.forEach((message) => {
        socket.emit("chat_message", message);
      });
    }

    if (recentMessages.slack_message.length > 0) {
      recentMessages.slack_message.forEach((message) => {
        socket.emit("slack_message", message);
      });
    }

    // Handle disconnection
    socket.on("disconnect", () => {
      global.connectionCount--;
      console.log(`Socket disconnected: ${socket.id}, total connections: ${global.connectionCount}`);
    });

    // Handle chat messages from clients
    socket.on("chat_message", (data) => {
      // Add isFromSlack=false flag if not present
      const message = {
        ...data,
        isFromSlack: false,
      };

      // Store the message in our recent messages cache
      recentMessages.chat_message.push(message);
      if (recentMessages.chat_message.length > MAX_RECENT_MESSAGES) {
        recentMessages.chat_message.shift(); // Remove oldest message
      }

      // Broadcast to all clients
      io.emit("chat_message", message);

      // Send to Slack if bot token is available
      if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL_ID) {
        try {
          // Send message to Slack
          slackApp.client.chat
            .postMessage({
              channel: process.env.SLACK_CHANNEL_ID,
              text: `From ${message.sender}: ${message.text}`,
              unfurl_links: false,
              unfurl_media: false,
            })
            .then((result) => {
              console.log("✅ Message sent to Slack:", result.ts);
            })
            .catch((error) => {
              console.error("❌ Error sending message to Slack:", error.message || error);
              if (error.data) {
                console.error("  Error details:", JSON.stringify(error.data));
              }
            });
        } catch (error) {
          console.error("❌ Error sending to Slack:", error.message || error);
        }
      } else {
        console.warn("❌ Slack credentials missing - not forwarding message to Slack");
        console.warn(`  SLACK_BOT_TOKEN: ${process.env.SLACK_BOT_TOKEN ? "Present" : "Missing"}`);
        console.warn(`  SLACK_CHANNEL_ID: ${process.env.SLACK_CHANNEL_ID ? "Present" : "Missing"}`);
      }
    });

    // Handle subscription requests
    socket.on("subscribe_events", (data) => {
      console.log(`Client ${socket.id} subscribing to events:`, data.events);
    });

    // Handle requests for missed messages
    socket.on("get_missed_messages", (data) => {
      // Send all recent messages to the client
      if (recentMessages.chat_message.length > 0) {
        recentMessages.chat_message.forEach((message) => {
          socket.emit("chat_message", message);
        });
      }

      if (recentMessages.slack_message.length > 0) {
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
