'use client';
// AuthGate — ล็อกอิน / สมัครใช้งาน / ลืมรหัสผ่าน / ตั้งรหัสใหม่ (Supabase Auth)
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const ROLES = [
  { v: 'admin', l: 'Admin (แอดมิน)' },
  { v: 'operator', l: 'พนักงาน (ผู้ปฏิบัติงาน)' },
  { v: 'executive', l: 'ผู้บริหาร' },
];
const ROLE_TH: Record<string, string> = { admin: 'แอดมิน', operator: 'ผู้ปฏิบัติงาน', executive: 'ผู้บริหาร' };

const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: 9, margin: '4px 0 11px', fontSize: 14, fontFamily: 'inherit' };
const lab: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569' };
const btn: React.CSSProperties = { width: '100%', padding: 11, background: '#2e6cf0', color: '#fff', border: 'none', borderRadius: 9, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' };
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#2e6cf0', cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit', padding: 0 };

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<{ role: string; full_name: string | null }>({ role: '', full_name: null });
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot' | 'recovery'>('login');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // ฟอร์ม
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
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
      if (s) loadProfile(s.user.id); else setProfile({ role: '', full_name: null });
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadProfile(uid: string) {
    if (!supabase) return;
    const { data } = await supabase.from('profiles').select('role, full_name').eq('id', uid).single();
    setProfile({ role: data?.role || 'operator', full_name: data?.full_name || null });
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
      options: { data: { full_name: f.full_name, emp_code: f.emp_code, phone: f.phone, dept: f.dept, position: f.position, role: f.role } },
    });
    setBusy(false);
    if (error) { setErr('สมัครไม่สำเร็จ: ' + error.message); return; }
    if (data.session) { setMsg(''); } // ถ้าปิดยืนยันอีเมล = ล็อกอินเลย
    else { setMode('login'); setMsg('สมัครสำเร็จ! กรุณายืนยันอีเมล (ตรวจกล่องอีเมล) แล้วเข้าสู่ระบบ'); }
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

  // ---------- หน้า Auth (ยังไม่ล็อกอิน) ----------
  if (supabase && (!session || mode === 'recovery')) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', overflow: 'auto',
        background: 'linear-gradient(135deg,#16285f,#1f3a93 55%,#2e6cf0)', fontFamily: 'Sarabun,sans-serif', padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 30, width: '100%', maxWidth: mode === 'signup' ? 460 : 380, boxShadow: '0 24px 60px rgba(0,0,0,.35)', margin: '20px 0' }}>
          <div style={{ fontWeight: 700, fontSize: 20, color: '#1f3a93' }}>กคช · VOC</div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
            {mode === 'login' && 'เข้าสู่ระบบเสียงของลูกค้า'}
            {mode === 'signup' && 'สมัครใช้งานระบบ (พนักงาน กคช.)'}
            {mode === 'forgot' && 'ลืมรหัสผ่าน — รับลิงก์ตั้งรหัสใหม่ทางอีเมล'}
            {mode === 'recovery' && 'ตั้งรหัสผ่านใหม่'}
          </div>
          {err && <div style={{ background: '#fee2e2', color: '#b91c1c', fontSize: 12.5, padding: '8px 11px', borderRadius: 8, marginBottom: 12 }}>{err}</div>}
          {msg && <div style={{ background: '#dcfce7', color: '#15803d', fontSize: 12.5, padding: '8px 11px', borderRadius: 8, marginBottom: 12 }}>{msg}</div>}

          {/* LOGIN */}
          {mode === 'login' && (
            <form onSubmit={doLogin}>
              <label style={lab}>อีเมล</label>
              <input style={inp} value={email} onChange={e => setEmail(e.target.value)} type="email" required placeholder="you@nha.co.th" />
              <label style={lab}>รหัสผ่าน</label>
              <input style={inp} value={pw} onChange={e => setPw(e.target.value)} type="password" required placeholder="••••••••" />
              <button style={btn} type="submit" disabled={busy}>{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
                <button type="button" style={linkBtn} onClick={() => { setMode('forgot'); setErr(''); setMsg(''); }}>ลืมรหัสผ่าน?</button>
                <button type="button" style={linkBtn} onClick={() => { setMode('signup'); setErr(''); setMsg(''); }}>สมัครใช้งาน</button>
              </div>
            </form>
          )}

          {/* SIGNUP */}
          {mode === 'signup' && (
            <form onSubmit={doSignup}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={lab}>ชื่อ-สกุล *</label><input style={inp} value={f.full_name} onChange={set('full_name')} required /></div>
                <div><label style={lab}>รหัสพนักงาน *</label><input style={inp} value={f.emp_code} onChange={set('emp_code')} required /></div>
                <div><label style={lab}>เบอร์โทร</label><input style={inp} value={f.phone} onChange={set('phone')} /></div>
                <div><label style={lab}>หน่วยงาน/ฝ่าย</label><input style={inp} value={f.dept} onChange={set('dept')} /></div>
                <div><label style={lab}>ตำแหน่ง</label><input style={inp} value={f.position} onChange={set('position')} /></div>
                <div><label style={lab}>เข้าใช้ในฐานะ *</label>
                  <select style={inp} value={f.role} onChange={set('role')}>{ROLES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}</select>
                </div>
              </div>
              <label style={lab}>อีเมลพนักงาน *</label>
              <input style={inp} value={email} onChange={e => setEmail(e.target.value)} type="email" required placeholder="you@nha.co.th" />
              <label style={lab}>รหัสผ่าน * (อย่างน้อย 6 ตัว)</label>
              <input style={inp} value={pw} onChange={e => setPw(e.target.value)} type="password" required minLength={6} />
              <button style={btn} type="submit" disabled={busy}>{busy ? 'กำลังสมัคร…' : 'สมัครใช้งาน'}</button>
              <div style={{ marginTop: 12, textAlign: 'center' }}>
                <button type="button" style={linkBtn} onClick={() => { setMode('login'); setErr(''); setMsg(''); }}>← กลับไปหน้าเข้าสู่ระบบ</button>
              </div>
            </form>
          )}

          {/* FORGOT */}
          {mode === 'forgot' && (
            <form onSubmit={doForgot}>
              <label style={lab}>อีเมลที่ลงทะเบียนไว้</label>
              <input style={inp} value={email} onChange={e => setEmail(e.target.value)} type="email" required placeholder="you@nha.co.th" />
              <button style={btn} type="submit" disabled={busy}>{busy ? 'กำลังส่ง…' : 'ส่งลิงก์ตั้งรหัสใหม่'}</button>
              <div style={{ marginTop: 12, textAlign: 'center' }}>
                <button type="button" style={linkBtn} onClick={() => { setMode('login'); setErr(''); setMsg(''); }}>← กลับไปหน้าเข้าสู่ระบบ</button>
              </div>
            </form>
          )}

          {/* RECOVERY (ตั้งรหัสใหม่จากลิงก์ในอีเมล) */}
          {mode === 'recovery' && (
            <form onSubmit={doRecovery}>
              <label style={lab}>รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)</label>
              <input style={inp} value={pw} onChange={e => setPw(e.target.value)} type="password" required minLength={6} />
              <button style={btn} type="submit" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกรหัสผ่านใหม่'}</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ---------- ล็อกอินแล้ว → แสดงแอป + แถบผู้ใช้ ----------
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
