import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { broadcastMessage } from "@/lib/socket-server";
import { verifySlackRequest } from "@/utils/slack";

// Slack verification token
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || "";
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || "";
const SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID || "";

export async function POST(req: Request) {
  try {
    // Verify the request came from Slack
    const rawBody = await req.text();
    const isValid = await verifySlackRequest(req, rawBody);

    if (!isValid) {
      console.error("Invalid Slack signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Parse the body
    const body = JSON.parse(rawBody);

    // Handle Slack URL verification
    if (body.type === "url_verification") {
      return NextResponse.json({ challenge: body.challenge }, { status: 200 });
    }

    // Process the event
    if (body.event && body.event.type === "message") {
      // Skip messages from our bot or system messages to prevent loops
      if (body.event.bot_id || body.event.subtype) {
        console.log("Skipping bot/system message:", body.event.text);
        return NextResponse.json({ status: "skipped" }, { status: 200 });
      }

      // Fetch user info to get display name
      let userName = "Slack User";
      try {
        if (body.event.user && SLACK_BOT_TOKEN) {
          const userResponse = await fetch(`https://slack.com/api/users.info?user=${body.event.user}`, {
            headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
          });

          const userData = await userResponse.json();
          if (userData.ok) {
            userName = userData.user.real_name || userData.user.name || "Slack User";
          }
        }
      } catch (error) {
        console.error("Error fetching Slack user info:", error);
      }

      const message = {
        id: body.event.ts || Date.now().toString(),
        text: body.event.text || "",
        sender: userName,
        userId: body.event.user || "unknown_slack_user",
        timestamp: new Date(parseInt(body.event.ts.split(".")[0]) * 1000).toISOString(),
        channel: body.event.channel || "Unknown Channel",
        isFromSlack: true,
      };

      // Check if we have a message to broadcast
      if (message.text) {
        console.log("Broadcasting Slack message:", message);
        const success = broadcastMessage("slack_message", message);

        if (!success) {
          console.warn("No Socket.IO server available to broadcast Slack message - will retry");
          // Try broadcasting again after a short delay in case server is initializing
          setTimeout(() => {
            const retrySuccess = broadcastMessage("slack_message", message);
            console.log("Retry broadcast result:", retrySuccess ? "success" : "failed");
          }, 1000);
        }
      }
    }

    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (error) {
    console.error("Error processing Slack webhook:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Handle Slack URL verification challenge (GET request)
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const challenge = url.searchParams.get("challenge");

    if (challenge) {
      // If this is a verification challenge, verify the request first
      const rawBody = url.search.substring(1); // Remove leading '?'
      const isValid = await verifySlackRequest(req, rawBody);

      if (!isValid) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }

      return NextResponse.json({ challenge });
    }

    return NextResponse.json({ status: "Slack webhook endpoint ready" });
  } catch (error) {
    console.error("Error handling GET request:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
