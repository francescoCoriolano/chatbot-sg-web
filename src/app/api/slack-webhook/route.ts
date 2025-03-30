import { NextResponse } from "next/server";

// The webhook endpoint was used for Slack Events API integration
// It's no longer needed with Socket Mode, which uses WebSockets instead

export async function POST() {
  return NextResponse.json({
    status: "Socket Mode active",
    message: "This endpoint is deprecated. The app now uses Socket Mode.",
  });
}

export async function GET() {
  return NextResponse.json({
    status: "Socket Mode active",
    message: "This endpoint is deprecated. The app now uses Socket Mode.",
  });
}
