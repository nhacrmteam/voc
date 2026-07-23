'use client';
// จัดการระบบ (Admin Console) — เฉพาะบทบาทแอดมิน
// 1) ผู้ใช้งานและบทบาท (เปลี่ยนบทบาทได้) 2) การเชื่อมต่อ 8 ช่องทาง 3) Data Mapping & Dictionary
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const ROLE_TH: Record<string, string> = { pending: 'รออนุมัติ', admin: 'แอดมิน', operator: 'ผู้ปฏิบัติงาน', executive: 'ผู้บริหาร' };
const ROLE_RIGHT: Record<string, string> = {
  pending: '⏳ ยังเข้าใช้งานไม่ได้ — รอกำหนดบทบาท',
  admin: 'นำเข้า/ส่งออก/แก้ไข/จัดการระบบ',
  operator: 'ดู/ส่งออก/อัปเดตสถานะ/นำเข้า',
  executive: 'ดู/ส่งออก (อ่านอย่างเดียว)',
};
const CHANNELS = [
  { id: 'social', name: 'Social Media (Facebook / Line OA)', imp: 'API เรียลไทม์ + นำเข้าย้อนหลัง' },
  { id: 'web', name: 'Website / Email / DB', imp: 'อัปโหลดไฟล์ / เชื่อมฐานข้อมูล' },
  { id: 'sales', name: 'ทีมรณรงค์ขาย', imp: 'อัปโหลดไฟล์' },
  { id: 'hq', name: 'ฝ่ายงานสำนักงานใหญ่', imp: 'อัปโหลดไฟล์' },
  { id: 'branch', name: 'สำนักงานสาขาทั่วประเทศ', imp: 'อัปโหลดไฟล์' },
  { id: 'call', name: 'Call Center', imp: 'อัปโหลดไฟล์' },
  { id: 'complain', name: 'ระบบร้องเรียน/ข้อเสนอแนะ', imp: 'อัปโหลดไฟล์ / เชื่อมระบบ' },
  { id: 'survey', name: 'แบบประเมินความพึงพอใจ', imp: 'Google Forms / อัปโหลดไฟล์' },
];
const MAPPING = [
  ['วันที่เกิดเรื่อง (ต้นทาง)', 'occurred_at', 'วันที่ในไฟล์/ระบบต้นทาง — แก้ไขได้'],
  ['วันที่นำเข้าระบบ', 'imported_at', 'ระบบบันทึกอัตโนมัติ = วันที่กดนำเข้า'],
  ['ข้อความลูกค้า (เต็ม)', 'raw_text', 'จำเป็น — ใช้วิเคราะห์ AI'],
  ['หัวข้อ/ประเด็น', 'topic', 'ไม่บังคับ'],
  ['ช่องทาง', 'channel_id', 'social / web / sales / hq / branch / call / complain / survey'],
  ['แหล่งที่มาในช่องทาง', 'source', 'เช่น Facebook, Line OA, Website'],
  ['กลุ่มผลิตภัณฑ์', 'product_group', 'อาคารเพื่อขาย/เช่าซื้อ · อาคารเช่า · เช่าจัดประโยชน์'],
  ['โครงการ', 'project_id', 'อ้างตาราง project (ชื่อ + ประเภทโครงการ)'],
  ['ผลวิเคราะห์ AI', 'analysis.*', 'sentiment/confidence/หมวด/priority — เจ้าหน้าที่ยืนยันทับได้'],
  ['การส่งต่อ & ติดตาม', 'action_log.*', 'timeline ที่แอดมิน/ผู้ปฏิบัติงานบันทึก'],
];
const MOCK_USERS = [
  { id: 'm1', full_name: 'สมชาย (สาธิต)', email: 'somchai.a@nha.co.th', role: 'admin', dept: 'ฝ่ายเทคโนโลยีสารสนเทศ' },
  { id: 'm2', full_name: 'นิภา (สาธิต)', email: 'nipa.o@nha.co.th', role: 'operator', dept: 'ฝ่ายสื่อสารองค์กร' },
  { id: 'm3', full_name: 'ดิเรก (สาธิต)', email: 'direk.e@nha.co.th', role: 'executive', dept: 'ผู้บริหาร' },
];

