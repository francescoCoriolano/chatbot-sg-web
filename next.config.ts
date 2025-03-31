import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  env: {
    NEXT_PUBLIC_SOCKET_PATH: '/api/socketio',
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV || 'development',
    NEXT_PUBLIC_SOCKET_TIMEOUT: '20000',
  },
  // Ensure Server Components can access these env vars
  serverRuntimeConfig: {
    SLACK_APP_TOKEN: process.env.SLACK_APP_TOKEN,
    SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
    SLACK_CHANNEL_ID: process.env.SLACK_CHANNEL_ID,
  },
  // Webpack config to handle Socket.IO
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Client-side bundle
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        fs: false,
      };
    }

    return config;
  },
};

export default nextConfig;
