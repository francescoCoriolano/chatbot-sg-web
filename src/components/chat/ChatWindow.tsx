import { forwardRef } from 'react';
import Image from 'next/image';
import { Message } from '@/types';
import { MessageBubble } from './MessageBubble';
import { UserSetupForm } from '../forms/UserSetupForm';
import { LogoutModal } from '../modals/LogoutModal';

interface TypingUser {
  id: string;
  name?: string;
}

interface ChatWindowProps {
  // Window state
  isOpen: boolean;
  isMinimized: boolean;
  unreadMessagesCount: number;

  // User data
  username: string;
  email: string;
  isSettingUsername: boolean;

  // Messages
  messages: Message[];
  newMessage: string;
  isLoading: boolean;
  slackTypingUsers: TypingUser[];

  // UI state
  error: string | null;
  successMessage: string;
  isLogoutModalOpen: boolean;
  connectionStatus: 'live' | 'polling' | 'offline';

  // Event handlers
  onClose: () => void;
  onMinimize: () => void;
  onRestore: () => void;
  onLogout: () => void;
  onSendMessage: (e: React.FormEvent) => void;
  onMessageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSetUsername: (username: string, email: string) => void;
  onCloseLogoutModal: () => void;
  onOpenLogoutModal: () => void;

  // Refs
  messageInputRef: React.RefObject<HTMLInputElement>;
  messagesEndRef: React.RefObject<HTMLDivElement>;
}

export const ChatWindow = forwardRef<HTMLDivElement, ChatWindowProps>(
  (
    {
      isOpen,
      isMinimized,
      unreadMessagesCount,
      username,
      email,
      isSettingUsername,
      messages,
      newMessage,
      isLoading,
      slackTypingUsers,
      error,
      successMessage,
      isLogoutModalOpen,
      connectionStatus,
      onClose,
      onMinimize,
      onRestore,
      onLogout,
      onSendMessage,
      onMessageChange,
      onSetUsername,
      onCloseLogoutModal,
      onOpenLogoutModal,
      messageInputRef,
      messagesEndRef,
    },
    ref,
  ) => {
    if (!isOpen) return null;

    const renderConnectionStatus = () => {
      if (connectionStatus === 'live') {
        return (
          <div className="flex items-center text-xs font-bold text-green-400">
            <div className="mr-1 h-1.5 w-1.5 rounded-full bg-green-400"></div>
            Live
          </div>
        );
      } else if (connectionStatus === 'polling') {
        return (
          <div className="flex items-center text-xs font-bold text-white">
            <div className="mr-1 h-1.5 w-1.5 rounded-full bg-amber-400"></div>
            Polling
          </div>
        );
      }
      return null;
    };

    return (
      <div ref={ref} className="fixed right-5 bottom-5 z-50 rounded-[12px]">
        <div
          className={`flex ${isMinimized ? 'h-auto' : 'h-[485px]'} w-[405px] flex-col border border-gray-200 bg-white shadow-2xl`}
        >
          {/* Chat Header */}
          <div className="bg-chat-primary h-[42px] rounded-t-[12px] px-4 py-3 text-white transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <span className="mr-2 text-sm font-bold">Studio Graphene</span>
                {isMinimized && unreadMessagesCount > 0 && (
                  <div className="bg-chat-notification mr-2 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white">
                    {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
                  </div>
                )}

                {renderConnectionStatus()}
              </div>
              <div className="flex justify-between space-x-2">
                <button
                  onClick={e => {
                    e.stopPropagation();
                    isMinimized ? onRestore() : onMinimize();
                  }}
                  className={`cursor-pointer text-xs opacity-75 transition-opacity hover:opacity-100 ${!isMinimized ? 'mt-2' : ''}`}
                  title={isMinimized ? 'Expand chat' : 'Minimize chat'}
                >
                  <Image
                    src={
                      isMinimized
                        ? '/images/icons/explandChatIconArrow.svg'
                        : '/images/icons/reduceIcon.svg'
                    }
                    alt={isMinimized ? 'expand' : 'minimize'}
                    width={16}
                    height={16}
                    className="h-3.5 w-3.5"
                  />
                </button>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onOpenLogoutModal();
                  }}
                  className="cursor-pointer text-xs font-bold opacity-75 transition-opacity hover:opacity-100"
                  title="Close chat"
                >
                  <Image
                    src="/images/icons/closeIcon.svg"
                    alt="close"
                    width={16}
                    height={16}
                    className="h-3.5 w-3.5"
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Chat Content */}
          {!isMinimized && (
            <>
              {isSettingUsername ? (
                <UserSetupForm
                  initialUsername={username}
                  initialEmail={email}
                  onSubmit={onSetUsername}
                />
              ) : (
                <>
                  {/* Messages Area */}
                  <div className="bg-chat-primary relative flex-1 space-y-2 overflow-y-auto p-3">
                    {error && (
                      <div
                        className="relative rounded border border-yellow-200 bg-yellow-50 px-2 py-1 text-xs text-yellow-700"
                        role="alert"
                      >
                        <span className="block">{error}</span>
                      </div>
                    )}

                    {successMessage && (
                      <div className="relative rounded border border-green-200 bg-green-50 px-2 py-1 text-xs text-green-800">
                        <span className="block">{successMessage}</span>
                      </div>
                    )}

                    {/* Logout Modal - Inside Chat Window */}
                    <LogoutModal
                      isOpen={isLogoutModalOpen}
                      onClose={onCloseLogoutModal}
                      onConfirm={onLogout}
                    />

                    {messages.map(message => {
                      // Debug log for message rendering
                      console.log(
                        `🎨 RENDERING message - id: ${message.id}, from: ${message.sender}, text: "${message.text}", isFromSlack: ${message.isFromSlack}`,
                      );

                      return (
                        <MessageBubble
                          key={message.id}
                          message={message}
                          currentUsername={username}
                        />
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Input Section */}
                  <form onSubmit={onSendMessage} className="bg-chat-primary rounded-b-lg p-5 pb-6">
                    <div className="flex space-x-2">
                      <input
                        ref={messageInputRef}
                        type="text"
                        value={newMessage}
                        onChange={onMessageChange}
                        placeholder="Ask anything here"
                        className="mr-0 flex-1 rounded-full border border-white !bg-transparent px-3 py-2 text-sm !text-white placeholder-white shadow-sm focus:ring-1 focus:outline-none"
                        disabled={isLoading}
                      />
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={onSendMessage}
                          disabled={isLoading || !newMessage.trim()}
                          className="relative flex max-h-[40px] w-full cursor-pointer items-center justify-end focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Image
                            src="/images/icons/redArrowRight.svg"
                            alt="send arrow"
                            width={40}
                            height={40}
                            className="rotate-270"
                          />
                        </button>
                      </div>
                    </div>
                    {slackTypingUsers.length > 0 && (
                      <div className="mt-2 text-xs text-green-600">
                        <span className="inline-block">
                          <span className="typing-dot-chat">•</span>
                          <span className="typing-dot-chat">•</span>
                          <span className="typing-dot-chat">•</span>
                        </span>
                        <span className="ml-1">
                          {slackTypingUsers.length === 1
                            ? `${slackTypingUsers[0].name} is typing...`
                            : `${slackTypingUsers.length} people are typing...`}
                        </span>
                      </div>
                    )}
                  </form>
                </>
              )}
            </>
          )}
        </div>
      </div>
    );
  },
);

ChatWindow.displayName = 'ChatWindow';
