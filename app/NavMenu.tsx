'use client';
// NavMenu — เมนูข้างซ้าย ซ่อน/แสดงตามบทบาท (menu-level RBAC)
// ผู้บริหาร (executive): ดู + ส่งออกเท่านั้น → ซ่อนเมนู "นำเข้าข้อมูล"
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const ITEMS: { href: string; label: string; staffOnly?: boolean; adminOnly?: boolean }[] = [
  { href: '/dashboard', label: '📊 ภาพรวม' },
  { href: '/channels', label: '📥 8 ช่องทางรับฟังเสียงลูกค้า' },
  { href: '/voc', label: '💬 รายการ VOC' },
  { href: '/import', label: '📤 นำเข้าข้อมูล', adminOnly: true },
  { href: '/dimensions', label: '🧭 วิเคราะห์ 4 มิติ' },
  { href: '/analyze', label: '🤖 AI วิเคราะห์เสียงลูกค้า' },
  { href: '/review', label: '✋ คิวรอยืนยันเสียงลูกค้า', staffOnly: true },
  { href: '/prioritize', label: '🎯 จัดลำดับ' },
  { href: '/reports', label: '📄 รายงานข้อมูล' },
  { href: '/admin', label: '⚙️ จัดการระบบ', adminOnly: true },
  // คู่มือต้องอยู่ล่างสุดและ **ทุกบทบาทเห็น** — คนที่เข้าเมนูอื่นไม่ได้ ยิ่งต้องอ่านคู่มือได้
  { href: '/help', label: '📘 คู่มือการใช้งาน' },
];

export default function NavMenu() {
  const [role, setRole] = useState<string>('');   // '' = ยังไม่รู้ (แสดงทุกเมนูแบบ mock)
  const pathname = usePathname();

  // เมนูที่ "กำลังเปิดอยู่" — ต้องนับหน้าลูกด้วย
  //   /voc/VOC-123 ยังถือว่าอยู่ในเมนู "รายการ VOC" · /channels/social ยังอยู่ใน "8 ช่องทาง"
  //   ไม่งั้นพอกดเข้าไปดูรายละเอียด ไฮไลต์จะหายทั้งแถบ ผู้ใช้จะไม่รู้ว่าตัวเองหลุดมาจากเมนูไหน
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

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
      }).map(it => {
        const on = isActive(it.href);
        return (
          // aria-current="page" = ตัวที่โปรแกรมอ่านหน้าจอใช้บอกว่า "อยู่หน้านี้" สีอย่างเดียวไม่พอ
          <Link key={it.href} href={it.href} className={on ? 'on' : undefined} aria-current={on ? 'page' : undefined}>
            {it.label}
          </Link>
        );
      })}
      {role === 'executive' && (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.82)', padding: '10px 14px' }}>👁️ โหมดผู้บริหาร — ดู + ส่งออกเท่านั้น</div>
      )}
    </nav>
  );
}
