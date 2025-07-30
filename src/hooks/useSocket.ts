import { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { Message } from '@/types';
import {
  initializeSocket,
  disconnectSocket,
  isSocketConnected,
  isUsingSocketMode,
  sendMessageViaSocket,
} from '@/utils/socket';

interface UseSocketReturn {
  isConnected: boolean;
  usingFallbackMode: boolean;
  error: string | null;
  sendMessage: (message: Message) => boolean;
  socket: Socket | null;
  onChatMessage: (handler: (message: Message) => void) => void;
  onSlackMessage: (handler: (message: Message) => void) => void;
}

export function useSocket(username: string, email: string): UseSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [usingFallbackMode, setUsingFallbackMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const mounted = useRef(true);

  // Store message handlers
  const chatMessageHandlerRef = useRef<((message: Message) => void) | null>(null);
  const slackMessageHandlerRef = useRef<((message: Message) => void) | null>(null);

  useEffect(() => {
    // Don't establish connection until username is set
    if (!username) return;

    const ensureSocketServer = async () => {
      try {
        console.log('Initializing Socket.IO server...');
        const initResponse = await fetch('/api/socket-init');
        const initData = await initResponse.json();

        if (initData.success) {
          console.log('Socket server initialized:', initData.status);
        } else {
          console.error('Failed to initialize socket server:', initData.error);
          setError('Failed to connect to chat server. Please refresh the page.');
        }
      } catch (error) {
        console.error('Error initializing socket server:', error);
        setError('Failed to connect to chat server. Please refresh the page.');
      }
    };

    ensureSocketServer();

    // Initialize Socket.IO
    const socket = initializeSocket();
    socketRef.current = socket;

    if (!socket) {
      setError('Failed to connect to chat server. Please refresh the page.');
      return;
    }

    // Connection events
    const onConnect = () => {
      setIsConnected(true);
      setError(null);
    };

    const onDisconnect = (reason: string) => {
      setIsConnected(false);
      if (reason === 'io server disconnect') {
        socket.connect();
      }
    };

    const onConnectError = (err: Error) => {
      setError(`Connection error: ${err.message}. Retrying...`);
    };

    const onReconnect = () => {
      setIsConnected(true);
      setError(null);
    };

    const onReconnectAttempt = (attemptNumber: number) => {
      setError(`Connection lost. Reconnecting (attempt ${attemptNumber})...`);
    };

    const onReconnectError = (err: Error) => {
      setError(`Reconnection error: ${err.message}`);
    };

    const onReconnectFailed = () => {
      setError('Failed to reconnect after multiple attempts. Please refresh the page.');
    };

    // Handle chat messages
    const handleChatMessage = (message: Message) => {
      if (chatMessageHandlerRef.current) {
        chatMessageHandlerRef.current(message);
      }
    };

    // Handle slack messages
    const handleSlackMessage = (message: Message) => {
      if (slackMessageHandlerRef.current) {
        slackMessageHandlerRef.current(message);
      }
    };

    // Check connection mode
    const checkConnectionMode = () => {
      const usingSocket = isUsingSocketMode();
      setUsingFallbackMode(!usingSocket);
    };

    // Register event handlers
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('welcome', () => setIsConnected(true));
    socket.io.on('reconnect', onReconnect);
    socket.io.on('reconnect_attempt', onReconnectAttempt);
    socket.io.on('reconnect_error', onReconnectError);
    socket.io.on('reconnect_failed', onReconnectFailed);
    socket.on('chat_message', handleChatMessage);
    socket.on('slack_message', handleSlackMessage);

    // Check connection mode on connect/disconnect
    socket.on('connect', checkConnectionMode);
    socket.on('disconnect', checkConnectionMode);

    checkConnectionMode();

    return () => {
      // Cleanup
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('welcome');
      socket.off('chat_message', handleChatMessage);
      socket.off('slack_message', handleSlackMessage);
      socket.io.off('reconnect', onReconnect);
      socket.io.off('reconnect_attempt', onReconnectAttempt);
      socket.io.off('reconnect_error', onReconnectError);
      socket.io.off('reconnect_failed', onReconnectFailed);

      mounted.current = false;
    };
  }, [username, email]);

  // Clean up socket on unmount
  useEffect(() => {
    return () => {
      disconnectSocket();
    };
  }, []);

  const sendMessage = (message: Message): boolean => {
    return sendMessageViaSocket(message);
  };

  const onChatMessage = (handler: (message: Message) => void) => {
    chatMessageHandlerRef.current = handler;
  };

  const onSlackMessage = (handler: (message: Message) => void) => {
    slackMessageHandlerRef.current = handler;
  };

  return {
    isConnected,
    usingFallbackMode,
    error: error,
    sendMessage,
    socket: socketRef.current,
    onChatMessage,
    onSlackMessage,
  };
}
