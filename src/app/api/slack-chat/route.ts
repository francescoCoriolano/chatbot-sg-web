import { NextRequest, NextResponse } from "next/server";
import { broadcastMessage } from "@/lib/socket-server";

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID;

interface Message {
  text: string;
  username: string;
}

// Add a global declaration for the recentMessages property
declare global {
  var recentMessages: {
    chat_message: any[];
    slack_message: any[];
  };
}

// Helper function to get recent messages from our global cache
const getRecentMessages = () => {
  // Access the global messages cache from server.js
  try {
    if (typeof global !== "undefined" && global.recentMessages) {
      // If we have explicitly defined recentMessages globally
      return [...global.recentMessages.slack_message];
    }
  } catch (error) {
    console.error("Error accessing recent messages:", error);
  }

  // Return empty array as fallback
  return [];
};

// To support bootstrapping when the client first loads
export async function GET() {
  try {
    // Return the cached messages instead of fetching from Slack
    const messages = getRecentMessages();

    console.log(`Returning ${messages.length} cached messages from Socket Mode implementation`);

    return NextResponse.json({
      messages,
      socketMode: true,
      status: "Using Socket Mode - messages are cached locally",
    });
  } catch (error: any) {
    console.error("Error in slack-chat function:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // Check if this is an internal webhook request
    const isWebhook = req.headers.get("X-Internal-Source") === "webhook";

    let messageData;

    if (isWebhook) {
      // This is a direct webhook post - we don't need this with Socket Mode
      // but keeping it for backward compatibility
      messageData = await req.json();
      console.log("Received webhook message to store (not used in Socket Mode):", messageData);

      // Return success but note that Socket Mode is active
      return NextResponse.json({
        success: true,
        socketMode: true,
        message: "Socket Mode active, webhook messages not needed",
      });
    }

    // Normal client message flow
    const { message, sender, userId, clientMessageId } = await req.json();

    if (!message || !sender) {
      return NextResponse.json({ error: "Message and sender are required" }, { status: 400 });
    }

    // Format the chat message for local broadcasting
    const chatMessage = {
      id: clientMessageId || Date.now().toString(), // Use the client ID if provided
      text: message,
      sender,
      userId: userId || "anonymous",
      timestamp: new Date().toISOString(),
      isFromSlack: false,
      clientMessageId, // Keep the original ID for reference
    };

    console.log("Broadcasting chat message:", chatMessage);

    // Broadcast this message to all clients including the server
    // We need to use the socket server to broadcast
    try {
      // Check if socket.io is available
      if (typeof global.socketIO !== "undefined") {
        // Use the global socket.io instance to broadcast
        global.socketIO.emit("chat_message", chatMessage);
        console.log("Message broadcast to socket.io clients for Slack forwarding");
      } else {
        console.error("Socket.io instance not available for broadcasting");
      }
    } catch (error) {
      console.error("Error broadcasting message:", error);
    }

    // Send message to Slack using the slack app from server.js
    // This will now happen directly in server.js via the Socket Mode client

    return NextResponse.json({
      success: true,
      message: chatMessage,
      socketMode: true,
    });
  } catch (error) {
    console.error("Error processing chat message:", error);
    return NextResponse.json({ error: "Failed to process message" }, { status: 500 });
  }
}
