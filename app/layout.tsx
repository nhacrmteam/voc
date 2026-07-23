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
              <div className="brand">
                <span className="brand-logo" aria-hidden="true">
                  <svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                    <rect x="7" y="7" width="86" height="86" rx="13" fill="none" stroke="#2e6cf0" strokeWidth="8" />
                    <path d="M22 24 L48 55 L48 74 L38 74" fill="none" stroke="#2e6cf0" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M78 24 L52 55 L52 74 L62 74" fill="none" stroke="#2e6cf0" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div className="brand-text">กคช · VOC<span>Voice of Customer · 2569</span></div>
              </div>
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
