import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { broadcastMessage } from "@/lib/socket-server";
import { verifySlackRequest } from "@/utils/slack";

// Note: This webhook endpoint is no longer used since we've switched to Socket Mode
// It's kept for reference or if you need to switch back to webhook mode

// Slack verification token
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || "";
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || "";
const SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID || "";

export async function POST(req: Request) {
  return NextResponse.json({
    status: "Socket Mode active - webhook not in use",
    socketMode: true,
    message: "The app is now using Socket Mode to receive messages from Slack",
  });
}

export async function GET(req: NextRequest) {
  return NextResponse.json({
    status: "Socket Mode active - webhook not in use",
    socketMode: true,
  });
}
