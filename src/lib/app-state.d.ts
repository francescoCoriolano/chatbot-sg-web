import { Server as ServerIO } from "socket.io";
import { Server as HttpServer } from "http";

export interface Message {
  id: string;
  text: string;
  sender: string;
  timestamp: string;
  isFromSlack: boolean;
  [key: string]: any;
}

export interface RecentMessages {
  chat_message: Message[];
  slack_message: Message[];
}

// Socket IO
export function getSocketIO(): ServerIO | undefined;
export function setSocketIO(io: ServerIO): void;

// HTTP Server
export function getHttpServer(): HttpServer | undefined;
export function setHttpServer(server: HttpServer): void;

// Connection Count
export function getConnectionCount(): number;
export function setConnectionCount(count: number): void;
export function incrementConnectionCount(): number;
export function decrementConnectionCount(): number;

// Slack App
export function getSlackApp(): any;
export function setSlackApp(app: any): void;

// User Channels
export function getUserChannels(): Record<string, string>;
export function setUserChannel(username: string, channelId: string): void;
export function getUserChannel(username: string): string | undefined;

// Slack User IDs
export function getSlackUserIds(): Record<string, string>;
export function setSlackUserId(username: string, slackUserId: string): void;
export function getSlackUserId(username: string): string | undefined;

// Recent Messages
export function getRecentMessages(): RecentMessages;
export function getChatMessages(): Message[];
export function getSlackMessages(): Message[];
export function addChatMessage(message: Message): void;
export function addSlackMessage(message: Message): void;
export function removeOldestChatMessage(): void;
export function removeOldestSlackMessage(): void;
