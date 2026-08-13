import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';

export const metadata: Metadata = {
  title: 'Clickrypt - Zero-Knowledge Password Vault',
  description: 'Enterprise OpenPGP client-side encrypted password management platform.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sora bg-[#091528] text-white antialiased selection:bg-[#1fbbd2]/30 selection:text-[#f39c12]">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
