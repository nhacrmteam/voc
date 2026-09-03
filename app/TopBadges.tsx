'use client';
// TopBadges — ป้ายแจ้ง "งานที่รอเราอยู่" มุมขวาบน
//
// ทำไมต้องมี: ทั้งคิวยืนยัน sentiment และผู้ใช้ที่รออนุมัติ เป็นงานที่ต้องมีคนทำ
// แต่เดิมต้องเดินเข้าไปเปิดหน้านั้นเองถึงจะรู้ว่ามีของค้าง — ไม่มีสัญญาณอะไรบอกเลย
//
// กติกา: **ไม่ขึ้นเมื่อเป็นศูนย์** ป้ายที่ขึ้นตลอดเวลาจะกลายเป็นของประดับ คนเลิกมอง
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function TopBadges({ role }: { role: string }) {
  const [review, setReview] = useState(0);   // รอเจ้าหน้าที่ยืนยัน sentiment
  const [pending, setPending] = useState(0); // ผู้ใช้รอแอดมินอนุมัติ

  const canReview = role === 'admin' || role === 'operator';
  const isAdmin = role === 'admin';

  const load = useCallback(async () => {
    if (!supabase) return;
    if (canReview) {
      // เกณฑ์เดียวกับ sentUncertain ใน lib/data.ts — ความเชื่อมั่น ≤50 และยังไม่มีคนยืนยัน
      const { count } = await supabase.from('analysis')
        .select('voc_id', { count: 'exact', head: true })
        .lte('sentiment_confidence', 50)
        .eq('sentiment_manual', false);
      setReview(count ?? 0);
    }
    if (isAdmin) {
      const { count } = await supabase.from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'pending');
      setPending(count ?? 0);
    }
  }, [canReview, isAdmin]);

  useEffect(() => {
    load();
    // อัปเดตเมื่อกลับมาที่แท็บ — ไม่ตั้ง polling ถี่ ๆ เพราะเป็นงานที่ไม่ได้เปลี่ยนทุกวินาที
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  if (!review && !pending) return null;

  return (
    <>
      {review > 0 && (
        <Link href="/review" className="tb tb-review"
          title={`มี ${review.toLocaleString()} รายการที่ AI ไม่แน่ใจ รอเจ้าหน้าที่ยืนยัน — คลิกเพื่อไปที่คิวยืนยัน`}>
          <span aria-hidden>🔔</span> <span className="tb-lbl">รอยืนยัน</span> <b>{review.toLocaleString()}</b>
        </Link>
      )}
      {pending > 0 && (
        <Link href="/admin" className="tb tb-pending"
          title={`มีผู้ใช้ ${pending.toLocaleString()} คนรออนุมัติบทบาท — คลิกเพื่อไปที่หน้าจัดการระบบ`}>
          <span aria-hidden>⏳</span> <span className="tb-lbl">รออนุมัติ</span> <b>{pending.toLocaleString()}</b>
        </Link>
      )}
    </>
  );
}
