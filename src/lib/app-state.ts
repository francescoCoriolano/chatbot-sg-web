import { Server as ServerIO } from "socket.io";
import { Server as HttpServer } from "http";

// Define types for our state
interface RecentMessages {
  chat_message: Message[];
  slack_message: Message[];
}

interface Message {
  id: string;
  text: string;
  sender: string;
  timestamp: string;
  isFromSlack: boolean;
  [key: string]: any; // For other properties
}

// Module-level variables
let _socketIO: ServerIO | undefined = undefined;
let _httpServer: HttpServer | undefined = undefined;
let _connectionCount = 0;
let _slackApp: any = undefined;
let _userChannels: Record<string, string> = {};
let _slackUserIds: Record<string, string> = {};
let _recentMessages: RecentMessages = {
  chat_message: [],
  slack_message: [],
};

// Socket IO
export function getSocketIO(): ServerIO | undefined {
  return _socketIO;
}

export function setSocketIO(io: ServerIO): void {
  _socketIO = io;
}

// HTTP Server
export function getHttpServer(): HttpServer | undefined {
  return _httpServer;
}

export function setHttpServer(server: HttpServer): void {
  _httpServer = server;
}

// Connection Count
export function getConnectionCount(): number {
  return _connectionCount;
}

export function setConnectionCount(count: number): void {
  _connectionCount = count;
}

export function incrementConnectionCount(): number {
  return ++_connectionCount;
}

export function decrementConnectionCount(): number {
  return --_connectionCount;
}

// Slack App
export function getSlackApp(): any {
  return _slackApp;
}

export function setSlackApp(app: any): void {
  _slackApp = app;
}

// User Channels
export function getUserChannels(): Record<string, string> {
  return _userChannels;
}

export function setUserChannel(username: string, channelId: string): void {
  _userChannels[username] = channelId;
}

export function getUserChannel(username: string): string | undefined {
  return _userChannels[username];
}

// Slack User IDs
export function getSlackUserIds(): Record<string, string> {
  return _slackUserIds;
}

export function setSlackUserId(username: string, slackUserId: string): void {
  _slackUserIds[username] = slackUserId;
}

export function getSlackUserId(username: string): string | undefined {
  return _slackUserIds[username];
}

// Recent Messages
export function getRecentMessages(): RecentMessages {
  return _recentMessages;
}

export function getChatMessages(): Message[] {
  return [..._recentMessages.chat_message];
}

export function getSlackMessages(): Message[] {
  return [..._recentMessages.slack_message];
}

export function addChatMessage(message: Message): void {
  _recentMessages.chat_message.push(message);

  const MAX_MESSAGES = 50;
  if (_recentMessages.chat_message.length > MAX_MESSAGES) {
    _recentMessages.chat_message.shift(); // Remove oldest
  }
}

export function addSlackMessage(message: Message): void {
  _recentMessages.slack_message.push(message);

  const MAX_MESSAGES = 50;
  if (_recentMessages.slack_message.length > MAX_MESSAGES) {
    _recentMessages.slack_message.shift(); // Remove oldest
  }
}

export function removeOldestChatMessage(): void {
  if (_recentMessages.chat_message.length > 0) {
    _recentMessages.chat_message.shift();
  }
}

export function removeOldestSlackMessage(): void {
  if (_recentMessages.slack_message.length > 0) {
    _recentMessages.slack_message.shift();
  }
}

// Export a default object for CommonJS compatibility
export default {
  getSocketIO,
  setSocketIO,
  getHttpServer,
  setHttpServer,
  getConnectionCount,
  setConnectionCount,
  incrementConnectionCount,
  decrementConnectionCount,
  getSlackApp,
  setSlackApp,
  getUserChannels,
  setUserChannel,
  getUserChannel,
  getSlackUserIds,
  setSlackUserId,
  getSlackUserId,
  getRecentMessages,
  getChatMessages,
  getSlackMessages,
  addChatMessage,
  addSlackMessage,
  removeOldestChatMessage,
  removeOldestSlackMessage,
};
