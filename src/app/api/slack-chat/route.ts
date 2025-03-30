import { NextRequest, NextResponse } from "next/server";
import { broadcastMessage } from "@/lib/socket-server";

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID;

interface Message {
  text: string;
  username: string;
}

// To support bootstrapping when the client first loads
export async function GET() {
  try {
    // Check environment variables but don't throw an error
    if (!SLACK_BOT_TOKEN || !SLACK_CHANNEL_ID) {
      console.warn("Environment variables missing for Slack integration:", {
        hasToken: !!SLACK_BOT_TOKEN,
        hasChannel: !!SLACK_CHANNEL_ID,
      });
      // Return empty messages array when running without Slack integration
      return NextResponse.json({
        messages: [],
        status: "No Slack integration configured. Set SLACK_BOT_TOKEN and SLACK_CHANNEL_ID environment variables.",
      });
    }

    console.log("Fetching initial messages from Slack channel:", SLACK_CHANNEL_ID);

    // Fetch recent messages from Slack channel (just for initial load)
    const response = await fetch(`https://slack.com/api/conversations.history?channel=${SLACK_CHANNEL_ID}&limit=20`, {
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      },
    });

    const data = await response.json();
    console.log("Slack API response:", {
      ok: data.ok,
      messageCount: data.messages?.length,
      error: data.error,
    });

    if (!data.ok) {
      // If there's still an error, check if it's because the token doesn't have permission
      if (data.error === "not_in_channel") {
        // Return empty messages array instead of error for this specific case
        return NextResponse.json({
          messages: [],
          status: "Bot is not in the channel. Add the bot to the channel or add the channels:join permission.",
        });
      }
      throw new Error(`Slack API error: ${data.error}`);
    }

    // Filter and format messages
    const messages = data.messages
      ? data.messages
          .filter((msg: any) => !msg.subtype) // Filter out system messages
          .map((msg: any) => {
            const isFromApp = msg.text?.startsWith("From ");
            return {
              id: msg.ts,
              text: isFromApp ? msg.text.replace(/^From \w+: /, "") : msg.text,
              sender: isFromApp ? msg.text.split(":")[0].replace("From ", "") : msg.username || "Slack User",
              timestamp: new Date(Number(msg.ts) * 1000).toISOString(),
              isFromSlack: !isFromApp, // Mark messages sent from our app as not from Slack
              isFromApp,
              userId: msg.user || undefined, // Include Slack user ID
            };
          })
          .reverse() // Show newest messages last
      : [];

    return NextResponse.json({ messages });
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
    const { message, sender, userId } = await req.json();

    if (!message || !sender) {
      return NextResponse.json({ error: "Message and sender are required" }, { status: 400 });
    }

    // Format the chat message for local broadcasting
    const chatMessage = {
      id: Date.now().toString(),
      text: message,
      sender,
      userId: userId || "anonymous",
      timestamp: new Date().toISOString(),
      isFromSlack: false,
    };

    console.log("Broadcasting chat message:", chatMessage);

    // Broadcast message to all connected clients
    const success = broadcastMessage("chat_message", chatMessage);

    if (!success) {
      console.warn("No Socket.IO server available to broadcast chat message - will retry");
      // Try broadcasting again after a short delay in case server is initializing
      setTimeout(() => {
        const retrySuccess = broadcastMessage("chat_message", chatMessage);
        console.log("Retry broadcast result:", retrySuccess ? "success" : "failed");
      }, 1000);
    }

    // If we have Slack credentials, also send to Slack
    if (SLACK_BOT_TOKEN && SLACK_CHANNEL_ID) {
      try {
        // Send message to Slack
        const response = await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            channel: SLACK_CHANNEL_ID,
            text: `From ${sender}: ${message}`,
            unfurl_links: false,
            unfurl_media: false,
          }),
        });

        const data = await response.json();

        if (!data.ok) {
          console.error("Error sending message to Slack:", data.error);
          return NextResponse.json({
            success: true,
            message: chatMessage,
            slackStatus: {
              success: false,
              error: data.error,
            },
          });
        }

        console.log("Message sent to Slack successfully");
        return NextResponse.json({
          success: true,
          message: chatMessage,
          slackStatus: {
            success: true,
            ts: data.ts,
          },
        });
      } catch (error) {
        console.error("Error sending to Slack:", error);
        return NextResponse.json({
          success: true,
          message: chatMessage,
          slackStatus: {
            success: false,
            error: "Failed to send to Slack API",
          },
        });
      }
    }

    // No Slack integration configured, just return success with local message
    return NextResponse.json({ success: true, message: chatMessage });
  } catch (error) {
    console.error("Error processing chat message:", error);
    return NextResponse.json({ error: "Failed to process message" }, { status: 500 });
  }
}
