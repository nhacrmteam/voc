import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'VOC Web App — การเคหะแห่งชาติ',
  description: 'Voice of Customer System',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <div className="app">
          <aside className="side">
            <div className="brand">กคช · VOC<span>Voice of Customer · 2569</span></div>
            <nav className="nav">
              <Link href="/dashboard">📊 ภาพรวม</Link>
              <Link href="/voc">💬 รายการ VOC</Link>
              <Link href="/prioritize">🎯 จัดลำดับ</Link>
            </nav>
          </aside>
          <div className="main">{children}</div>
        </div>
      </body>
    </html>
  );
}
