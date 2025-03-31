import { NextRequest, NextResponse } from 'next/server';

// Add a global declaration for the recentMessages property
declare global {
  var recentMessages: {
    chat_message: any[];
    slack_message: any[];
  };
  var userChannels: Record<string, string>;
}

// Helper function to get recent messages from our global cache
const getRecentMessages = (username?: string) => {
  try {
    if (typeof global !== 'undefined' && global.recentMessages) {
      if (!username) {
        return [...global.recentMessages.slack_message];
      }

      // If username is provided, filter messages to only those from the user's channel
      const userChannelId = global.userChannels?.[username];
      if (!userChannelId) {
        console.log(`No channel found for user ${username}, returning empty messages`);
        return [];
      }

      console.log(`Filtering messages for user ${username} with channel ${userChannelId}`);
      // Filter to messages that are either sent by this user, or in their channel
      return [...global.recentMessages.slack_message].filter(
        msg =>
          msg.channelId === userChannelId || msg.sender === username || msg.targetUser === username,
      );
    }
  } catch (error) {
    console.error('Error accessing recent messages:', error);
  }
  return [];
};

// Return cached messages from Socket Mode
export async function GET(req: NextRequest) {
  try {
    // Get username from query parameter
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');

    const messages = getRecentMessages(username || undefined);

    console.log(`Returning ${messages.length} messages for ${username || 'all users'}`);

    return NextResponse.json({
      messages,
      socketMode: true,
      status: 'success',
    });
  } catch (error: any) {
    console.error('Error retrieving cached messages:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 },
    );
  }
}

// Fallback API for clients that can't use WebSockets
export async function POST(req: NextRequest) {
  try {
    const { message, sender, userId, clientMessageId } = await req.json();

    if (!message || !sender) {
      return NextResponse.json({ error: 'Message and sender are required' }, { status: 400 });
    }

    // Format the chat message
    const chatMessage = {
      id: clientMessageId || Date.now().toString(),
      text: message,
      sender,
      userId: userId || 'anonymous',
      timestamp: new Date().toISOString(),
      isFromSlack: false,
    };

    // Broadcast via Socket.IO if available
    try {
      if (typeof global.socketIO !== 'undefined') {
        global.socketIO.emit('chat_message', chatMessage);
      } else {
        console.error('Socket.IO instance not available for broadcasting');
      }
    } catch (error) {
      console.error('Error broadcasting message:', error);
    }

    return NextResponse.json({
      success: true,
      message: chatMessage,
      note: 'Direct socket communication is preferred over this API',
    });
  } catch (error) {
    console.error('Error processing chat message:', error);
    return NextResponse.json({ error: 'Failed to process message' }, { status: 500 });
  }
}
