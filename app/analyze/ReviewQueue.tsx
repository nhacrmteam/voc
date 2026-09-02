'use client';
// ReviewQueue — รายการที่ AI ไม่แน่ใจ ให้เจ้าหน้าที่ยืนยัน/แก้ไข Sentiment (human-in-the-loop)
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';

export interface ReviewItem { id: string; ref: string; voice: string; reason: string; channel: string; project: string }

const btn: React.CSSProperties = { fontSize: 12.5, border: '1px solid #dfe6f0', background: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 };

export default function ReviewQueue({ items }: { items: ReviewItem[] }) {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [busyId, setBusyId] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!supabase) { setRole('mock'); return; }
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setRole('none'); return; }
      const { data: p } = await supabase!.from('profiles').select('role').eq('id', data.user.id).single();
      setRole(p?.role ?? 'operator');
    });
  }, []);

  const canEdit = role === 'admin' || role === 'operator';

  async function confirm(id: string, sentiment: 'Positive' | 'Neutral' | 'Negative') {
    if (!supabase || !canEdit) return;
    setBusyId(id); setErr('');
    const { error } = await supabase.from('analysis')
      .update({ sentiment, sentiment_manual: true, sentiment_confidence: 100, sentiment_reason: 'ยืนยันโดยเจ้าหน้าที่' })
      .eq('voc_id', id);
    if (error) setErr('บันทึกไม่สำเร็จ: ' + error.message);
    else router.refresh();
    setBusyId('');
  }

  if (!items.length) return <div style={{ color: 'var(--green)', fontSize: 13 }}>✓ ไม่มีรายการที่ AI ไม่แน่ใจ ขณะนี้</div>;

  return (
    <div>
      {err && <div style={{ color: '#b91c1c', fontSize: 12.5, marginBottom: 8 }}>{err}</div>}
      {items.map(it => (
        <div key={it.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', marginBottom: 9 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{it.ref} · {it.channel} · {it.project}</div>
          <div style={{ fontSize: 13.5, margin: '4px 0' }}>&ldquo;{it.voice}&rdquo;</div>
          <div style={{ fontSize: 12, color: '#9a3412', marginBottom: 8 }}>⚠ {it.reason}</div>
          {role === 'mock' ? (
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>* ปุ่มยืนยันใช้ได้เมื่อเชื่อม Supabase</span>
          ) : !canEdit ? (
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>🔒 ต้องเป็นแอดมิน/ผู้ปฏิบัติงานจึงยืนยันได้</span>
          ) : (
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>ยืนยันเป็น:</span>
              <button style={{ ...btn, color: '#16a34a' }} disabled={busyId === it.id} onClick={() => confirm(it.id, 'Positive')}>เชิงบวก</button>
              <button style={{ ...btn, color: '#64748b' }} disabled={busyId === it.id} onClick={() => confirm(it.id, 'Neutral')}>เป็นกลาง</button>
              <button style={{ ...btn, color: '#dc2626' }} disabled={busyId === it.id} onClick={() => confirm(it.id, 'Negative')}>เชิงลบ</button>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
