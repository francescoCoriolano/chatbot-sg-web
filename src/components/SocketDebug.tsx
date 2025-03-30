"use client";

import { useState, useEffect } from "react";
import { getSocket, isSocketConnected } from "@/utils/socket";
import { getInitializationStatus } from "@/lib/socket-server";

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
        const response = await fetch("/api/socket-status");
        if (response.ok) {
          const data = await response.json();
          setServerStatus(data.status);
          setConnectionCount(data.connectionCount);
        }
      } catch (error) {
        console.error("Failed to fetch socket status:", error);
      }
    };

    // Check immediately
    checkConnection();

    // Set up interval
    const interval = setInterval(checkConnection, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!isVisible) {
    return (
      <button onClick={() => setIsVisible(true)} className="fixed bottom-2 right-2 bg-gray-100 text-gray-800 px-3 py-1 rounded-md text-xs shadow-md hover:bg-gray-200">
        {isConnected ? "🟢" : "🔴"} Socket Debug
      </button>
    );
  }

  return (
    <div className="fixed bottom-2 right-2 bg-white border border-gray-300 rounded-md shadow-lg p-4 max-w-xs text-xs z-50">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-bold">Socket.IO Debug</h3>
        <button onClick={() => setIsVisible(false)} className="text-gray-500 hover:text-gray-700">
          ✕
        </button>
      </div>

      <div className="space-y-2">
        <div>
          <div className="flex justify-between">
            <span>Status:</span>
            <span className={`font-medium ${isConnected ? "text-green-600" : "text-red-600"}`}>{isConnected ? "Connected" : "Disconnected"}</span>
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
              <span className={`font-medium ${serverStatus.initialized ? "text-green-600" : serverStatus.initializing ? "text-yellow-600" : "text-red-600"}`}>
                {serverStatus.initialized ? "Running" : serverStatus.initializing ? "Starting" : "Not Started"}
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
                <div className="text-red-600 font-mono text-xs truncate">{serverStatus.error}</div>
              </div>
            )}
          </>
        )}

        <div className="text-gray-500 text-[10px] mt-2">Last checked: {new Date(lastChecked).toLocaleTimeString()}</div>

        <div className="flex space-x-2 mt-2">
          <button onClick={() => window.location.reload()} className="bg-blue-100 hover:bg-blue-200 text-blue-800 px-2 py-1 rounded text-xs">
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
            className="bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-2 py-1 rounded text-xs"
          >
            Reconnect
          </button>
        </div>
      </div>
    </div>
  );
}
