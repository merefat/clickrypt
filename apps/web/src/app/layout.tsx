import type { Metadata } from "next";
import { Sora } from "next/font/google";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Clickrypt — Zero-Knowledge Password Manager",
  description:
    "Open, secure, zero-knowledge password management for teams. Your secrets never leave your device unencrypted.",
  icons: {
    icon: "/clickrypt.png",
    apple: "/clickrypt.png",
  },
};

const themeScript = `
(function() {
  document.documentElement.classList.add('dark');
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={sora.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-[var(--bg)] text-[var(--text)] antialiased font-sora">
        {children}
      </body>
    </html>
  );
}
