import './globals.css';
import type { Metadata } from 'next';
import AuthGate from './AuthGate';
import NavMenu from './NavMenu';
import ThemeToggle from './ThemeToggle';
import FontSize from './FontSize';
import ToTop from './ToTop';

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
        {/* ตั้งธีม + ขนาดตัวอักษรก่อนหน้าเว็บวาด กันจอกระพริบตอนโหลด */}
        <script dangerouslySetInnerHTML={{ __html: `try{var d=document.documentElement;if(localStorage.getItem('voc-theme')==='dark')d.setAttribute('data-theme','dark');var f=localStorage.getItem('voc-font');if(f&&f!=='md')d.setAttribute('data-font',f)}catch(e){}` }} />
      </head>
      <body>
        <AuthGate>
          <div className="app">
            <aside className="side">
              <div className="brand">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="brand-logo" src="/nha-logo.png" alt="โลโก้การเคหะแห่งชาติ" />
                <div className="brand-text">กคช · VOC<span>Voice of Customer · 2569</span></div>
              </div>
              <NavMenu />
              <FontSize />
              <ThemeToggle />
            </aside>
            <div className="main">
              {children}
              <footer className="footer">
                <div>Produced by the Marketing Department, National Housing Authority · Developed by Eksunee Kruttawee (AI-assisted)</div>
                <div>© {new Date().getFullYear()} National Housing Authority of Thailand. All rights reserved.</div>
              </footer>
            </div>
          </div>
          <ToTop />
        </AuthGate>
      </body>
    </html>
  );
}
