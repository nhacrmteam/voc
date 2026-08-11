'use client';
// AuthGate — ล็อกอิน / สมัครใช้งาน / ลืมรหัสผ่าน / ตั้งรหัสใหม่ (Supabase Auth)
// ดีไซน์หน้าเข้าใช้งาน 2 คอลัมน์ + โลโก้การเคหะแห่งชาติ (SVG)
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '../lib/supabaseClient';
import { DEPT_GROUPS } from '../lib/data';

// หน้าที่เข้าได้โดยไม่ต้องล็อกอิน (ยืนยันอีเมล ฯลฯ)
const PUBLIC_PATHS = ['/welcome'];
// บทบาทที่ผู้สมัครขอใช้งาน (จริง ๆ จะได้สิทธิ์เมื่อแอดมินอนุมัติ)
const SIGNUP_ROLES = [{ v: 'operator', l: 'ผู้ปฏิบัติงาน' }, { v: 'admin', l: 'แอดมิน' }, { v: 'executive', l: 'ผู้บริหาร' }];

const ROLE_TH: Record<string, string> = { admin: 'แอดมิน', operator: 'ผู้ปฏิบัติงาน', executive: 'ผู้บริหาร', pending: 'รออนุมัติ' };

const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #dfe6f0', borderRadius: 9, margin: '4px 0 12px', fontSize: 14, fontFamily: 'inherit', outlineColor: '#2e6cf0' };
const lab: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#334155' };
const btn: React.CSSProperties = { width: '100%', padding: 12, background: '#1f3a93', color: '#fff', border: 'none', borderRadius: 9, fontWeight: 700, fontSize: 14.5, cursor: 'pointer', fontFamily: 'inherit' };
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#2e6cf0', cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit', padding: 0, fontWeight: 600 };

