'use client';
// AuthGate — ล็อกอิน / สมัครใช้งาน / ลืมรหัสผ่าน / ตั้งรหัสใหม่ (Supabase Auth)
// ดีไซน์หน้าเข้าใช้งาน 2 คอลัมน์ + โลโก้การเคหะแห่งชาติ (SVG)
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '../lib/supabaseClient';

// หน้าที่เข้าได้โดยไม่ต้องล็อกอิน (ยืนยันอีเมล ฯลฯ)
const PUBLIC_PATHS = ['/welcome'];

const ROLE_TH: Record<string, string> = { admin: 'แอดมิน', operator: 'ผู้ปฏิบัติงาน', executive: 'ผู้บริหาร', pending: 'รออนุมัติ' };

const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #dfe6f0', borderRadius: 9, margin: '4px 0 12px', fontSize: 14, fontFamily: 'inherit', outlineColor: '#2e6cf0' };
const lab: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#334155' };
const btn: React.CSSProperties = { width: '100%', padding: 12, background: '#1f3a93', color: '#fff', border: 'none', borderRadius: 9, fontWeight: 700, fontSize: 14.5, cursor: 'pointer', fontFamily: 'inherit' };
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#2e6cf0', cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit', padding: 0, fontWeight: 600 };

const NHA_LOGO = 'https://upload.wikimedia.org/wikipedia/commons/0/0a/Emblem_of_the_National_Housing_Authority_of_Thailand.svg';
function Logo({ size = 60 }: { size?: number }) {
  // โลโก้จริงของการเคหะแห่งชาติ (จาก Wikimedia Commons)
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={NHA_LOGO} alt="โลโก้การเคหะแห่งชาติ" width={size} height={size} style={{ display: 'block', objectFit: 'contain' }} />;
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
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
  const [f, setF] = useState({ full_name: '', emp_code: '', phone: '', dept: '', position: '' });
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
    const { error } = await supabase!.auth.signInWithPassword({ email, password: pw });
    if (error) setErr('เข้าสู่ระบบไม่สำเร็จ: ' + error.message);
    setBusy(false);
  }
  async function doSignup(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setMsg(''); setBusy(true);
    const { data, error } = await supabase!.auth.signUp({
      email, password: pw,
      // ไม่ส่ง role — บทบาทถูกกำหนดเป็น "รออนุมัติ" ที่ฝั่งฐานข้อมูลเสมอ (ความปลอดภัย)
      options: {
        data: { full_name: f.full_name, emp_code: f.emp_code, phone: f.phone, dept: f.dept, position: f.position },
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
    const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    setBusy(false);
    if (error) setErr('ส่งอีเมลไม่สำเร็จ: ' + error.message);
    else setMsg('ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลแล้ว — กรุณาตรวจกล่องอีเมล');
  }
  async function doRecovery(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setMsg(''); setBusy(true);
    const { error } = await supabase!.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setErr('ตั้งรหัสใหม่ไม่สำเร็จ: ' + error.message);
    else { setMsg('ตั้งรหัสผ่านใหม่เรียบร้อย เข้าสู่ระบบได้เลย'); setMode('login'); }
  }
  async function signOut() { await supabase!.auth.signOut(); }

  if (!ready) return <div style={{ padding: 40, fontFamily: 'Sarabun,sans-serif' }}>กำลังโหลด…</div>;

  // หน้าสาธารณะ (เช่น /welcome ยืนยันอีเมล) แสดงได้เลยไม่ต้องล็อกอิน
  if (PUBLIC_PATHS.includes(pathname)) return <>{children}</>;

  if (supabase && (!session || mode === 'recovery')) {
    const titleMap: Record<string, string> = { login: 'เข้าสู่ระบบ', signup: 'สมัครใช้งานระบบ', forgot: 'ลืมรหัสผ่าน', recovery: 'ตั้งรหัสผ่านใหม่' };
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', overflow: 'auto',
        background: 'linear-gradient(135deg,#0f1e46,#16285f 45%,#1f3a93)', fontFamily: 'Sarabun,sans-serif', padding: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', width: '100%', maxWidth: 940, background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,.4)', margin: '24px 0' }}>

          {/* ซ้าย: แผงแบรนด์ */}
          <div style={{ flex: '1 1 340px', minWidth: 300, position: 'relative', overflow: 'hidden', background: 'linear-gradient(160deg,#1f3a93,#16285f)', color: '#fff', padding: '40px 36px', display: 'flex', flexDirection: 'column' }}>
            {/* กราฟิกพื้นหลัง: คลื่นเสียง + กล่องข้อความ (จาง ๆ) */}
            <svg viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.12, pointerEvents: 'none' }}>
              <g fill="none" stroke="#fff" strokeWidth="2">
                <circle cx="330" cy="90" r="30" /><circle cx="330" cy="90" r="52" /><circle cx="330" cy="90" r="74" />
                <rect x="40" y="360" width="150" height="80" rx="16" /><path d="M70 440 l0 24 l24 -24" />
                <rect x="230" y="410" width="120" height="64" rx="14" /><path d="M320 474 l0 18 l-18 -18" />
              </g>
              <g fill="#fff">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => {
                  const h = [24, 44, 70, 40, 90, 60, 100, 52, 30, 64][i];
                  return <rect key={i} x={30 + i * 20} y={230 - h / 2} width="8" height={h} rx="4" />;
                })}
              </g>
            </svg>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14 }}>
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
                <label style={lab}>อีเมล</label>
                <input style={inp} value={email} onChange={e => setEmail(e.target.value)} type="email" required placeholder="you@nha.co.th" />
                <label style={lab}>รหัสผ่าน</label>
                <input style={inp} value={pw} onChange={e => setPw(e.target.value)} type="password" required placeholder="••••••••" />
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
                  <div><label style={lab}>หน่วยงาน/ฝ่าย</label><input style={inp} value={f.dept} onChange={set('dept')} /></div>
                </div>
                <label style={lab}>ตำแหน่ง</label><input style={inp} value={f.position} onChange={set('position')} />
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', fontSize: 12, padding: '8px 11px', borderRadius: 8, margin: '2px 0 12px' }}>
                  ℹ️ หลังสมัคร แอดมินจะเป็นผู้กำหนดบทบาท (แอดมิน/ผู้ปฏิบัติงาน/ผู้บริหาร) ให้ก่อนจึงเข้าใช้งานได้
                </div>
                <label style={lab}>อีเมลพนักงาน *</label>
                <input style={inp} value={email} onChange={e => setEmail(e.target.value)} type="email" required placeholder="you@nha.co.th" />
                <label style={lab}>รหัสผ่าน * (อย่างน้อย 6 ตัว)</label>
                <input style={inp} value={pw} onChange={e => setPw(e.target.value)} type="password" required minLength={6} />
                <button style={btn} type="submit" disabled={busy}>{busy ? 'กำลังสมัคร…' : 'สมัครใช้งาน'}</button>
                <div style={{ marginTop: 13, textAlign: 'center' }}>
                  <button type="button" style={linkBtn} onClick={() => { setMode('login'); setErr(''); setMsg(''); }}>← กลับไปหน้าเข้าสู่ระบบ</button>
                </div>
              </form>
            )}

            {mode === 'forgot' && (
              <form onSubmit={doForgot}>
                <label style={lab}>อีเมลที่ลงทะเบียนไว้</label>
                <input style={inp} value={email} onChange={e => setEmail(e.target.value)} type="email" required placeholder="you@nha.co.th" />
                <button style={btn} type="submit" disabled={busy}>{busy ? 'กำลังส่ง…' : 'ส่งลิงก์ตั้งรหัสใหม่'}</button>
                <div style={{ marginTop: 13, textAlign: 'center' }}>
                  <button type="button" style={linkBtn} onClick={() => { setMode('login'); setErr(''); setMsg(''); }}>← กลับไปหน้าเข้าสู่ระบบ</button>
                </div>
              </form>
            )}

            {mode === 'recovery' && (
              <form onSubmit={doRecovery}>
                <label style={lab}>รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)</label>
                <input style={inp} value={pw} onChange={e => setPw(e.target.value)} type="password" required minLength={6} />
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
