import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'HER9AL — Beats & Music',
  description: 'Official HER9AL beat store and artist profile.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
