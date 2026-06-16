import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';
import './globals.css';
import { AppLayout } from '../components/layout/AppLayout';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'CoolShift — Intelligent Cooling Optimizer',
  description:
    'AI-powered HVAC optimization platform for energy savings, thermal comfort, and carbon reduction in Pakistan.',
  icons: {
    icon: '/icon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${dmSans.variable} font-sans antialiased`}>
        {/* Ambient Background Effects */}
        <div className="ambient-bg" />
        <div className="dot-grid" />

        {/* App Shell */}
        <AppLayout>{children}</AppLayout>
      </body>
    </html>
  );
}
