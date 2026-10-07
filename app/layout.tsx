import './globals.css';
import type { Metadata } from 'next';
import { PlayerProvider } from '@/components/PlayerProvider';
import GlobalPlayer from '@/components/GlobalPlayer';

export const metadata: Metadata = {
  title: 'HER9AL — Beats & Music',
  description: 'Official HER9AL beat store and artist profile.',
  icons: {
    icon: '/icon.png',
    shortcut: '/icon.png',
    apple: '/icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PlayerProvider>
          {children}
          <GlobalPlayer />
        </PlayerProvider>
      </body>
    </html>
  );
}
