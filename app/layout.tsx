import './globals.css';
import type { Metadata } from 'next';
import AuthGate from './AuthGate';
import NavMenu from './NavMenu';
import ThemeToggle from './ThemeToggle';

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
        {/* ตั้งธีมก่อนหน้าเว็บวาด กันจอกระพริบตอนโหลด */}
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem('voc-theme')==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}` }} />
      </head>
      <body>
        <AuthGate>
          <div className="app">
            <aside className="side">
              <div className="brand">กคช · VOC<span>Voice of Customer · 2569</span></div>
              <NavMenu />
              <ThemeToggle />
            </aside>
            <div className="main">{children}</div>
          </div>
        </AuthGate>
      </body>
    </html>
  );
}
