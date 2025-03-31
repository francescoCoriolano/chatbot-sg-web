import { NextRequest, NextResponse } from 'next/server';

// Global declarations for server-side state
declare global {
  var userChannels: Record<string, string>;
  var slackApp: any; // Using any for the Slack app type
}

// This endpoint gets or creates a Slack channel for a specific user
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    // Check if we already have a channel for this user
    if (typeof global.userChannels !== 'undefined' && global.userChannels[username]) {
      // Get channel info from Slack
      try {
        const slackApp = global.slackApp;
        if (!slackApp) {
          return NextResponse.json(
            {
              error: 'Slack app not initialized',
              channelId: global.userChannels[username],
            },
            { status: 200 },
          );
        }

        const channelInfo = await slackApp.client.conversations.info({
          channel: global.userChannels[username],
        });

        return NextResponse.json({
          channelId: global.userChannels[username],
          channelName: channelInfo.channel.name,
          message: 'Channel found for user',
        });
      } catch (error) {
        console.error('Error getting channel info:', error);
        return NextResponse.json({
          channelId: global.userChannels[username],
          message: 'Channel ID exists but could not get details',
        });
      }
    }

    // Channel not found, let the server create it
    // We'll send the client the channel info on the next request
    // to avoid race conditions with channel creation
    return NextResponse.json({
      message:
        'Channel not found for user, it will be created automatically when you send a message',
    });
  } catch (error: any) {
    console.error('Error in user-channel API:', error);
    return NextResponse.json(
      {
        error: error.message || 'Unknown error',
      },
      { status: 500 },
    );
  }
}
