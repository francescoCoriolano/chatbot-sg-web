import { NextResponse } from "next/server";
import { getSocketIO, getConnectionCount, getInitializationStatus } from "@/lib/socket-server";

export async function GET() {
  try {
    const socketIO = getSocketIO();
    const connectionCount = getConnectionCount();
    const status = getInitializationStatus();

    return NextResponse.json({
      status,
      socketServerExists: !!socketIO,
      connectionCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error getting socket status:", error);
    return NextResponse.json(
      {
        error: "Failed to get socket status",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
