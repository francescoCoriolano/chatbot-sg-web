import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { initSocketServer, getSocketIO, getInitializationStatus } from '@/lib/socket-server';

// This is a workaround to initialize the Socket.IO server from App Router
// It proxies to the Pages Router socketio endpoint
export async function GET(req: NextRequest) {
  try {
    // Check if socket is already initialized
    const status = getInitializationStatus();
    if (status.initialized) {
      return NextResponse.json({
        success: true,
        status: 'Socket server already initialized',
        socketStatus: status,
      });
    }

    // Initialize the socket server directly
    console.log('Initializing Socket.IO server from App Router');

    // Pass minimal objects since we don't need them anymore with our custom approach
    const io = await initSocketServer({}, {});

    if (!io) {
      throw new Error('Failed to initialize Socket.IO server');
    }

    // Check if the socket was initialized
    const newStatus = getInitializationStatus();

    return NextResponse.json({
      success: true,
      status: 'Socket server initialized',
      socketStatus: newStatus,
    });
  } catch (error) {
    console.error('Error initializing socket:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
