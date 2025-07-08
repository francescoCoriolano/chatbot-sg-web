const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');
const { App } = require('@slack/bolt');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// Initialize connection count
global.connectionCount = 0;

// Store recent messages in memory for reconnecting clients
const recentMessages = {
  chat_message: [],
  slack_message: [],
};

// Store channels created for each user
const userChannels = {};

// Store reverse mapping from channel ID to user key
const channelToUserKey = {};

// Store Slack user ID mappings (using userKey instead of just username)
const slackUserIds = {};

// Define default users that will be added to all channels
const DEFAULT_USERS = [
  //'U08KSE3CFE1', // Pavlo
  'U08L5K4DDNV', // Francesco
];

// Make these accessible globally
global.recentMessages = recentMessages;
global.userChannels = userChannels;
global.channelToUserKey = channelToUserKey;
global.slackUserIds = slackUserIds;

// Initialize DEFAULT_USERS if not already set
if (typeof global.DEFAULT_USERS === 'undefined') {
  global.DEFAULT_USERS = DEFAULT_USERS;
}

console.log('Initialized global variables:');
console.log('- userChannels:', Object.keys(global.userChannels));
console.log('- DEFAULT_USERS:', global.DEFAULT_USERS);

// Maximum number of recent messages to keep in memory
const MAX_RECENT_MESSAGES = 50;

