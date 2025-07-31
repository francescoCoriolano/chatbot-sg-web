import { useState } from 'react';
import Image from 'next/image';

interface UserSetupFormProps {
  initialUsername?: string;
  initialEmail?: string;
  onSubmit: (username: string, email: string) => void;
}

export function UserSetupForm({
  initialUsername = '',
  initialEmail = '',
  onSubmit,
}: UserSetupFormProps) {
  const [username, setUsername] = useState(initialUsername);
  const [email, setEmail] = useState(initialEmail);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (username.trim() && email.trim()) {
      onSubmit(username.trim(), email.trim());
    }
  };

  return (
    <div className="bg-chat-primary flex h-full items-center justify-between rounded-b-[12px] p-6">
      <div className="h-full w-full text-start">
        <h2 className="mb-2 text-lg font-bold">Let&apos;s dive in!</h2>
        <p className="t mb-4 w-[266px] text-[40px] leading-[32px]">
          Share your details to kick things off.
        </p>

        <form onSubmit={handleSubmit} className="mt-[78px] space-y-3">
          <div>
            <label htmlFor="username" className="mb-2 block text-left text-[12px] font-bold">
              Username
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="!bg-chat-primary block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm !text-white placeholder-[#ffffff7a] shadow-sm transition-colors focus:outline-none"
              placeholder="Enter your username"
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="email" className="mb-2 block text-left text-[12px] font-bold">
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="!bg-chat-primary block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm !text-white placeholder-[#ffffff7a] shadow-sm transition-colors focus:outline-none"
              placeholder="Enter your email"
            />
          </div>
          <button
            type="submit"
            disabled={!username.trim() || !email.trim()}
            className="relative ml-auto flex max-h-[40px] cursor-pointer items-center justify-end focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <div className="text-md flex h-[40px] items-center rounded-full bg-white px-6 py-3 font-bold text-black shadow-sm">
              send
            </div>
            <Image src="/images/icons/redArrowRight.svg" alt="send arrow" width={40} height={40} />
          </button>
        </form>
      </div>
    </div>
  );
}
