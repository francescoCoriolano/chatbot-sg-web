import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { initSocketServer, getSocketIO, getInitializationStatus } from "@/lib/socket-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // Initialize the socket server if not already initialized
    const status = getInitializationStatus();
    if (!status.initialized) {
      console.log("Socket.IO server not initialized, initializing...");

      // Initialize the socket server
      const io = await initSocketServer({}, {});

      if (!io) {
        console.error("Failed to initialize Socket.IO server");
        return NextResponse.json({ success: false, error: "Failed to initialize Socket.IO server" }, { status: 500 });
      }

      console.log("Socket.IO server initialized successfully");
    }

    // Socket.IO will handle the connection
    // Just return a successful response
    return new NextResponse("OK");
  } catch (error) {
    console.error("Error in Socket.IO handler:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
