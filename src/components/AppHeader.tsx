import { MessageSquare } from 'lucide-react';
import Image from 'next/image';

interface AppHeaderProps {
  username: string;
  isSettingUsername: boolean;
  localModeOnly: boolean;
  userChannel?: string | null;
  userChannelName?: string | null;
  connectionStatus: 'live' | 'polling' | 'offline';
  onDeleteChannel: () => void;
}

export function AppHeader({
  username,
  isSettingUsername,
  localModeOnly,
  userChannel,
  userChannelName,
  connectionStatus,
  onDeleteChannel,
}: AppHeaderProps) {
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
    } else {
      return (
        <div className="flex items-center text-xs font-bold text-white">
          {/* Offline status - keeping original comment */}
        </div>
      );
    }
  };

  return (
    <div className="bg-white shadow">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <MessageSquare className="h-8 w-8 text-blue-600" />
            <h1 className="ml-3 text-2xl font-bold text-gray-900">- Chat App -</h1>
            {!isSettingUsername && localModeOnly && (
              <span className="ml-3 rounded-full bg-yellow-100 px-2 py-1 text-xs text-yellow-600">
                Local Mode Only
              </span>
            )}
            {!isSettingUsername && (
              <span className="mr-auto ml-3 rounded-full px-2 py-1 text-xs">
                {renderConnectionStatus()}
              </span>
            )}
            {!isSettingUsername && userChannelName && (
              <span className="ml-3 rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-600">
                Slack Channel: {userChannelName}
              </span>
            )}
          </div>
          {!isSettingUsername && (
            <div className="flex items-center space-x-3">
              {userChannel ? (
                <button
                  onClick={onDeleteChannel}
                  className="flex cursor-pointer items-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-md transition-colors hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="mr-1 h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                  Delete Channel
                </button>
              ) : (
                <span className="text-sm text-gray-400">No channel created yet</span>
              )}
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">Logged in as {username}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