app.prepare().then(() => {
  // Create HTTP server
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // Create Socket.IO server directly here
  const io = new Server(server, {
    path: '/api/socketio',
    addTrailingSlash: false,
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['polling', 'websocket'],
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // Check Slack configuration
  console.log('Checking Slack configuration:');
  console.log(`- SLACK_BOT_TOKEN: ${process.env.SLACK_BOT_TOKEN ? '✅ Configured' : '❌ Missing'}`);
  console.log(`- SLACK_APP_TOKEN: ${process.env.SLACK_APP_TOKEN ? '✅ Configured' : '❌ Missing'}`);
  console.log(
    `- SLACK_CHANNEL_ID: ${process.env.SLACK_CHANNEL_ID ? '✅ Configured' : '❌ Missing'}`,
  );

  // Initialize Slack app with Socket Mode
  const slackApp = new App({
    token: process.env.SLACK_BOT_TOKEN,
    appToken: process.env.SLACK_APP_TOKEN,
    socketMode: true,
  });

  // Make the Slack app globally accessible
  global.slackApp = slackApp;

  // Helper function to update a user's App Home tab with their channel info
  const updateAppHome = async (slackUserId, channelId, channelName, username) => {
    try {
      console.log(`Updating App Home for Slack user ${slackUserId} with channel ${channelName}`);

      // Create blocks for the Home tab view
      const blocks = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: 'Welcome to Chat App!',
            emoji: true,
          },
        },
        {
          type: 'divider',
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Your dedicated channel is ready:*`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*<#${channelId}|${channelName}>*`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Connected to username: *${username}*`,
            },
          ],
        },
        {
          type: 'divider',
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'Messages sent in the web app will appear in this channel.',
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Open Channel',
                emoji: true,
              },
              value: channelId,
              url: `https://slack.com/app_redirect?channel=${channelId}`,
              action_id: 'open_channel',
            },
          ],
        },
      ];

      // Publish the view to the App Home
      await slackApp.client.views.publish({
        user_id: slackUserId,
        view: {
          type: 'home',
          blocks,
        },
      });

      console.log(`✅ Updated App Home for user ${slackUserId}`);
    } catch (error) {
      console.error(`❌ Error updating App Home for user ${slackUserId}:`, error.message || error);
    }
  };

  // Helper function to create or get a channel for a user
  const getOrCreateChannelForUser = async (username, email) => {
    console.log(`🔍 Checking for channel for user: ${username} with email: ${email}`);

    if (!username || !email) {
      console.error('❌ Username or email missing in getOrCreateChannelForUser');
      return process.env.SLACK_CHANNEL_ID; // Fallback to default channel
    }

    console.log(`📊 Current userChannels:`, Object.keys(userChannels));

    // Create a unique key for this user combining username and email
    const userKey = `${username}:${email}`;
    console.log(`🔑 UserKey: ${userKey}`);

    // Check if we already have a channel for this user
    if (userChannels[userKey]) {
      console.log(`✅ Found existing channel for ${username} (${email}): ${userChannels[userKey]}`);
      return userChannels[userKey];
    }

    // Create a new channel for this user if we don't have one
    try {
      console.log(`🆕 Creating new Slack channel for user: ${username} with email: ${email}`);

      // Create channel name with better sanitization for Slack requirements
      // Slack channel names can only contain lowercase letters, numbers, hyphens, and underscores
      // They cannot contain @ . or other special characters
      const sanitizedUsername = username.toLowerCase().replace(/[^a-z0-9]/g, '');
      const sanitizedEmail = email.toLowerCase().replace(/[^a-z0-9]/g, '');

      const channelName = `user-${sanitizedUsername}-email-${sanitizedEmail}`.substring(0, 80);

      console.log(`📛 Channel name will be: ${channelName}`);

      // Create the channel
      const result = await slackApp.client.conversations.create({
        name: channelName,
        is_private: false,
      });

      // Store the channel ID using the unique key
      const channelId = result.channel.id;
      userChannels[userKey] = channelId;

      // Store reverse mapping from channel ID to userKey
      channelToUserKey[channelId] = userKey;

      // Make sure it's also available globally
      global.userChannels[userKey] = channelId;
      global.channelToUserKey[channelId] = userKey;

      console.log(
        `✅ Created new channel for ${username} (${email}): ${channelId} (${channelName})`,
      );
      console.log(`📊 Updated userChannels:`, Object.keys(userChannels));
      console.log(`🔄 Updated channelToUserKey:`, Object.keys(channelToUserKey));

      // Announce in the channel
      await slackApp.client.chat.postMessage({
        channel: channelId,
        text: `:tada: This channel has been created for *${username}* (${email}) from the Chat App.\nMessages from this user will appear here.`,
      });

      // Invite the default users to the channel
      for (const userId of global.DEFAULT_USERS) {
        try {
          await slackApp.client.conversations.invite({
            channel: channelId,
            users: userId,
          });
          console.log(`✅ Invited user ${userId} to channel ${channelId}`);
        } catch (inviteError) {
          console.error(
            `❌ Error inviting user ${userId} to channel ${channelId}:`,
            inviteError.message || inviteError,
          );
        }
      }

      // Find the user in existing messages to get their Slack ID
      const existingMessages = [...recentMessages.chat_message, ...recentMessages.slack_message];
      const userMessage = existingMessages.find(m => m.sender === username && m.slackUserId);

      if (userMessage && userMessage.slackUserId) {
        // Update the App Home view for this user
        await updateAppHome(userMessage.slackUserId, channelId, result.channel.name, username);
      }

      return channelId;
    } catch (error) {
      console.error(
        `❌ Error creating channel for user ${username} (${email}):`,
        error.message || error,
      );

      // Store the fallback mapping to prevent repeated attempts
      const fallbackChannelId = process.env.SLACK_CHANNEL_ID;
      userChannels[userKey] = fallbackChannelId;
      channelToUserKey[fallbackChannelId] = userKey;

      // Make sure it's also available globally
      global.userChannels[userKey] = fallbackChannelId;
      global.channelToUserKey[fallbackChannelId] = userKey;

      console.log(
        `⚠️ Stored fallback channel mapping for ${username} (${email}): ${fallbackChannelId}`,
      );
      console.log(`📊 Updated userChannels:`, Object.keys(userChannels));

      // Fallback to default channel
      return fallbackChannelId;
    }
  };

  // Start the Slack app
  (async () => {
    try {
      await slackApp.start();
      console.log('⚡️ Slack app is running in Socket Mode!');

      // Handle App Home opened events
      slackApp.event('app_home_opened', async ({ event, client }) => {
        console.log(`App Home opened by user ${event.user}`);

        // Find the userKey associated with this Slack user ID
        let username = null;
        let userKey = null;
        let channelId = null;

        // Look up by Slack user ID
        for (const [ukey, slackId] of Object.entries(slackUserIds)) {
          if (slackId === event.user) {
            userKey = ukey;
            username = ukey.split(':')[0]; // Extract username from userKey
            channelId = userChannels[ukey];
            break;
          }
        }

        if (username && channelId) {
          try {
            // Get channel info
            const channelInfo = await client.conversations.info({
              channel: channelId,
            });

            // Update the App Home view
            await updateAppHome(event.user, channelId, channelInfo.channel.name, username);
          } catch (error) {
            console.error(`Error updating App Home for ${username}:`, error);
          }
        } else {
          // Show generic welcome screen
          const blocks = [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: 'Welcome to Chat App!',
                emoji: true,
              },
            },
            {
              type: 'divider',
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: "You haven't sent any messages in the Chat App yet. Once you do, your dedicated channel will appear here.",
              },
            },
          ];

          // Publish the generic view
          await client.views.publish({
            user_id: event.user,
            view: {
              type: 'home',
              blocks,
            },
          });
        }
      });

      // Listen for message events from Slack
      slackApp.message(async ({ message, say }) => {
        console.log('Received message from Slack:', message);

        // Skip messages from our app and system messages
        if (message.subtype || message.bot_id) {
          console.log('Skipping bot/system message');
          return;
        }

        // Get channel info
        const channelInfo = await slackApp.client.conversations.info({
          channel: message.channel,
        });

        // Find the username associated with this channel
        const channelName = channelInfo.channel.name;
        let targetUser = null;
        let targetUserKey = null;

        // Use reverse mapping to find the userKey for this channel
        targetUserKey = channelToUserKey[message.channel];

        if (targetUserKey) {
          // Extract username from userKey (format: "username:email")
          targetUser = targetUserKey.split(':')[0];

          // Store the Slack user ID for this userKey if we haven't already
          if (!slackUserIds[targetUserKey] && message.user) {
            slackUserIds[targetUserKey] = message.user;
            console.log(`Associated Slack user ID ${message.user} with userKey ${targetUserKey}`);

            // If this is the first message from this user, update their App Home
            if (message.channel) {
              updateAppHome(message.user, message.channel, channelName, targetUser);
            }
          }
        }

        // Format the message for our app
        const slackMessage = {
          id: message.ts || Date.now().toString(),
          text: message.text || '',
          sender: message.user_profile?.real_name || 'Slack User',
          userId: message.user || 'unknown_slack_user',
          slackUserId: message.user,
          timestamp: new Date(parseInt(message.ts?.split('.')[0]) * 1000).toISOString(),
          isFromSlack: true,
          channelId: message.channel,
          channelName: channelName,
          targetUser: targetUser, // Who this message is intended for
        };

        // Store in recent messages cache
        recentMessages.slack_message.push(slackMessage);
        if (recentMessages.slack_message.length > MAX_RECENT_MESSAGES) {
          recentMessages.slack_message.shift(); // Remove oldest message
        }

        // Broadcast to all connected clients
        io.emit('slack_message', slackMessage);

        console.log(`Broadcasted Slack message from channel ${channelName} to clients`);
      });

      // Listen for channel_archived events to clean up userChannels
      slackApp.event('channel_archived', async ({ event }) => {
        console.log('Channel archived event received:', event);

        const archivedChannelId = event.channel;

        // Use reverse mapping to find the userKey for this channel
        const userKey = channelToUserKey[archivedChannelId];

        if (userKey) {
          const username = userKey.split(':')[0]; // Extract username from userKey
          console.log(
            `Removing archived channel ${archivedChannelId} for userKey ${userKey} from userChannels`,
          );

          // Get the Slack user ID for this userKey
          const slackUserId = slackUserIds[userKey];

          // Remove the channel from userChannels and reverse mapping
          delete userChannels[userKey];
          delete channelToUserKey[archivedChannelId];

          // If we have a Slack user ID for this user, update their App Home
          if (slackUserId) {
            try {
              // Show generic welcome screen since the channel is now gone
              const blocks = [
                {
                  type: 'header',
                  text: {
                    type: 'plain_text',
                    text: 'Welcome to Chat App!',
                    emoji: true,
                  },
                },
                {
                  type: 'divider',
                },
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: 'Your channel has been deleted. The next time you send a message, a new channel will be created for you.',
                  },
                },
              ];

              // Publish the generic view
              await slackApp.client.views.publish({
                user_id: slackUserId,
                view: {
                  type: 'home',
                  blocks,
                },
              });

              console.log(`✅ Updated App Home for user ${slackUserId} after channel deletion`);
            } catch (error) {
              console.error(
                `❌ Error updating App Home for user ${slackUserId}:`,
                error.message || error,
              );
            }
          }
        }
      });

      // Listen for channel_deleted events to clean up userChannels (although rare in Slack)
      slackApp.event('channel_deleted', async ({ event }) => {
        console.log('Channel deleted event received:', event);

        const deletedChannelId = event.channel;

        // Use reverse mapping to find the userKey for this channel
        const userKey = channelToUserKey[deletedChannelId];

        if (userKey) {
          const username = userKey.split(':')[0]; // Extract username from userKey
          console.log(
            `Removing deleted channel ${deletedChannelId} for userKey ${userKey} from userChannels`,
          );

          // Get the Slack user ID for this userKey
          const slackUserId = slackUserIds[userKey];

          // Remove the channel from userChannels and reverse mapping
          delete userChannels[userKey];
          delete channelToUserKey[deletedChannelId];

          // If we have a Slack user ID for this user, update their App Home
          if (slackUserId) {
            try {
              // Show generic welcome screen since the channel is now gone
              const blocks = [
                {
                  type: 'header',
                  text: {
                    type: 'plain_text',
                    text: 'Welcome to Chat App!',
                    emoji: true,
                  },
                },
                {
                  type: 'divider',
                },
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: 'Your channel has been deleted. The next time you send a message, a new channel will be created for you.',
                  },
                },
              ];

              // Publish the generic view
              await slackApp.client.views.publish({
                user_id: slackUserId,
                view: {
                  type: 'home',
                  blocks,
                },
              });

              console.log(`✅ Updated App Home for user ${slackUserId} after channel deletion`);
            } catch (error) {
              console.error(
                `❌ Error updating App Home for user ${slackUserId}:`,
                error.message || error,
              );
            }
          }
        }
      });
    } catch (error) {
      console.error('⚠️ Error starting Slack app:', error);
    }
  })();

  // Basic Socket.IO event handlers
  io.on('connection', socket => {
    // Increment global connection count
    global.connectionCount++;
    console.log(`Socket connected: ${socket.id}, total connections: ${global.connectionCount}`);

    // Send welcome message
    socket.emit('welcome', {
      message: 'Welcome to the Socket.IO server!',
      socketId: socket.id,
      timestamp: new Date().toISOString(),
    });

    // Send recent messages to newly connected clients
    if (recentMessages.chat_message.length > 0) {
      recentMessages.chat_message.forEach(message => {
        socket.emit('chat_message', message);
      });
    }

    if (recentMessages.slack_message.length > 0) {
      recentMessages.slack_message.forEach(message => {
        socket.emit('slack_message', message);
      });
    }

    // Handle disconnection
    socket.on('disconnect', () => {
      global.connectionCount--;
      console.log(
        `Socket disconnected: ${socket.id}, total connections: ${global.connectionCount}`,
      );
    });

    // Handle chat messages from clients
    socket.on('chat_message', async data => {
      console.log('🔥 RAW SOCKET DATA RECEIVED:', JSON.stringify(data, null, 2));

      // Add isFromSlack=false flag if not present
      const message = {
        ...data,
        isFromSlack: false,
      };

      console.log('📨 PROCESSED MESSAGE OBJECT:', {
        id: message.id,
        sender: message.sender,
        email: message.email,
        text: message.text ? message.text.substring(0, 50) + '...' : 'NO TEXT',
        hasEmail: !!message.email,
        hasUsername: !!message.sender,
        allKeys: Object.keys(message),
      });

      // Validate required fields
      if (!message.sender) {
        console.error('❌ NO SENDER in message:', message);
        return;
      }

      if (!message.email) {
        console.error('❌ NO EMAIL in message:', message);
        console.error('❌ Falling back to default channel due to missing email');
        // Don't return here, let it fall back to default channel behavior
      }

      // Store the message in our recent messages cache
      recentMessages.chat_message.push(message);
      if (recentMessages.chat_message.length > MAX_RECENT_MESSAGES) {
        recentMessages.chat_message.shift(); // Remove oldest message
      }

      // Broadcast to all clients
      io.emit('chat_message', message);

      // Send to Slack if bot token is available
      if (process.env.SLACK_BOT_TOKEN) {
        try {
          console.log(
            `🚀 Attempting to get/create channel for user: "${message.sender}" with email: "${message.email}"`,
          );

          let channelId;
          if (message.email) {
            // Get channel ID for the message sender with email
            channelId = await getOrCreateChannelForUser(message.sender, message.email);
          } else {
            console.warn('⚠️ No email provided, using default channel');
            channelId = process.env.SLACK_CHANNEL_ID;
          }

          console.log(`📺 Got channel ID: ${channelId} for user ${message.sender}`);

          // Send message to Slack
          slackApp.client.chat
            .postMessage({
              channel: channelId,
              text: `From ${message.sender}${message.email ? ` (${message.email})` : ''}: ${message.text}`,
              unfurl_links: false,
              unfurl_media: false,
            })
            .then(async result => {
              console.log(
                `✅ Message sent to channel ${channelId} for user ${message.sender}:`,
                result.ts,
              );

              // Store the mapping of message ID to channel ID for reply tracking
              message.slackChannelId = channelId;
              message.slackTs = result.ts;

              // If this message was posted by a Slack user who sent previous messages,
              // update their App Home too
              try {
                if (message.email) {
                  // Create userKey for lookup
                  const userKey = `${message.sender}:${message.email}`;

                  if (message.slackUserId || slackUserIds[userKey]) {
                    const slackUserId = message.slackUserId || slackUserIds[userKey];

                    // Get channel info for the name
                    const channelInfo = await slackApp.client.conversations.info({
                      channel: channelId,
                    });

                    await updateAppHome(
                      slackUserId,
                      channelId,
                      channelInfo.channel.name,
                      message.sender,
                    );
                  }
                }
              } catch (homeError) {
                console.error('Error updating App Home after message send:', homeError);
              }
            })
            .catch(error => {
              console.error('❌ Error sending message to Slack:', error.message || error);
              if (error.data) {
                console.error('  Error details:', JSON.stringify(error.data));
              }
            });
        } catch (error) {
          console.error('❌ Error sending to Slack:', error.message || error);
        }
      } else {
        console.warn('❌ Slack bot token missing - not forwarding message to Slack');
      }
    });

    // Handle subscription requests
    socket.on('subscribe_events', data => {
      console.log(`Client ${socket.id} subscribing to events:`, data.events);
    });

    // Handle requests for missed messages
    socket.on('get_missed_messages', data => {
      // Send all recent messages to the client
      if (recentMessages.chat_message.length > 0) {
        recentMessages.chat_message.forEach(message => {
          socket.emit('chat_message', message);
        });
      }

      if (recentMessages.slack_message.length > 0) {
        recentMessages.slack_message.forEach(message => {
          socket.emit('slack_message', message);
        });
      }

      socket.emit('missed_messages_complete', {
        requestId: data.requestId,
        count: recentMessages.chat_message.length + recentMessages.slack_message.length,
      });
    });
  });

  // Make the HTTP server and Socket.IO accessible globally
  global.httpServer = server;
  global.socketIO = io;

  // Start the server
  const startServer = port => {
    server.listen(port, err => {
      if (err) {
        if (err.code === 'EADDRINUSE') {
          console.log(`⚠️ Port ${port} is already in use. Trying alternative port...`);
          if (port === 3000) {
            startServer(3030);
          } else {
            console.error(
              `❌ Alternative port ${port} is also in use. Please specify a different port using the PORT environment variable.`,
            );
            process.exit(1);
          }
        } else {
          console.error('Server error:', err);
          throw err;
        }
      } else {
        console.log(`> Ready on http://localhost:${port}`);
      }
    });
  };

  const defaultPort = process.env.PORT || 3000;
  startServer(defaultPort);
});
