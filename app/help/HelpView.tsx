'use client';
// HelpView — คู่มือการใช้งาน แยกตามบทบาท
//
// แนวคิดการออกแบบ (ทำไมไม่ทำเป็นหน้าเอกสารยาว ๆ หน้าเดียว)
//   คู่มือที่คนไม่อ่าน คือคู่มือที่บังคับให้อ่านทุกอย่างเพื่อหาสิ่งที่ตัวเองต้องการ
//   หน้านี้จึงถามก่อนว่า "คุณเป็นใคร" แล้วแสดงเฉพาะงานของบทบาทนั้น
//   และเรียงตาม **งานที่ต้องทำ** ไม่ใช่ตามเมนู เพราะคนเปิดคู่มือตอนติดปัญหา ไม่ได้เปิดมาศึกษาระบบ
//
//   - เดาบทบาทจากบัญชีที่ล็อกอินให้อัตโนมัติ (ไม่ต้องเลือกเองถ้าไม่อยากเลือก) แต่สลับดูบทบาทอื่นได้
//   - ทุกงานพับเก็บไว้ก่อน กดเปิดทีละอัน — เห็นภาพรวมว่ามีงานอะไรบ้างภายในหน้าจอเดียว
//   - มีช่องค้นหา เพราะคนที่รู้ว่าจะหาอะไรจะได้ไม่ต้องไล่อ่าน
//   - ทุกงานมีปุ่มไปหน้าจริง อ่านแล้วลงมือได้ทันที
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { ROLES, ROLE_TASKS, QUICK_START, GLOSSARY, FAQ, type RoleKey, type Task } from '../../lib/help';

/** แปลง **ข้อความ** เป็นตัวหนา — คู่มือต้องเน้นคำสำคัญได้ แต่ไม่คุ้มที่จะลากไลบรารี markdown มาทั้งก้อน */
function Rich({ t }: { t: string }) {
  const parts = t.split(/(\*\*[^*]+\*\*)/g);
  return <>{parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>))}</>;
}

