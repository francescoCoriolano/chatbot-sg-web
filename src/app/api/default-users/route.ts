import { NextRequest, NextResponse } from 'next/server';

// Global declarations for server-side state
declare global {
  var DEFAULT_USERS: string[];
}

// Initialize the global variable if it doesn't exist
if (typeof global.DEFAULT_USERS === 'undefined') {
  global.DEFAULT_USERS = [
    'U12345678', // Replace with actual Slack member IDs
    'U87654321',
    'U11223344',
  ];
}

// Get the list of default users
export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      defaultUsers: global.DEFAULT_USERS || [],
    });
  } catch (error: any) {
    console.error('Error getting default users:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Unknown error',
      },
      { status: 500 },
    );
  }
}

// Update the list of default users
export async function POST(req: NextRequest) {
  try {
    const { userIds } = await req.json();

    if (!userIds || !Array.isArray(userIds)) {
      return NextResponse.json({ error: 'userIds array is required' }, { status: 400 });
    }

    // Update the global default users
    global.DEFAULT_USERS = userIds;

    return NextResponse.json({
      success: true,
      defaultUsers: global.DEFAULT_USERS,
      message: 'Default users updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating default users:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Unknown error',
      },
      { status: 500 },
    );
  }
}
