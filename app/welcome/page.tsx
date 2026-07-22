'use client';
// หน้ายืนยันอีเมลเรียบร้อย — ปลายทางของลิงก์ยืนยันในอีเมล (แสดงเต็มจอ ไม่มีเมนู)
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const NHA_LOGO = 'https://upload.wikimedia.org/wikipedia/commons/0/0a/Emblem_of_the_National_Housing_Authority_of_Thailand.svg';

export default function Welcome() {
  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [detail, setDetail] = useState('');

  useEffect(() => {
    // ลิงก์ยืนยันจาก Supabase จะพา session มาใน URL (hash/query) — เช็กว่ายืนยันสำเร็จไหม
    (async () => {
      const hash = typeof window !== 'undefined' ? window.location.hash : '';
      if (hash.includes('error')) {
        const p = new URLSearchParams(hash.slice(1));
        setDetail(p.get('error_description') || 'ลิงก์หมดอายุหรือถูกใช้ไปแล้ว');
        setStatus('error');
        return;
      }
      if (!supabase) { setStatus('ok'); return; }
      try {
        const { data } = await supabase.auth.getSession();
        // ไม่ว่าจะมี session หรือไม่ ถ้าไม่มี error = ถือว่ายืนยันเรียบร้อย ให้ล็อกอินได้
        // ออกจาก session ชั่วคราว เพื่อให้ผู้ใช้เข้าสู่ระบบใหม่อย่างสะอาด
        if (data.session) await supabase.auth.signOut();
        setStatus('ok');
      } catch {
        setStatus('ok');
      }
    })();
  }, []);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', padding: 20,
      background: 'linear-gradient(135deg,#0f1e46,#16285f 45%,#1f3a93)', fontFamily: 'Sarabun,sans-serif',
    }}>
      <div style={{ background: '#fff', borderRadius: 20, maxWidth: 460, width: '100%', padding: '40px 36px', textAlign: 'center', boxShadow: '0 30px 80px rgba(0,0,0,.4)' }}>
        <div style={{ background: '#eef2ff', width: 76, height: 76, borderRadius: '50%', display: 'grid', placeItems: 'center', margin: '0 auto 18px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={NHA_LOGO} alt="โลโก้การเคหะแห่งชาติ" width={44} height={44} style={{ objectFit: 'contain' }} />
        </div>

        {status === 'checking' && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1f3a93' }}>กำลังตรวจสอบ…</div>
            <div style={{ fontSize: 13.5, color: '#64748b', marginTop: 6 }}>กรุณารอสักครู่</div>
          </>
        )}

        {status === 'ok' && (
          <>
            <div style={{ fontSize: 46, color: '#16a34a', lineHeight: 1, marginBottom: 8 }}>✓</div>
            <div style={{ fontSize: 21, fontWeight: 700, color: '#0f172a' }}>ยืนยันอีเมลเรียบร้อยแล้ว</div>
            <div style={{ fontSize: 14, color: '#475569', marginTop: 10, lineHeight: 1.7 }}>
              บัญชีของคุณพร้อมใช้งานแล้ว<br />เข้าสู่ระบบ VOC การเคหะแห่งชาติ ได้เลย
            </div>
            <a href="/dashboard" style={{
              display: 'block', marginTop: 22, padding: 13, background: '#1f3a93', color: '#fff',
              borderRadius: 10, fontWeight: 700, fontSize: 15, textDecoration: 'none',
            }}>เข้าสู่ระบบ →</a>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ fontSize: 46, color: '#dc2626', lineHeight: 1, marginBottom: 8 }}>!</div>
            <div style={{ fontSize: 21, fontWeight: 700, color: '#0f172a' }}>ยืนยันอีเมลไม่สำเร็จ</div>
            <div style={{ fontSize: 13.5, color: '#b91c1c', marginTop: 10, lineHeight: 1.6 }}>{detail}</div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 8 }}>ลองสมัคร/ขอลิงก์ยืนยันใหม่อีกครั้ง</div>
            <a href="/dashboard" style={{
              display: 'block', marginTop: 22, padding: 13, background: '#1f3a93', color: '#fff',
              borderRadius: 10, fontWeight: 700, fontSize: 15, textDecoration: 'none',
            }}>ไปหน้าเข้าสู่ระบบ</a>
          </>
        )}
      </div>
    </div>
  );
}