function TaskCard({ t, open, onToggle }: { t: Task; open: boolean; onToggle: () => void }) {
  return (
    <div className={'hp-task' + (open ? ' on' : '')}>
      <button type="button" className="hp-task-head" onClick={onToggle} aria-expanded={open}>
        <span className="hp-task-title">{t.title}</span>
        {t.minutes && <span className="hp-min">~{t.minutes} นาที</span>}
        <span className="hp-caret" aria-hidden>{open ? '−' : '+'}</span>
      </button>
      <div className="hp-why"><Rich t={t.why} /></div>
      {open && (
        <div className="hp-body">
          {t.menu && (
            <div className="hp-where">
              <span className="hp-where-l">เมนูที่ใช้</span>
              <span className="hp-menu">{t.menu}</span>
              {t.href && <Link href={t.href} className="hp-go">ไปที่หน้านี้ →</Link>}
            </div>
          )}
          <ol className="hp-steps">
            {t.steps.map((s, i) => (
              <li key={i}>
                <Rich t={s.text} />
                {s.tip && <div className="hp-tip">💡 <Rich t={s.tip} /></div>}
              </li>
            ))}
          </ol>
          {t.notes && t.notes.length > 0 && (
            <div className="hp-notes">
              <div className="hp-notes-h">⚠️ ข้อควรรู้</div>
              <ul>{t.notes.map((n, i) => <li key={i}><Rich t={n} /></li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function HelpView() {
  const [myRole, setMyRole] = useState<string>('');      // บทบาทจริงของผู้ใช้ที่ล็อกอินอยู่
  const [role, setRole] = useState<RoleKey | null>(null); // บทบาทที่กำลังเปิดดูอยู่
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');

  // เดาบทบาทจากบัญชีที่ล็อกอิน แล้วเปิดคู่มือของบทบาทนั้นให้เลย
  // ผู้ใช้ไม่ต้องเลือกเองถ้าไม่อยากเลือก แต่ยังกดสลับดูบทบาทอื่นได้
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: p } = await supabase!.from('profiles').select('role').eq('id', data.user.id).single();
      const r = String(p?.role ?? '');
      setMyRole(r);
      if (r === 'admin' || r === 'operator' || r === 'executive') setRole(r);
    });
  }, []);

  const groups = role ? ROLE_TASKS[role] : [];
  const qq = q.trim().toLowerCase();
  // ค้นหาข้ามทุกงานของบทบาทนี้ — ค้นทั้งชื่อ เหตุผล ขั้นตอน และข้อควรรู้
  const filtered = useMemo(() => {
    if (!qq) return groups;
    return groups.map(g => ({
      ...g,
      tasks: g.tasks.filter(t =>
        (t.title + ' ' + t.why + ' ' + (t.menu ?? '') + ' ' + t.steps.map(s => s.text + (s.tip ?? '')).join(' ') + ' ' + (t.notes ?? []).join(' '))
          .toLowerCase().includes(qq)),
    })).filter(g => g.tasks.length > 0);
  }, [groups, qq]);
  const hitCount = filtered.reduce((a, g) => a + g.tasks.length, 0);

  const toggle = (id: string) => setOpen(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allIds = groups.flatMap(g => g.tasks.map(t => t.id));

  // พิมพ์คู่มือ — ต้องกางทุกอย่างก่อนสั่งพิมพ์
  //   ขั้นตอนของงานที่ "ย่อ" อยู่ ไม่ได้อยู่ใน DOM เลย (render เฉพาะตอนเปิด) ถ้าสั่งพิมพ์ทันที
  //   จะได้กระดาษที่มีแต่ชื่อหัวข้อ ส่วนคำตอบ FAQ อยู่ใน <details> ซึ่ง CSS สั่งให้เปิดไม่ได้จริง
  //   ต้องตั้ง .open ด้วย JS แล้วรอ React วาดรอบถัดไปก่อน จึงค่อย window.print()
  const printAll = () => {
    setOpen(new Set(allIds));
    document.querySelectorAll<HTMLDetailsElement>('details.hp-faq').forEach(d => { d.open = true; });
    setTimeout(() => window.print(), 250);
  };
  const faq = FAQ.filter(f => !f.roles || (role && f.roles.includes(role)));
  const info = ROLES.find(r => r.key === role);

  return (
    <>
      <header className="top">
        <h1>คู่มือการใช้งาน</h1>
        <div className="sub">เลือกบทบาทของคุณ แล้วดูเฉพาะงานที่คุณต้องทำ — ทุกขั้นตอนมีปุ่มพาไปหน้าจริง</div>
      </header>

      <div className="content">
        {/* ---------- เลือกบทบาท ---------- */}
        <div className="hp-roles">
          {ROLES.map(r => (
            <button key={r.key} type="button" className={'hp-role' + (role === r.key ? ' on' : '')}
              style={{ ['--rc' as string]: r.color }} onClick={() => { setRole(r.key); setOpen(new Set()); setQ(''); }}>
              {myRole === r.key && <span className="hp-mine">บทบาทของคุณ</span>}
              <span className="hp-role-ic">{r.icon}</span>
              <span className="hp-role-name">{r.name}</span>
              <span className="hp-role-short">{r.short}</span>
            </button>
          ))}
        </div>

        {!role ? (
          /* ---------- ยังไม่เลือกบทบาท: ให้เริ่มต้นใช้งานไปก่อน ---------- */
          <div className="card hp-start">
            <h3>👋 เริ่มต้นใช้งานใน 5 นาที</h3>
            <div className="hp-fnote">อ่านส่วนนี้ก่อนได้เลย ใช้ได้กับทุกบทบาท — แล้วค่อยเลือกบทบาทด้านบนเพื่อดูงานเฉพาะของคุณ</div>
            <ol className="hp-steps">
              {QUICK_START.map((s, i) => (
                <li key={i}><Rich t={s.text} />{s.tip && <div className="hp-tip">💡 <Rich t={s.tip} /></div>}</li>
              ))}
            </ol>
          </div>
        ) : (
          <>
            {/* ---------- สรุปสิทธิ์ของบทบาทที่เลือก ---------- */}
            {info && (
              <div className="card hp-perm" style={{ ['--rc' as string]: info.color }}>
                <h3>{info.icon} คู่มือสำหรับ{info.name}</h3>
                <div className="hp-perm-grid">
                  <div>
                    <div className="hp-perm-h ok">✓ ทำได้</div>
                    <ul>{info.can.map((c, i) => <li key={i}><Rich t={c} /></li>)}</ul>
                  </div>
                  <div>
                    <div className="hp-perm-h no">✕ ทำไม่ได้</div>
                    {info.cannot.length === 0
                      ? <div className="hp-fnote">ไม่มีข้อจำกัด — เข้าถึงได้ทุกเมนู</div>
                      : <ul>{info.cannot.map((c, i) => <li key={i}>{c}</li>)}</ul>}
                  </div>
                </div>
              </div>
            )}

            {/* ---------- แถบค้นหา + เปิด/ปิดทั้งหมด ---------- */}
            <div className="hp-bar">
              <input className="hp-search" value={q} onChange={e => setQ(e.target.value)}
                placeholder="🔎 ค้นหาในคู่มือ เช่น นำเข้า · ยืนยัน · PDF · ตัวกรอง" />
              <button type="button" className="hp-mini" onClick={() => setOpen(new Set(allIds))}>เปิดทุกหัวข้อ</button>
              <button type="button" className="hp-mini" onClick={() => setOpen(new Set())}>ย่อทั้งหมด</button>
              <button type="button" className="hp-mini pr" onClick={printAll}>🖨️ พิมพ์คู่มือ</button>
            </div>
            {qq && <div className="hp-fnote" style={{ marginBottom: 10 }}>พบ <b>{hitCount}</b> หัวข้อที่ตรงกับ “{q.trim()}”{hitCount === 0 && ' — ลองใช้คำอื่น หรือดูคำถามที่พบบ่อยด้านล่าง'}</div>}

            {/* ---------- งานตามบทบาท ---------- */}
            {filtered.map(g => (
              <div className="card hp-group" key={g.group}>
                <h3>{g.icon} {g.group}</h3>
                {g.tasks.map(t => <TaskCard key={t.id} t={t} open={open.has(t.id) || !!qq} onToggle={() => toggle(t.id)} />)}
              </div>
            ))}

            {/* ---------- เริ่มต้นใช้งาน ---------- */}
            <div className="card hp-group">
              <h3>👋 เริ่มต้นใช้งานใน 5 นาที</h3>
              <div className="hp-fnote">สำหรับคนที่เพิ่งได้รับบัญชี — ใช้ได้กับทุกบทบาท</div>
              <ol className="hp-steps">
                {QUICK_START.map((s, i) => (
                  <li key={i}><Rich t={s.text} />{s.tip && <div className="hp-tip">💡 <Rich t={s.tip} /></div>}</li>
                ))}
              </ol>
            </div>

            {/* ---------- คำศัพท์ ---------- */}
            <div className="card hp-group">
              <h3>📖 คำศัพท์ที่ต้องรู้</h3>
              <div className="hp-fnote">คนใช้งานใหม่มักติดตรงคำเหล่านี้ก่อนเรื่องอื่น</div>
              <dl className="hp-gloss">
                {GLOSSARY.map(g => (
                  <div key={g.term}>
                    <dt>{g.term}</dt>
                    <dd><Rich t={g.meaning} /></dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* ---------- ปัญหาที่พบบ่อย ---------- */}
            <div className="card hp-group">
              <h3>❓ ปัญหาที่พบบ่อย</h3>
              {faq.map((f, i) => (
                <details className="hp-faq" key={i}>
                  <summary>{f.q}</summary>
                  <div><Rich t={f.a} /></div>
                </details>
              ))}
            </div>

            <div className="card hp-foot">
              ยังไม่เจอสิ่งที่ต้องการ? ติดต่อ <b>ฝ่ายการตลาด การเคหะแห่งชาติ</b> ผู้ดูแลระบบ VOC
              {myRole && myRole !== role && <> · <button type="button" className="hp-link" onClick={() => setRole(myRole as RoleKey)}>กลับไปคู่มือของบทบาทฉัน</button></>}
            </div>
          </>
        )}
      </div>
    </>
  );
}
