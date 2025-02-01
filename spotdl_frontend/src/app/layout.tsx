import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Spotify Downloader',
  description: 'Download Spotify songs and playlists',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* Wrap all pages with a common layout */}
        <header className="bg-blue-500 text-white p-4">
          <h1 className="text-2xl font-bold">Spotify Downloader</h1>
        </header>
        <main className="p-4">
          {children} {/* This is where your pages will be injected */}
        </main>
        <footer className="bg-gray-800 text-white p-4 text-center">
          <p>&copy; 2025 Spotify Downloader. All rights reserved.</p>
        </footer>
      </body>
    </html>
  );
}