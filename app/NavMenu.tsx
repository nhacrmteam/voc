'use client';
// NavMenu — เมนูข้างซ้าย ซ่อน/แสดงตามบทบาท (menu-level RBAC)
// ผู้บริหาร (executive): ดู + ส่งออกเท่านั้น → ซ่อนเมนู "นำเข้าข้อมูล"
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const ITEMS: { href: string; label: string; staffOnly?: boolean; adminOnly?: boolean }[] = [
  { href: '/dashboard', label: '📊 ภาพรวม' },
  { href: '/channels', label: '📥 8 ช่องทาง' },
  { href: '/voc', label: '💬 รายการ VOC' },
  { href: '/import', label: '📤 นำเข้าข้อมูล', staffOnly: true },
  { href: '/analyze', label: '🤖 AI วิเคราะห์' },
  { href: '/prioritize', label: '🎯 จัดลำดับ' },
  { href: '/reports', label: '📄 รายงานข้อมูล' },
  { href: '/admin', label: '⚙️ จัดการระบบ', adminOnly: true },
];

export default function NavMenu() {
  const [role, setRole] = useState<string>('');   // '' = ยังไม่รู้ (แสดงทุกเมนูแบบ mock)

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: p } = await supabase!.from('profiles').select('role').eq('id', data.user.id).single();
      setRole(p?.role ?? 'operator');
    });
  }, []);

  return (
    <nav className="nav">
      {ITEMS.filter(it => {
        if (it.staffOnly && role === 'executive') return false;
        if (it.adminOnly && role !== 'admin' && role !== '') return false;  // '' = โหมดสาธิต แสดงทุกเมนู
        return true;
      }).map(it => (
        <Link key={it.href} href={it.href}>{it.label}</Link>
      ))}
      {role === 'executive' && (
        <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.55)', padding: '10px 14px' }}>👁️ โหมดผู้บริหาร — ดู + ส่งออกเท่านั้น</div>
      )}
    </nav>
  );
}
