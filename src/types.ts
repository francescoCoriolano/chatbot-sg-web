export interface Message {
  id: string;
  text: string;
  sender: string;
  timestamp: string;
  isFromSlack: boolean;
  isFromApp?: boolean;
  userId?: string;
}
