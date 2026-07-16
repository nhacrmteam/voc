'use client';
// FilterBar — ค้นหา + cascade filter: ประเภทโครงการ → โครงการ (+ ช่องทาง)
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const sel: React.CSSProperties = { padding: '9px 11px', border: '1px solid #dfe6f0', borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit', background: '#fff' };

export default function FilterBar({ q0, ptype0, proj0, channel0, channels, projects, types }: {
  q0: string; ptype0: string; proj0: string; channel0: string;
  channels: string[]; projects: { name: string; type: string }[]; types: string[];
}) {
  const router = useRouter();
  const [q, setQ] = useState(q0);
  const [ptype, setPtype] = useState(ptype0);
  const [proj, setProj] = useState(proj0);
  const [channel, setChannel] = useState(channel0);

  // โครงการที่เลือกได้ = กรองตามประเภทที่เลือก (cascade)
  const projOptions = ptype ? projects.filter(p => p.type === ptype) : projects;

  function go(next: { q?: string; ptype?: string; proj?: string; channel?: string }) {
    const v = { q, ptype, proj, channel, ...next };
    const p = new URLSearchParams();
    if (v.q) p.set('q', v.q);
    if (v.ptype) p.set('ptype', v.ptype);
    if (v.proj) p.set('proj', v.proj);
    if (v.channel) p.set('channel', v.channel);
    router.push('/voc' + (p.toString() ? '?' + p.toString() : ''));
  }

  return (
    <form onSubmit={e => { e.preventDefault(); go({}); }}
      style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, alignItems: 'center' }}>
      <input style={{ ...sel, flex: '1 1 200px' }} value={q} onChange={e => setQ(e.target.value)}
        placeholder="🔎 ค้นหา เช่น จอง, ซ่อม, สินเชื่อ..." />
      <select style={sel} value={ptype}
        onChange={e => { const t = e.target.value; setPtype(t); setProj(''); go({ ptype: t, proj: '' }); }}>
        <option value="">ประเภทโครงการ: ทั้งหมด</option>
        {types.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <select style={sel} value={proj}
        onChange={e => { setProj(e.target.value); go({ proj: e.target.value }); }}>
        <option value="">โครงการ: ทั้งหมด{ptype ? ' (' + projOptions.length + ')' : ''}</option>
        {projOptions.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
      </select>
      <select style={sel} value={channel}
        onChange={e => { setChannel(e.target.value); go({ channel: e.target.value }); }}>
        <option value="">ช่องทาง: ทั้งหมด</option>
        {channels.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <button className="btn" type="submit">ค้นหา</button>
      {(q0 || ptype0 || proj0 || channel0) &&
        <button className="btn" type="button" style={{ background: '#64748b' }}
          onClick={() => { setQ(''); setPtype(''); setProj(''); setChannel(''); router.push('/voc'); }}>ล้างตัวกรอง</button>}
    </form>
  );
}
