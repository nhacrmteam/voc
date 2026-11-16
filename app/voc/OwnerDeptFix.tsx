'use client';
// OwnerDeptFix — ให้เจ้าหน้าที่แก้ "ฝ่ายผู้รับผิดชอบ" ที่ระบบจับคู่มาผิดได้
//
// ====== ทำไมต้องมีไฟล์นี้ (อ่านก่อนแก้) ======
// เดิมระบบจับคู่ฝ่ายอัตโนมัติอย่างเดียว ไม่มีทางให้คนบอกว่า "อันนี้ผิด ที่ถูกคือฝ่าย X"
// ผลคือ 2 อย่าง
//   1) เสียงลูกค้าที่ส่งผิดฝ่าย ก็ค้างผิดอยู่อย่างนั้น ไม่มีใครแก้ได้จากหน้าเว็บ
//   2) ตัวชี้วัด "ส่งถึงฝ่ายถูกต้องตั้งแต่ครั้งแรก" คำนวณไม่ได้เลย
//      เพราะถ้าไม่มีใครแก้ได้ ค่าที่ระบบเสนอก็เท่ากับค่าปัจจุบันเสมอ = 100% ตลอดกาล ซึ่งไร้ความหมาย
//
// การแก้ตรงนี้จะเขียน 3 คอลัมน์: owner_dept (ค่าใหม่) · owner_dept_by (ใคร) · owner_dept_at (เมื่อไร)
// ส่วน owner_dept_ai (ค่าที่ระบบเสนอครั้งแรก) **ไม่ถูกแตะ** — มี trigger ฝั่ง Postgres กันไว้อีกชั้น
//
// ⚠️ ต้องรัน supabase_owner_dept_tracking.sql ก่อน ไม่งั้นบันทึกไม่ผ่าน (ไม่มีคอลัมน์/ไม่มี policy)
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { DEPT_GROUPS } from '../../lib/data';
import { IS_DEMO } from '../../lib/demo';

export default function OwnerDeptFix({ id, owner, ownerAi, ownerFixed }: {
  id: string;
  owner: string;
  ownerAi: string;
  ownerFixed: boolean;
}) {
  const router = useRouter();
  const [role, setRole] = useState('');
  const [editing, setEditing] = useState(false);
  const [pick, setPick] = useState(owner);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (IS_DEMO || !supabase) return;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: p } = await supabase!.from('profiles').select('role').eq('id', data.user.id).single();
      setRole(p?.role ?? '');
    });
  }, []);

  // ผู้บริหารดูอย่างเดียว · เว็บสาธิตแก้ไม่ได้ · โหมดข้อมูลจำลอง (ไม่มี Supabase) ก็แก้ไม่ได้
  const canEdit = !IS_DEMO && !!supabase && (role === 'admin' || role === 'operator');

  // ระบบเสนอผิด และเจ้าหน้าที่แก้แล้ว — แสดงให้เห็นว่าเดิมระบบเสนอว่าอะไร
  const wasWrong = !!ownerAi && ownerAi !== owner;

  async function save() {
    if (!supabase || pick === owner) { setEditing(false); return; }
    setBusy(true); setErr('');
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('voc_record').update({
      owner_dept: pick,
      owner_dept_by: u.user?.id ?? null,
      owner_dept_at: new Date().toISOString(),
    }).eq('id', id);
    setBusy(false);
    if (error) {
      setErr(/owner_dept_by|owner_dept_at|column/i.test(error.message)
        ? 'ยังไม่ได้รัน supabase_owner_dept_tracking.sql บนฐานข้อมูล'
        : 'บันทึกไม่สำเร็จ: ' + error.message);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={pick}
          onChange={e => setPick(e.target.value)}
          style={{ padding: '5px 7px', border: '1px solid var(--line)', borderRadius: 6,
                   fontSize: 12.5, fontFamily: 'inherit', background: 'var(--card,#fff)', color: 'inherit' }}
        >
          {DEPT_GROUPS.map(g => (
            <optgroup key={g.group} label={g.group}>
              {g.depts.map(d => <option key={d} value={d}>{d}</option>)}
            </optgroup>
          ))}
        </select>
        <button type="button" onClick={save} disabled={busy}
          style={{ fontSize: 12, padding: '5px 11px', border: 'none', borderRadius: 6,
                   background: '#1f3a93', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          {busy ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
        <button type="button" onClick={() => { setEditing(false); setPick(owner); setErr(''); }}
          style={{ fontSize: 12, padding: '5px 11px', border: '1px solid var(--line)', borderRadius: 6,
                   background: 'transparent', color: 'inherit', cursor: 'pointer', fontFamily: 'inherit' }}>
          ยกเลิก
        </button>
        {err && <div style={{ fontSize: 12, color: '#dc2626', width: '100%' }}>{err}</div>}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
      <span>{owner || '—'}</span>
      {canEdit && (
        <button type="button" onClick={() => { setPick(owner); setEditing(true); }}
          style={{ fontSize: 11.5, padding: '2px 9px', border: '1px solid var(--line)', borderRadius: 20,
                   background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit' }}>
          ✎ แก้ฝ่าย
        </button>
      )}
      {wasWrong && (
        <span style={{ fontSize: 11.5, color: 'var(--muted)', width: '100%' }}>
          ระบบเสนอครั้งแรกว่า &ldquo;{ownerAi}&rdquo; · เจ้าหน้าที่แก้แล้ว
        </span>
      )}
      {!wasWrong && ownerFixed && (
        <span style={{ fontSize: 11.5, color: 'var(--muted)', width: '100%' }}>
          ✔ เจ้าหน้าที่ยืนยันแล้ว
        </span>
      )}
    </div>
  );
}
