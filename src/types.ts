export interface Message {
  id: string;
  text: string;
  sender: string;
  timestamp: string;
  isFromSlack: boolean;
  isFromApp?: boolean;
  userId?: string;
  slackTs?: string;
  slackChannelId?: string;
  channelId?: string;
  channelName?: string;
  targetUser?: string;
}
