'use client';
// VocListView — รายการเสียงลูกค้า (VOC) พร้อมชุดฟิลเตอร์เดียวกับหน้าภาพรวม/8 ช่องทาง
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { Voc } from '../../lib/data';
import { CHANNELS, PROJECT_TYPES } from '../../lib/data';
import { computeCloud } from '../../lib/cloud';
import WordCloud from '../components/WordCloud';

const QUARTERS: { k: string; label: string }[] = [
  { k: 'year', label: 'ทั้งปี (สะสม)' },
  { k: 'q1', label: 'ไตรมาส 1 (ต.ค.–ธ.ค.)' },
  { k: 'q2', label: 'ไตรมาส 2 (ม.ค.–มี.ค.)' },
  { k: 'q3', label: 'ไตรมาส 3 (เม.ย.–มิ.ย.)' },
  { k: 'q4', label: 'ไตรมาส 4 (ก.ค.–ก.ย.)' },
];
function currentFYQuarter(): { be: number; q: string } {
  const d = new Date(); const y = d.getFullYear(), mo = d.getMonth();
  return { be: (mo >= 9 ? y + 1 : y) + 543, q: mo >= 9 ? 'q1' : mo <= 2 ? 'q2' : mo <= 5 ? 'q3' : 'q4' };
}
function periodRange(be: number, q: string): { from: string; to: string } {
  const s = be - 543 - 1, e = be - 543;
  const m: Record<string, [string, string]> = {
    q1: [`${s}-10-01`, `${s}-12-31`], q2: [`${e}-01-01`, `${e}-03-31`],
    q3: [`${e}-04-01`, `${e}-06-30`], q4: [`${e}-07-01`, `${e}-09-30`], year: [`${s}-10-01`, `${e}-09-30`],
  };
  const [from, to] = m[q] || m.year; return { from, to };
}
const sel: React.CSSProperties = { padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 9, fontSize: 13, fontFamily: 'inherit', background: 'var(--card,#fff)', color: 'inherit' };

export default function VocListView({ rows, initialQ }: { rows: Voc[]; initialQ: string }) {
  const [maxFY, setMaxFY] = useState(2569);
  const [beYear, setBeYear] = useState(2569);
  const [quarter, setQuarter] = useState('q3');
  const [ptype, setPtype] = useState('all');
  const [projText, setProjText] = useState('');
  const [channel, setChannel] = useState('all');
  const [q, setQ] = useState(initialQ);
  useEffect(() => { const c = currentFYQuarter(); setMaxFY(c.be); setBeYear(c.be); setQuarter(c.q); }, []);
  const YEARS = [maxFY, maxFY - 1, maxFY - 2];

  const allTime = beYear === 0;
  const range = periodRange(beYear, quarter);
  const projQ = projText.trim().toLowerCase();
  const qq = q.trim().toLowerCase();

  const projectNames = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach(r => { if (r.project) m.set(r.project, r.projectType); });
    return Array.from(m, ([name, type]) => ({ name, type }));
  }, [rows]);
  const projOptions = ptype === 'all' ? projectNames : projectNames.filter(p => p.type === ptype);

  const cloud = useMemo(() => computeCloud(rows), [rows]);

  const fr = useMemo(() => rows.filter(r =>
    (allTime || (r.occurredAt >= range.from && r.occurredAt <= range.to)) &&
    (ptype === 'all' || r.projectType === ptype) &&
    (!projQ || (r.project || '').toLowerCase().includes(projQ)) &&
    (channel === 'all' || r.channel === channel) &&
    (!qq || (r.voice + r.topic + r.ref + r.owner + r.project).toLowerCase().includes(qq))
  ), [rows, allTime, range.from, range.to, ptype, projQ, channel, qq]);

  function clearAll() {
    const c = currentFYQuarter(); setBeYear(c.be); setQuarter(c.q);
    setPtype('all'); setProjText(''); setChannel('all'); setQ('');
  }
  const hasFilter = ptype !== 'all' || projText || channel !== 'all' || q || allTime;

  return (
    <>
      <header className="top">
        <h1>รายการเสียงลูกค้า (VOC)</h1>
        <div className="sub">ค้นหา + ตัวกรอง (ปีงบ/ไตรมาส/ประเภทโครงการ/ชื่อโครงการ/ช่องทาง) + Word Cloud</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <select style={sel} value={beYear} onChange={e => setBeYear(Number(e.target.value))}>
            <option value={0}>ทั้งหมด (ตั้งแต่มีระบบ)</option>
            {YEARS.map(y => <option key={y} value={y}>ปีงบประมาณ {y}</option>)}
          </select>
          <select style={sel} value={quarter} onChange={e => setQuarter(e.target.value)} disabled={allTime}>
            {QUARTERS.map(qt => <option key={qt.k} value={qt.k}>{qt.label}</option>)}
          </select>
          <select style={sel} value={ptype} onChange={e => { setPtype(e.target.value); setProjText(''); }}>
            <option value="all">ทุกประเภทโครงการ</option>
            {PROJECT_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <div style={{ position: 'relative' }}>
            <input list="voc-projects" style={{ ...sel, width: 200 }} value={projText}
              onChange={e => setProjText(e.target.value)}
              placeholder={`🔎 ทุกชื่อโครงการ${ptype !== 'all' ? ` (${projOptions.length})` : ''}`} />
            <datalist id="voc-projects">{projOptions.map(p => <option key={p.name} value={p.name} />)}</datalist>
            {projText && <button type="button" onClick={() => setProjText('')} style={{ position: 'absolute', right: 6, top: 6, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--muted)' }}>✕</button>}
          </div>
          <select style={sel} value={channel} onChange={e => setChannel(e.target.value)}>
            <option value="all">ทุกช่องทาง</option>
            {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </header>

      <div className="content">
        <div className="card">
          <h3>☁️ Word Cloud — คำที่ลูกค้าพูดถึงมาก (คลิกคำเพื่อค้นหา)</h3>
          <WordCloud freq={cloud} basePath="/voc" />
        </div>

        <div className="card">
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <input style={{ ...sel, flex: '1 1 220px' }} value={q} onChange={e => setQ(e.target.value)}
              placeholder="🔎 ค้นหาข้อความ เช่น จอง, ซ่อม, สินเชื่อ..." />
            {hasFilter && <button className="btn" style={{ background: '#64748b' }} onClick={clearAll}>ล้างตัวกรอง</button>}
          </div>
          <div className="sub" style={{ marginBottom: 10 }}>พบ {fr.length.toLocaleString()} รายการ</div>
          <table>
            <thead><tr><th>รหัส</th><th>ช่องทาง</th><th>ประเภทโครงการ</th><th>โครงการ</th><th>หัวข้อ</th><th>เสียงลูกค้า</th><th>Sentiment</th><th>ฝ่าย</th><th>สถานะ</th></tr></thead>
            <tbody>{fr.map(r => (
              <tr key={r.id}>
                <td><Link href={'/voc/' + r.id} className="tag">{r.ref}</Link></td>
                <td>{r.channel}</td><td>{r.projectType}</td><td>{r.project}</td><td>{r.topic}</td>
                <td style={{ maxWidth: 240, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.voice}>{r.voice}</td>
                <td><span className={'pill ' + (r.sentiment === 'Positive' ? 'p-pos' : r.sentiment === 'Negative' ? 'p-neg' : 'p-neu')}>{r.sentiment}</span></td>
                <td>{r.owner}</td><td>{r.status}</td>
              </tr>))}
            </tbody>
          </table>
          {fr.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>ไม่พบรายการตามตัวกรองนี้</div>}
        </div>
      </div>
    </>
  );
}