// ช่องรหัสผ่านพร้อมปุ่มแสดง/ซ่อน (ไอคอนตา outline มินิมอล)
function PwInput({ value, onChange, placeholder, minLen }: { value: string; onChange: (e: any) => void; placeholder?: string; minLen?: number }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative', margin: '4px 0 12px' }}>
      <input style={{ ...inp, margin: 0, paddingRight: 42 }} type={show ? 'text' : 'password'} value={value} onChange={onChange} required minLength={minLen ?? 6} placeholder={placeholder} />
      <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
        style={{ position: 'absolute', right: 6, top: 0, bottom: 0, display: 'flex', alignItems: 'center', border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', padding: '0 6px' }}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
          <circle cx="12" cy="12" r="3" />
          {show && <line x1="3" y1="3" x2="21" y2="21" />}
        </svg>
      </button>
    </div>
  );
}

const NHA_LOGO = 'https://upload.wikimedia.org/wikipedia/commons/0/0a/Emblem_of_the_National_Housing_Authority_of_Thailand.svg';
function Logo({ size = 60 }: { size?: number }) {
  // โลโก้จริงของการเคหะแห่งชาติ (จาก Wikimedia Commons)
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={NHA_LOGO} alt="โลโก้การเคหะแห่งชาติ" width={size} height={size} style={{ display: 'block', objectFit: 'contain' }} />;
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<{ role: string; full_name: string | null }>({ role: '', full_name: null });
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot' | 'recovery'>('login');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [profileReady, setProfileReady] = useState(false);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');   // ยืนยันรหัสผ่าน (ตอนตั้งรหัสใหม่)
  const [f, setF] = useState({ full_name: '', emp_code: '', phone: '', dept: '', position: '', role: 'operator' });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadProfile(data.session.user.id);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') { setMode('recovery'); setSession(null); return; }
      setSession(s);
      if (s) loadProfile(s.user.id); else { setProfile({ role: '', full_name: null }); setProfileReady(false); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadProfile(uid: string) {
    if (!supabase) return;
    const { data } = await supabase.from('profiles').select('role, full_name').eq('id', uid).single();
    setProfile({ role: data?.role || 'pending', full_name: data?.full_name || null });
    setProfileReady(true);
  }
  async function doLogin(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setMsg(''); setBusy(true);
    let loginEmail = email.trim();
    let known = false;   // รู้ว่าบัญชีมีจริง → ถ้า sign in พลาด = รหัสผ่านผิด
    try {
      // แปลง "อีเมล หรือ รหัสพนักงาน" → อีเมลจริง (ผ่านฟังก์ชัน email_for_login)
      const { data, error: rpcErr } = await supabase!.rpc('email_for_login', { identifier: loginEmail });
      if (!rpcErr) {
        if (data) { loginEmail = data as string; known = true; }
        else { setErr('ไม่พบบัญชีนี้ในระบบ — ตรวจสอบอีเมลหรือรหัสพนักงานอีกครั้ง'); setBusy(false); return; }
      }
    } catch { /* ฟังก์ชันยังไม่ถูกสร้าง → ใช้ค่าที่กรอก (ต้องเป็นอีเมล) */ }
    const { error } = await supabase!.auth.signInWithPassword({ email: loginEmail, password: pw });
    if (error) {
      setErr(known ? '🔑 รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่' : 'เข้าสู่ระบบไม่สำเร็จ — อีเมล/รหัสพนักงาน หรือรหัสผ่านไม่ถูกต้อง');
    } else router.push('/dashboard');   // ล็อกอินสำเร็จ → ไปหน้าภาพรวมเสมอ
    setBusy(false);
  }
  async function doSignup(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setMsg('');
    // แอดมิน/ผู้ปฏิบัติงาน ต้องเลือกฝ่าย · ผู้บริหารไม่ต้อง
    if (f.role !== 'executive' && !f.dept) { setErr('กรุณาเลือกฝ่าย/หน่วยงาน สำหรับบทบาทแอดมิน/ผู้ปฏิบัติงาน'); return; }
    setBusy(true);
    const { data, error } = await supabase!.auth.signUp({
      email, password: pw,
      // เก็บ "บทบาทที่ขอ" + ฝ่าย ไว้ให้แอดมินพิจารณา — บทบาทจริงถูกตั้งเป็น "รออนุมัติ" เสมอ (ความปลอดภัย)
      options: {
        data: { full_name: f.full_name, emp_code: f.emp_code, phone: f.phone, dept: f.role === 'executive' ? 'ผู้บริหาร' : f.dept, position: f.position, requested_role: f.role },
        emailRedirectTo: window.location.origin + '/welcome',   // คลิกลิงก์ยืนยันแล้วไปหน้า "ยืนยันอีเมลเรียบร้อย"
      },
    });
    setBusy(false);
    if (error) { setErr('สมัครไม่สำเร็จ: ' + error.message); return; }
    setMode('login');
    setMsg('สมัครสำเร็จ! กรุณายืนยันอีเมล จากนั้นรอแอดมินกำหนดบทบาทให้ก่อนเข้าใช้งาน');
  }
  async function doForgot(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setMsg(''); setBusy(true);
    // ส่งลิงก์รีเซ็ตไปอีเมล — ลิงก์นี้คือการยืนยันตัวตน (เฉพาะเจ้าของอีเมลเปิดได้ · ใช้ครั้งเดียว · มีวันหมดอายุ)
    const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/dashboard' });
    setBusy(false);
    if (error) setErr('ส่งอีเมลไม่สำเร็จ: ' + error.message);
    else setMsg('ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่ ' + email + ' แล้ว — กรุณาเปิดอีเมลแล้วคลิกลิงก์ (ตรวจกล่อง Spam ด้วย)');
  }
  async function doRecovery(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setMsg('');
    if (pw.length < 6) { setErr('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return; }
    if (pw !== pw2) { setErr('รหัสผ่านทั้งสองช่องไม่ตรงกัน'); return; }
    setBusy(true);
    const { error } = await supabase!.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setErr('ตั้งรหัสใหม่ไม่สำเร็จ: ' + error.message);
    else { setMsg('ตั้งรหัสผ่านใหม่เรียบร้อย เข้าสู่ระบบได้เลย'); setMode('login'); setPw(''); setPw2(''); }
  }
  async function signOut() { await supabase!.auth.signOut(); router.replace('/login'); }

  // ทำให้ URL ตรงกับสถานะจริง: ยังไม่ล็อกอิน → /login, ล็อกอินแล้วแต่อยู่ /login → /dashboard
  useEffect(() => {
    if (!ready || !supabase) return;
    if (!session && mode !== 'recovery' && !PUBLIC_PATHS.includes(pathname) && pathname !== '/login') {
      router.replace('/login');
    } else if (session && pathname === '/login') {
      router.replace('/dashboard');
    }
  }, [ready, session, mode, pathname]);

  if (!ready) return <div style={{ padding: 40, fontFamily: 'Sarabun,sans-serif' }}>กำลังโหลด…</div>;

  // หน้าสาธารณะ (เช่น /welcome ยืนยันอีเมล) แสดงได้เลยไม่ต้องล็อกอิน
  if (PUBLIC_PATHS.includes(pathname)) return <>{children}</>;

  if (supabase && (!session || mode === 'recovery')) {
    const titleMap: Record<string, string> = { login: 'เข้าสู่ระบบ', signup: 'สมัครใช้งานระบบ', forgot: 'ลืมรหัสผ่าน', recovery: 'ตั้งรหัสผ่านใหม่' };
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', overflow: 'auto',
        background: 'linear-gradient(135deg,#0f1e46,#16285f 45%,#1f3a93)', fontFamily: 'Sarabun,sans-serif', padding: 20 }}>
        {/* กราฟิกพื้นหลัง: คลื่นเสียง + วงกระจาย + กล่องข้อความ (จาง ๆ อยู่หลังกล่องล็อกอิน) */}
        <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.08, pointerEvents: 'none' }}>
          <g fill="none" stroke="#fff" strokeWidth="3">
            <circle cx="1300" cy="140" r="60" /><circle cx="1300" cy="140" r="110" /><circle cx="1300" cy="140" r="160" /><circle cx="1300" cy="140" r="210" />
            <circle cx="120" cy="780" r="50" /><circle cx="120" cy="780" r="95" /><circle cx="120" cy="780" r="140" />
            <rect x="1050" y="640" width="230" height="130" rx="26" /><path d="M1100 770 l0 40 l40 -40" />
            <rect x="180" y="120" width="180" height="100" rx="22" /><path d="M320 220 l0 30 l-30 -30" />
          </g>
          <g fill="#fff">
            {Array.from({ length: 26 }).map((_, i) => {
              const h = [40, 90, 150, 70, 200, 120, 240, 100, 60, 170, 210, 80, 130, 190, 55, 160, 230, 95, 140, 65, 185, 110, 45, 205, 150, 75][i];
              return <rect key={i} x={430 + i * 26} y={450 - h / 2} width="10" height={h} rx="5" />;
            })}
          </g>
        </svg>
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexWrap: 'wrap', width: '100%', maxWidth: 940, background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,.4)', margin: '24px 0' }}>

          {/* ซ้าย: แผงแบรนด์ */}
          <div style={{ flex: '1 1 340px', minWidth: 300, background: 'linear-gradient(160deg,#1f3a93,#16285f)', color: '#fff', padding: '40px 36px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ background: '#fff', borderRadius: 14, padding: 8, display: 'grid', placeItems: 'center' }}><Logo size={52} /></div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.2 }}>การเคหะแห่งชาติ</div>
                <div style={{ fontSize: 12, opacity: .8, letterSpacing: .3 }}>National Housing Authority</div>
              </div>
            </div>
            <div style={{ height: 1, background: 'rgba(255,255,255,.18)', margin: '26px 0 22px' }} />
            <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.35 }}>VOC Web Application<br />รวบรวมเสียงของลูกค้า</div>
            <div style={{ position: 'relative', fontSize: 13, opacity: .85, marginTop: 12, lineHeight: 1.7 }}>
              การเคหะแห่งชาติ · ระบบ Voice of Customer ปี 2569<br />
              รวบรวม วิเคราะห์ และรายงานเสียงลูกค้าจาก 8 ช่องทาง
            </div>
          </div>

          {/* ขวา: ฟอร์ม */}
          <div style={{ flex: '1 1 380px', minWidth: 300, padding: '38px 36px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <Logo size={30} />
              <div style={{ fontWeight: 700, fontSize: 19, color: '#0f172a' }}>{titleMap[mode]}</div>
            </div>
            <div style={{ fontSize: 12.5, color: '#64748b', marginBottom: 18 }}>
              {mode === 'login' && 'เข้าสู่ระบบเสียงของลูกค้า การเคหะแห่งชาติ'}
              {mode === 'signup' && 'กรอกข้อมูลพนักงานเพื่อขอเข้าใช้งาน'}
              {mode === 'forgot' && 'รับลิงก์ตั้งรหัสผ่านใหม่ทางอีเมล'}
              {mode === 'recovery' && 'กำหนดรหัสผ่านใหม่ของคุณ'}
            </div>
            {err && <div style={{ background: '#fee2e2', color: '#b91c1c', fontSize: 12.5, padding: '9px 12px', borderRadius: 8, marginBottom: 13 }}>{err}</div>}
            {msg && <div style={{ background: '#dcfce7', color: '#15803d', fontSize: 12.5, padding: '9px 12px', borderRadius: 8, marginBottom: 13 }}>{msg}</div>}

            {mode === 'login' && (
              <form onSubmit={doLogin}>
                <label style={lab}>อีเมล หรือ รหัสพนักงาน</label>
                <input style={inp} value={email} onChange={e => setEmail(e.target.value)} type="text" required placeholder="you@nha.co.th หรือ รหัสพนักงาน" />
                <label style={lab}>รหัสผ่าน</label>
                <PwInput value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••" minLen={1} />
                <button style={btn} type="submit" disabled={busy}>{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 15 }}>
                  <button type="button" style={linkBtn} onClick={() => { setMode('forgot'); setErr(''); setMsg(''); }}>ลืมรหัสผ่าน?</button>
                  <button type="button" style={linkBtn} onClick={() => { setMode('signup'); setErr(''); setMsg(''); }}>สมัครใช้งาน →</button>
                </div>
              </form>
            )}

            {mode === 'signup' && (
              <form onSubmit={doSignup}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
                  <div><label style={lab}>ชื่อ-สกุล *</label><input style={inp} value={f.full_name} onChange={set('full_name')} required /></div>
                  <div><label style={lab}>รหัสพนักงาน *</label><input style={inp} value={f.emp_code} onChange={set('emp_code')} required /></div>
                  <div><label style={lab}>เบอร์โทร</label><input style={inp} value={f.phone} onChange={set('phone')} /></div>
                  <div><label style={lab}>ตำแหน่ง</label><input style={inp} value={f.position} onChange={set('position')} /></div>
                </div>
                <label style={lab}>บทบาทที่ขอใช้งาน *</label>
                <select style={inp} value={f.role} onChange={set('role')}>
                  {SIGNUP_ROLES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
                </select>
                {f.role !== 'executive' && (
                  <>
                    <label style={lab}>ฝ่าย/หน่วยงาน *</label>
                    <select style={inp} value={f.dept} onChange={set('dept')} required>
                      <option value="">— เลือกฝ่าย —</option>
                      {DEPT_GROUPS.map(g => (
                        <optgroup key={g.group} label={g.group}>
                          {g.depts.map(d => <option key={d} value={d}>{d}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </>
                )}
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', fontSize: 12, padding: '8px 11px', borderRadius: 8, margin: '2px 0 12px' }}>
                  ℹ️ บทบาทที่เลือกเป็นเพียง &ldquo;คำขอ&rdquo; — แอดมินจะอนุมัติบทบาทจริงให้ก่อนเข้าใช้งาน
                </div>
                <label style={lab}>อีเมล * (อีเมลพนักงาน หรือ อีเมลภายนอก เช่น Gmail)</label>
                <input style={inp} value={email} onChange={e => setEmail(e.target.value)} type="email" required placeholder="you@nha.co.th หรือ you@gmail.com" />
                <div style={{ fontSize: 11.5, color: '#64748b', margin: '-8px 0 12px' }}>ใช้อีเมลจริงที่เปิดได้ เพราะต้องยืนยันอีเมลก่อนใช้งาน</div>
                <label style={lab}>รหัสผ่าน * (อย่างน้อย 6 ตัว)</label>
                <PwInput value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••" minLen={6} />
                <button style={btn} type="submit" disabled={busy}>{busy ? 'กำลังสมัคร…' : 'สมัครใช้งาน'}</button>
                <div style={{ marginTop: 13, textAlign: 'center' }}>
                  <button type="button" style={linkBtn} onClick={() => { setMode('login'); setErr(''); setMsg(''); }}>← กลับไปหน้าเข้าสู่ระบบ</button>
                </div>
              </form>
            )}

            {mode === 'forgot' && (
              <form onSubmit={doForgot}>
                <div style={{ fontSize: 12.5, color: '#475569', marginBottom: 12, lineHeight: 1.7 }}>
                  กรอกอีเมลที่ลงทะเบียนไว้ ระบบจะส่ง<b>ลิงก์ยืนยันตัวตน</b>ไปที่อีเมล เพื่อกลับมาตั้งรหัสผ่านใหม่อย่างปลอดภัย (ลิงก์ใช้ได้ครั้งเดียวและมีวันหมดอายุ)
                </div>
                <label style={lab}>อีเมลที่ลงทะเบียนไว้</label>
                <input style={inp} value={email} onChange={e => setEmail(e.target.value)} type="email" required placeholder="you@nha.co.th" />
                <button style={btn} type="submit" disabled={busy}>{busy ? 'กำลังส่ง…' : '📧 ส่งลิงก์ตั้งรหัสผ่านใหม่'}</button>
                <div style={{ marginTop: 13, textAlign: 'center' }}>
                  <button type="button" style={linkBtn} onClick={() => { setMode('login'); setErr(''); setMsg(''); }}>← กลับไปหน้าเข้าสู่ระบบ</button>
                </div>
              </form>
            )}

            {mode === 'recovery' && (
              <form onSubmit={doRecovery}>
                <div style={{ fontSize: 12.5, color: '#15803d', background: '#dcfce7', borderRadius: 8, padding: '8px 11px', marginBottom: 12 }}>
                  ✓ ยืนยันตัวตนผ่านลิงก์อีเมลเรียบร้อย — ตั้งรหัสผ่านใหม่ของคุณได้เลย
                </div>
                <label style={lab}>รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)</label>
                <PwInput value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••" minLen={6} />
                <label style={lab}>ยืนยันรหัสผ่านใหม่อีกครั้ง</label>
                <PwInput value={pw2} onChange={e => setPw2(e.target.value)} placeholder="••••••••" minLen={6} />
                <button style={btn} type="submit" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกรหัสผ่านใหม่'}</button>
              </form>
            )}
          </div>
        </div>

        {/* Footer หน้าล็อกอิน */}
        <div style={{ position: 'absolute', bottom: 12, left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,.75)', fontSize: 11.5, lineHeight: 1.9, padding: '0 16px' }}>
          <div>Produced by the Marketing Department, National Housing Authority · Developed by Eksunee Kruttawee (AI-assisted)</div>
          <div>© {new Date().getFullYear()} National Housing Authority of Thailand. All rights reserved.</div>
        </div>
      </div>
    );
  }

  // ล็อกอินแล้วแต่โปรไฟล์ยังโหลดไม่เสร็จ → รอสักครู่ (กันหน้าเว็บกระพริบให้คนที่ยังรออนุมัติ)
  if (supabase && session && !profileReady) {
    return <div style={{ padding: 40, fontFamily: 'Sarabun,sans-serif' }}>กำลังตรวจสอบสิทธิ์…</div>;
  }

  // บทบาท "รออนุมัติ" → ยังเข้าใช้งานไม่ได้ จนกว่าแอดมินจะกำหนดบทบาท
  if (supabase && session && profile.role === 'pending') {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', padding: 20,
        background: 'linear-gradient(135deg,#0f1e46,#16285f 45%,#1f3a93)', fontFamily: 'Sarabun,sans-serif' }}>
        <div style={{ background: '#fff', borderRadius: 20, maxWidth: 440, width: '100%', padding: '38px 34px', textAlign: 'center', boxShadow: '0 30px 80px rgba(0,0,0,.4)' }}>
          <div style={{ margin: '0 auto 16px' }}><Logo size={54} /></div>
          <div style={{ fontSize: 40, marginBottom: 6 }}>⏳</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>บัญชีรอการอนุมัติ</div>
          <div style={{ fontSize: 14, color: '#475569', marginTop: 10, lineHeight: 1.7 }}>
            สมัครใช้งานเรียบร้อยแล้ว<br />กรุณารอแอดมินกำหนดบทบาทให้ก่อนเข้าใช้งานระบบ<br />
            <span style={{ fontSize: 12.5, color: '#94a3b8' }}>({session.user.email})</span>
          </div>
          <button onClick={signOut} style={{ marginTop: 22, padding: '11px 22px', background: '#1f3a93', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>ออกจากระบบ</button>
        </div>
      </div>
    );
  }

  return (
    <>
      {session && (
        <div style={{ position: 'fixed', top: 10, right: 16, zIndex: 50, display: 'flex', alignItems: 'center', gap: 10,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 30, padding: '5px 8px 5px 14px', fontFamily: 'Sarabun,sans-serif', boxShadow: '0 4px 14px rgba(0,0,0,.08)' }}>
          <span style={{ fontSize: 12.5 }}>{profile.full_name || session.user.email} · <b style={{ color: '#1f3a93' }}>{ROLE_TH[profile.role] || profile.role}</b></span>
          <button onClick={signOut} style={{ fontSize: 12, border: '1px solid #e2e8f0', background: '#fff', borderRadius: 20, padding: '5px 11px', cursor: 'pointer', fontFamily: 'inherit' }}>ออกจากระบบ</button>
        </div>
      )}
      {children}
    </>
  );
}