interface Profile { id: string; full_name: string | null; email: string | null; role: string; dept: string | null }
interface ChConfig { id: string; api_enabled: boolean; webhook_secret: string }

function genSecret() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = 'voc_';
  const buf = new Uint8Array(28);
  crypto.getRandomValues(buf);
  buf.forEach(b => { s += chars[b % chars.length]; });
  return s;
}

const sel: React.CSSProperties = { padding: '6px 9px', border: '1px solid #dfe6f0', borderRadius: 8, fontSize: 12.5, fontFamily: 'inherit', background: '#fff' };

export default function AdminPage() {
  const [role, setRole] = useState<string | null>(null);
  const [me, setMe] = useState('');
  const [users, setUsers] = useState<Profile[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [cfg, setCfg] = useState<Record<string, ChConfig>>({});
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const fnBase = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://<project>.supabase.co') + '/functions/v1/ingest-voc';

  useEffect(() => {
    if (!supabase) { setRole('mock'); setUsers(MOCK_USERS as any); return; }
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setRole('none'); return; }
      setMe(data.user.id);
      const { data: p } = await supabase!.from('profiles').select('role').eq('id', data.user.id).single();
      const r = p?.role ?? 'operator';
      setRole(r);
      if (r !== 'admin') return;
      const { data: us } = await supabase!.from('profiles').select('id, full_name, email, role, dept').order('full_name');
      setUsers((us as Profile[]) ?? []);
      // นับจำนวนเรื่องต่อช่องทาง
      const c: Record<string, number> = {};
      await Promise.all(CHANNELS.map(async ch => {
        const { count } = await supabase!.from('voc_record').select('id', { count: 'exact', head: true }).eq('channel_id', ch.id);
        c[ch.id] = count ?? 0;
      }));
      setCounts(c);
      // โหลดตั้งค่า API ต่อช่องทาง (ต้องรัน supabase_channel_api.sql ก่อนจึงมีคอลัมน์)
      const { data: chs } = await supabase!.from('channel').select('id, api_enabled, webhook_secret');
      if (chs) {
        const m: Record<string, ChConfig> = {};
        (chs as any[]).forEach(x => { m[x.id] = { id: x.id, api_enabled: !!x.api_enabled, webhook_secret: x.webhook_secret ?? '' }; });
        setCfg(m);
      }
    });
  }, []);

  async function changeRole(id: string, newRole: string) {
    setMsg(''); setErr('');
    if (role === 'mock') { setUsers(u => u.map(x => x.id === id ? { ...x, role: newRole } : x)); setMsg('เปลี่ยนบทบาท (สาธิต) เรียบร้อย'); return; }
    if (id === me && newRole !== 'admin' && !window.confirm('คุณกำลังลดสิทธิ์ของตัวเองจากแอดมิน — ยืนยัน?')) return;
    const { error } = await supabase!.from('profiles').update({ role: newRole }).eq('id', id);
    if (error) { setErr('เปลี่ยนบทบาทไม่สำเร็จ: ' + error.message); return; }
    setUsers(u => u.map(x => x.id === id ? { ...x, role: newRole } : x));
    setMsg('เปลี่ยนบทบาทเรียบร้อย');
  }

  async function saveCfg(id: string) {
    setMsg(''); setErr('');
    const c = cfg[id]; if (!c) return;
    if (role === 'mock') { setMsg('บันทึกตั้งค่า API (สาธิต) เรียบร้อย'); return; }
    const { error } = await supabase!.from('channel')
      .update({ api_enabled: c.api_enabled, webhook_secret: c.webhook_secret || null }).eq('id', id);
    if (error) setErr('บันทึกไม่สำเร็จ: ' + error.message + (error.message.includes('column') ? ' — กรุณารัน supabase_channel_api.sql ก่อน' : ''));
    else setMsg('บันทึกตั้งค่า API ของช่องทาง ' + id + ' เรียบร้อย');
  }
  function setC(id: string, patch: Partial<ChConfig>) {
    setCfg(m => {
      const cur: ChConfig = m[id] ?? { id, api_enabled: false, webhook_secret: '' };
      return { ...m, [id]: { ...cur, ...patch } };
    });
  }

  const pendingCount = users.filter(u => u.role === 'pending').length;

  if (role === null) return <div className="content" style={{ padding: 24 }}>กำลังโหลด…</div>;
  if (role !== 'admin' && role !== 'mock') {
    return (
      <>
        <header className="top"><h1>จัดการระบบ (Admin Console)</h1></header>
        <div className="content"><div className="card">🔒 เมนูนี้สำหรับบทบาทแอดมินเท่านั้น</div></div>
      </>
    );
  }

  return (
    <>
      <header className="top"><h1>⚙️ จัดการระบบ (Admin Console)</h1><div className="sub">ผู้ใช้/บทบาท · การเชื่อมต่อช่องทาง · Data Mapping{role === 'mock' ? ' · (โหมดสาธิต)' : ''}</div></header>
      <div className="content">
        {msg && <div className="card" style={{ color: '#15803d' }}>✓ {msg}</div>}
        {err && <div className="card" style={{ color: '#b91c1c' }}>{err}</div>}

        {/* ผู้ใช้งานและบทบาท */}
        <div className="card">
          <h3>👥 ผู้ใช้งานและบทบาท {pendingCount > 0 && <span style={{ fontSize: 12.5, color: '#b45309', background: '#fef3c7', padding: '2px 9px', borderRadius: 20, marginLeft: 6 }}>⏳ รออนุมัติ {pendingCount}</span>}</h3>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>ผู้ใช้ใหม่สมัครผ่านหน้า &ldquo;สมัครใช้งาน&rdquo; และเริ่มต้นเป็น &ldquo;รออนุมัติ&rdquo; เสมอ — เลือกบทบาทให้ที่นี่เพื่อเปิดสิทธิ์เข้าใช้งาน</div>
          <table>
            <thead><tr><th>ผู้ใช้</th><th>อีเมล</th><th>หน่วยงาน</th><th>บทบาท</th><th>สิทธิ์</th></tr></thead>
            <tbody>{users.slice().sort((a, b) => (a.role === 'pending' ? -1 : 0) - (b.role === 'pending' ? -1 : 0)).map(u => (
              <tr key={u.id} style={u.role === 'pending' ? { background: '#fffbeb' } : undefined}>
                <td>{u.full_name || '-'}{u.id === me ? ' (คุณ)' : ''}</td>
                <td>{u.email || '-'}</td>
                <td>{u.dept || '-'}</td>
                <td>
                  <select style={sel} value={u.role} onChange={e => changeRole(u.id, e.target.value)}>
                    {Object.keys(ROLE_TH).map(r => <option key={r} value={r}>{ROLE_TH[r]}</option>)}
                  </select>
                </td>
                <td style={{ fontSize: 12 }}>{ROLE_RIGHT[u.role] || '-'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>

        {/* การเชื่อมต่อช่องทาง */}
        <div className="card">
          <h3>🔗 การเชื่อมต่อช่องทาง (Data Sources)</h3>
          <table>
            <thead><tr><th>ช่องทาง</th><th>วิธีนำเข้า</th><th>จำนวนเรื่องในระบบ</th><th>สถานะ</th></tr></thead>
            <tbody>{CHANNELS.map(ch => (
              <tr key={ch.id}>
                <td>{ch.name}</td><td style={{ fontSize: 12.5 }}>{ch.imp}</td>
                <td>{role === 'mock' ? '—' : (counts[ch.id] ?? 0).toLocaleString()}</td>
                <td><span className="pill p-pos">พร้อมใช้งาน</span></td>
              </tr>
            ))}</tbody>
          </table>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>* นำเข้าข้อมูลจากทุกช่องทางได้ที่เมนู &ldquo;📤 นำเข้าข้อมูล&rdquo; — เรียลไทม์เฉพาะ Social (เชื่อม API ในเฟสถัดไป)</div>
        </div>

        {/* ตั้งค่า API รับข้อมูลเรียลไทม์ */}
        <div className="card">
          <h3>🔌 ตั้งค่า API รับข้อมูลเรียลไทม์ (Webhook)</h3>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 6 }}>
            Endpoint กลาง (ทุกช่องทางใช้ URL เดียวกัน แยกด้วย channel_id + secret):
          </div>
          <code style={{ display: 'block', background: '#f1f5f9', borderRadius: 8, padding: '8px 10px', fontSize: 12, marginBottom: 12, wordBreak: 'break-all' }}>{fnBase}</code>
          <table>
            <thead><tr><th>ช่องทาง</th><th>เปิดรับ API</th><th>Webhook Secret</th><th></th></tr></thead>
            <tbody>{CHANNELS.map(ch => {
              const c = cfg[ch.id] || { id: ch.id, api_enabled: false, webhook_secret: '' };
              return (
                <tr key={ch.id}>
                  <td>{ch.name}<div style={{ fontSize: 11, color: 'var(--muted)' }}>channel_id: <code>{ch.id}</code></div></td>
                  <td>
                    <label style={{ cursor: 'pointer', fontSize: 12.5 }}>
                      <input type="checkbox" checked={c.api_enabled} onChange={e => setC(ch.id, { api_enabled: e.target.checked })} /> เปิด
                    </label>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input style={{ ...sel, width: 210, fontFamily: 'monospace', fontSize: 11.5 }} value={c.webhook_secret}
                        onChange={e => setC(ch.id, { webhook_secret: e.target.value })} placeholder="ยังไม่ตั้ง secret" />
                      <button className="btn" style={{ padding: '6px 10px', fontSize: 12 }} type="button"
                        onClick={() => setC(ch.id, { webhook_secret: genSecret() })}>สุ่ม</button>
                    </div>
                  </td>
                  <td><button className="btn" style={{ padding: '6px 12px', fontSize: 12 }} type="button" onClick={() => saveCfg(ch.id)}>บันทึก</button></td>
                </tr>
              );
            })}</tbody>
          </table>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10, lineHeight: 1.7 }}>
            วิธีใช้: ระบบต้นทางส่ง <code>POST</code> มาที่ endpoint พร้อม header <code>x-voc-secret</code> = secret ของช่องทาง<br />
            รูปแบบข้อมูล: <code>{'{ "channel_id": "call", "text": "ข้อความลูกค้า", "source": "Call Center 1615" }'}</code> หรือ LINE webhook ส่งตรงได้เลย (channel_id = social อัตโนมัติ)<br />
            ดูวิธีเชื่อม LINE OA / Facebook / Google Forms / Email ทีละขั้นในไฟล์ <b>เชื่อมต่อ_API_ช่องทาง.md</b>
          </div>
        </div>

        {/* Data Mapping & Dictionary */}
        <div className="card">
          <h3>🗂️ Data Mapping &amp; Dictionary</h3>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>โครงสร้างข้อมูลกลาง — ทุกช่องทางถูก map เข้าตาราง voc_record + analysis + action_log</div>
          <table>
            <thead><tr><th>ข้อมูล</th><th>คอลัมน์ในระบบ</th><th>หมายเหตุ</th></tr></thead>
            <tbody>{MAPPING.map(m => (
              <tr key={m[1]}><td>{m[0]}</td><td><code style={{ fontSize: 12 }}>{m[1]}</code></td><td style={{ fontSize: 12.5 }}>{m[2]}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </>
  );
}
