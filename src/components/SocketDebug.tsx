'use client';

import { useState, useEffect } from 'react';
import { getSocket, isSocketConnected } from '@/utils/socket';
import { getInitializationStatus } from '@/lib/socket-server';

export default function SocketDebug() {
  const [isConnected, setIsConnected] = useState(false);
  const [socketId, setSocketId] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [serverStatus, setServerStatus] = useState<{
    initialized: boolean;
    initializing: boolean;
    error: string | null;
  } | null>(null);
  const [lastChecked, setLastChecked] = useState<string>(new Date().toISOString());
  const [connectionCount, setConnectionCount] = useState<number | null>(null);
  //console.log('serverStatus', serverStatus);
  // Check connection status every 5 seconds
  useEffect(() => {
    const checkConnection = async () => {
      const socket = getSocket();
      const connected = isSocketConnected();
      setIsConnected(connected);
      setSocketId(socket?.id || null);
      setLastChecked(new Date().toISOString());

      // Fetch server-side status
      try {
        const response = await fetch('/api/socket-status');
        if (response.ok) {
          const data = await response.json();
          setServerStatus(data.status);
          setConnectionCount(data.connectionCount);
        }
      } catch (error) {
        console.error('Failed to fetch socket status:', error);
      }
    };

    // Check immediately
    checkConnection();

    // TO DO:
    // 1. Add a chat widget that will trigger chat window to open ( useState needed)
    // 2. Include Welcome form in chat window

    // Set up interval
    const interval = setInterval(checkConnection, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed right-2 bottom-2 rounded-md bg-gray-100 px-3 py-1 text-xs text-gray-800 shadow-md hover:bg-gray-200"
      >
        {isConnected ? '🟢' : '🔴'} Socket Debug
      </button>
    );
  }

  return (
    <div className="fixed right-2 bottom-2 z-50 max-w-xs rounded-md border border-gray-300 bg-white p-4 text-xs shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-bold">Socket.IO Debug</h3>
        <button onClick={() => setIsVisible(false)} className="text-gray-500 hover:text-gray-700">
          ✕
        </button>
      </div>

      <div className="space-y-2">
        <div>
          <div className="flex justify-between">
            <span>Status:</span>
            <span className={`font-medium ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        {socketId && (
          <div className="flex justify-between">
            <span>Socket ID:</span>
            <span className="font-mono">{socketId}</span>
          </div>
        )}

        {serverStatus && (
          <>
            <div className="flex justify-between">
              <span>Server:</span>
              <span
                className={`font-medium ${serverStatus.initialized ? 'text-green-600' : serverStatus.initializing ? 'text-yellow-600' : 'text-red-600'}`}
              >
                {serverStatus.initialized
                  ? 'Running'
                  : serverStatus.initializing
                    ? 'Starting'
                    : 'Not Started'}
              </span>
            </div>

            {connectionCount !== null && (
              <div className="flex justify-between">
                <span>Connected clients:</span>
                <span>{connectionCount}</span>
              </div>
            )}

            {serverStatus.error && (
              <div className="mt-1">
                <div className="text-red-600">Error:</div>
                <div className="truncate font-mono text-xs text-red-600">{serverStatus.error}</div>
              </div>
            )}
          </>
        )}

        <div className="mt-2 text-[10px] text-gray-500">
          Last checked: {new Date(lastChecked).toLocaleTimeString()}
        </div>

        <div className="mt-2 flex space-x-2">
          <button
            onClick={() => window.location.reload()}
            className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-800 hover:bg-blue-200"
          >
            Refresh Page
          </button>
          <button
            onClick={() => {
              const socket = getSocket();
              if (socket) {
                if (!socket.connected) {
                  socket.connect();
                } else {
                  socket.disconnect();
                  setTimeout(() => socket.connect(), 1000);
                }
              }
            }}
            className="rounded bg-yellow-100 px-2 py-1 text-xs text-yellow-800 hover:bg-yellow-200"
          >
            Reconnect
          </button>
        </div>
      </div>
    </div>
  );
}
