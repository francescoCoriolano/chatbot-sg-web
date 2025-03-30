# Slack Chat Integration App

A real-time chat application that integrates with Slack, allowing seamless communication between a web interface and Slack channels.

## Features

- **Real-time Messaging**: Messages sent from the web app appear in Slack and vice versa
- **User-specific Channels**: Each user gets their own dedicated Slack channel
- **App Home Integration**: Users can see their channel information directly in the Slack App Home
- **Socket Mode**: Uses Slack's Socket Mode for reliable real-time communication
- **Persistent Message History**: Messages are cached and available to new users who join
- **Reconnection Handling**: Robust socket connection with automatic reconnection

## Setup Instructions

### Prerequisites

- Node.js (v16+)
- pnpm package manager
- A Slack workspace with admin privileges
- Ngrok or similar tool for exposing your local server (for development)

### Step 1: Clone and Install

```bash
git clone https://github.com/pavlo-sg/chatbot.git
cd chat-app
pnpm install
```

### Step 2: Create a Slack App (if you don't have one, and we do have one)

1. Go to [Slack API Dashboard](https://api.slack.com/apps)
2. Click "Create New App" → "From scratch"
3. Name your app and select your workspace
4. Configure the app as described in the next section

### Step 3: Configure Slack App (if you don't have one, and we do have one)

#### Required OAuth Scopes

Navigate to "OAuth & Permissions" and add these Bot Token Scopes:

- `channels:manage` - To create user-specific channels
- `channels:read` - To read channel information
- `chat:write` - To send messages to channels
- `im:write` - To send direct messages
- `views:write` - To update the App Home
- `app_mentions:read` - To receive mention notifications
- `users:read` - To read user information

#### Enable Socket Mode (if you don't have one, and we do have one)

1. Go to "Socket Mode" in your app settings
2. Toggle "Enable Socket Mode" to On
3. Create an app-level token with the `connections:write` scope
4. Copy the app token (starts with `xapp-`)

#### Install the App to Your Workspace (if you don't have one, and we do have one)

1. Go to "Install App" in your app settings
2. Click "Install to Workspace"
3. Authorize the app

### Step 4: Configure Environment Variables (ask team for these)

Create a `.env.local` file in the project root with these variables:

```
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_CHANNEL_ID=default-channel-id
```

### Step 5: Run the App

```bash
pnpm run dev
```

The app will start on http://localhost:3000

## How It Works

### Architecture Overview

This app uses:

- **Next.js**: For the web frontend and API routes
- **Socket.IO**: For real-time communication between clients and server
- **Slack Bolt SDK**: For Slack integration with Socket Mode

### Communication Flow

1. **Web to Slack**: Messages sent from the web app are:

   - Displayed immediately in the web interface
   - Sent to the user's dedicated Slack channel
   - Stored in the message cache

2. **Slack to Web**: Messages sent from Slack are:

   - Captured via Socket Mode
   - Broadcast to all connected web clients
   - Stored in the message cache

3. **User Channels**: Each user gets a dedicated channel that:
   - Is created automatically on first message
   - Appears in the App Home tab (todo)
   - Has a welcome message explaining (todo)

## Advanced Configuration

### Custom Channel Naming

You can modify the channel naming format in `src/server.js` in the `getOrCreateChannelForUser` function:

```javascript
const channelName = `chat-app-${username
  .toLowerCase()
  .replace(/[^a-z0-9]/g, "-")
  .substring(0, 70)}`;
```

### Message Display Customization

Message styling can be customized in `src/app/page.tsx` in the message rendering section.

## Troubleshooting

### Common Issues

1. **Messages Not Appearing in Slack**

   - Check that your bot token has the correct scopes
   - Ensure the app is properly installed to your workspace
   - Verify the channel exists and the bot is a member

2. **Channel Creation Failed**

   - Ensure your bot has `channels:manage` scope
   - Check server logs for specific error messages

3. **Socket Connection Issues**
   - Verify your app token starts with `xapp-`
   - Check that Socket Mode is enabled in your Slack app

## Development

### Project Structure

- `src/app/page.tsx`: Main chat interface
- `src/server.js`: Server-side Socket.IO and Slack integration
- `src/app/api/`: API routes for various endpoints
- `src/utils/socket.ts`: Socket client utilities
- `src/types.ts`: TypeScript type definitions

### Adding Features

To add new features:

1. Identify which part of the system needs modification
2. Make changes to the appropriate files
3. Test both the web interface and Slack integration
4. Update documentation as needed

## License

[Your license information here]
