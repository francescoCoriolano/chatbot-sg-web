import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import localFont from 'next/font/local';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// Add Founders Grotesk font
const foundersGrotesk = localFont({
  src: [
    {
      path: '../fonts/founders-grotesk/FoundersGroteskWeb-Light.woff',
      weight: '300',
      style: 'normal',
    },
    {
      path: '../fonts/founders-grotesk/FoundersGroteskWeb-Medium.woff',
      weight: '500',
      style: 'normal',
    },
  ],
  variable: '--font-founders-grotesk',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Chat App',
  description: 'A real-time chat application with Slack integration',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${foundersGrotesk.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
