import { formatDistanceToNow } from 'date-fns';
import Image from 'next/image';
import { Message } from '@/types';

interface MessageBubbleProps {
  message: Message;
  currentUsername: string;
}

export function MessageBubble({ message, currentUsername }: MessageBubbleProps) {
  const isCurrentUser = message.sender === currentUsername;

  return (
    <div className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}>
      {!isCurrentUser && (
        <div className="flex-shrink-0">
          <Image
            src="/images/sgLogo.svg"
            alt="Studio Graphene Logo"
            width={32}
            height={32}
            className="h-8 w-8"
          />
        </div>
      )}
      <div
        className={`message-bubble max-w-xs px-3 py-2 text-xs shadow-sm ${
          isCurrentUser
            ? 'rounded-tl-[20px] rounded-tr-[2px] rounded-br-[20px] rounded-bl-[20px] bg-blue-600 text-white'
            : message.isFromSlack
              ? 'bg-chat-message-area rounded-tl-[2px] rounded-tr-[20px] rounded-br-[20px] rounded-bl-[20px] text-white'
              : 'rounded-tl-[2px] rounded-tr-[20px] rounded-br-[20px] rounded-bl-[20px] border border-gray-200 bg-white text-gray-900'
        }`}
      >
        <div className="mb-1 text-xs font-medium">
          <span className="text-xs opacity-75">
            {formatDistanceToNow(new Date(message.timestamp), {
              addSuffix: true,
            })}
          </span>
        </div>
        <p className="text-xs break-words whitespace-pre-wrap">{message.text}</p>
      </div>
    </div>
  );
}
