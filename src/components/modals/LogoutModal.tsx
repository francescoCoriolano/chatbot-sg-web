import Image from 'next/image';

interface LogoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function LogoutModal({ isOpen, onClose, onConfirm }: LogoutModalProps) {
  if (!isOpen) return null;

  return (
    <div className="bg-chat-modal-overlay absolute inset-0 z-50 flex items-center justify-center rounded-[12px]">
      <div className="relative flex h-[260px] w-[310px] flex-col rounded-lg bg-white p-5 shadow-lg">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-gray-500"
        >
          <Image
            src="/images/icons/closeIconBlack.svg"
            alt="close"
            width={16}
            height={16}
            className="h-3.5 w-3.5"
          />
        </button>
        <div className="mt-auto flex flex-col justify-between">
          <h3 className="mt-6 mb-3 text-[36px] leading-[32px] !font-[200] tracking-[0] text-gray-700">
            Do you want to logout?
          </h3>
          <p className="mr-4 mb-4 text-xs text-gray-600">
            Logging out will clear your session data and close the chat. You&apos;ll need to enter
            your details again to start a new conversation.
          </p>
          <div className="mt-[15px] flex space-x-2">
            <button
              onClick={onConfirm}
              className="bg-chat-primary h-[40px] w-full cursor-pointer rounded-full px-3 py-1 text-[20px] font-bold text-white"
            >
              logout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
