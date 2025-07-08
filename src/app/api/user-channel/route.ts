import { NextRequest, NextResponse } from 'next/server';

// Global declarations for server-side state
declare global {
  var userChannels: Record<string, string>;
  var channelToUserKey: Record<string, string>;
  var slackApp: any; // Using any for the Slack app type
}

// This endpoint gets or creates a Slack channel for a specific user
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');
    const email = searchParams.get('email');

    if (!username || !email) {
      return NextResponse.json({ error: 'Username and email are required' }, { status: 400 });
    }

    // Create userKey from username and email
    const userKey = `${username}:${email}`;

    console.log(`[API] Checking channel for userKey: ${userKey}`);
    console.log(`[API] Current userChannels:`, global.userChannels);

    // Check if we already have a channel for this user
    if (typeof global.userChannels !== 'undefined' && global.userChannels[userKey]) {
      console.log(`[API] Found channel for userKey ${userKey}: ${global.userChannels[userKey]}`);

      // Get channel info from Slack
      try {
        const slackApp = global.slackApp;
        if (!slackApp) {
          console.log(`[API] Slack app not initialized, returning channel ID only`);
          return NextResponse.json(
            {
              channelId: global.userChannels[userKey],
              message: 'Channel found for user (Slack app not initialized)',
            },
            { status: 200 },
          );
        }

        const channelInfo = await slackApp.client.conversations.info({
          channel: global.userChannels[userKey],
        });

        console.log(`[API] Got channel info: ${channelInfo.channel.name}`);
        return NextResponse.json({
          channelId: global.userChannels[userKey],
          channelName: channelInfo.channel.name,
          message: 'Channel found for user',
        });
      } catch (error) {
        console.error('[API] Error getting channel info:', error);
        return NextResponse.json({
          channelId: global.userChannels[userKey],
          message: 'Channel ID exists but could not get details',
        });
      }
    } else {
      console.log(`[API] No channel found for userKey ${userKey}`);
    }

    // Channel not found, let the server create it
    // We'll send the client the channel info on the next request
    // to avoid race conditions with channel creation
    return NextResponse.json({
      message:
        'Channel not found for user, it will be created automatically when you send a message',
    });
  } catch (error: any) {
    console.error('[API] Error in user-channel API:', error);
    return NextResponse.json(
      {
        error: error.message || 'Unknown error',
      },
      { status: 500 },
    );
  }
}

// Delete a user's channel
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');
    const confirm = searchParams.get('confirm');

    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    if (confirm !== 'true') {
      return NextResponse.json({ error: 'Confirmation required' }, { status: 400 });
    }

    // Check if we have a channel for this user
    if (typeof global.userChannels !== 'undefined' && global.userChannels[username]) {
      const channelId = global.userChannels[username];
      const slackApp = global.slackApp;

      if (!slackApp) {
        return NextResponse.json({ error: 'Slack app not initialized' }, { status: 500 });
      }

      try {
        // Archive the channel (Slack doesn't allow permanent deletion via API)
        await slackApp.client.conversations.archive({
          channel: channelId,
        });

        // Remove from our mapping
        delete global.userChannels[username];

        return NextResponse.json({
          success: true,
          message: `Channel for user ${username} has been archived`,
        });
      } catch (error: any) {
        console.error('Error archiving channel:', error);
        return NextResponse.json(
          {
            error: 'Failed to archive channel',
            details: error.message || 'Unknown error',
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json(
      {
        error: 'Channel not found for this user',
      },
      { status: 404 },
    );
  } catch (error: any) {
    console.error('Error in user-channel DELETE API:', error);
    return NextResponse.json(
      {
        error: error.message || 'Unknown error',
      },
      { status: 500 },
    );
  }
}
