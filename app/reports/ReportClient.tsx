'use client';
// ReportClient — ศูนย์รายงานหลายประเภท พร้อมตัวกรอง (ปีงบ/ไตรมาส/ประเภท/โครงการ)
// แต่ละรายงานดาวน์โหลด CSV / Excel / PDF (พิมพ์) ได้ · อิงข้อมูลตามตัวกรองปัจจุบัน
import { useEffect, useMemo, useState } from 'react';
import type { Voc } from '../../lib/data';
import { PROJECT_TYPES } from '../../lib/data';

const SENT_TH: Record<string, string> = { Positive: 'เชิงบวก', Neutral: 'เป็นกลาง', Negative: 'เชิงลบ' };
const QUARTERS = [
  { k: 'year', label: 'ทั้งปี (สะสม)' }, { k: 'q1', label: 'ไตรมาส 1 (ต.ค.–ธ.ค.)' }, { k: 'q2', label: 'ไตรมาส 2 (ม.ค.–มี.ค.)' },
  { k: 'q3', label: 'ไตรมาส 3 (เม.ย.–มิ.ย.)' }, { k: 'q4', label: 'ไตรมาส 4 (ก.ค.–ก.ย.)' },
];
function currentFYQuarter() { const d = new Date(), y = d.getFullYear(), mo = d.getMonth(); return { be: (mo >= 9 ? y + 1 : y) + 543, q: mo >= 9 ? 'q1' : mo <= 2 ? 'q2' : mo <= 5 ? 'q3' : 'q4' }; }
function periodRange(be: number, q: string) {
  const s = be - 543 - 1, e = be - 543;
  const m: Record<string, [string, string]> = { q1: [`${s}-10-01`, `${s}-12-31`], q2: [`${e}-01-01`, `${e}-03-31`], q3: [`${e}-04-01`, `${e}-06-30`], q4: [`${e}-07-01`, `${e}-09-30`], year: [`${s}-10-01`, `${e}-09-30`] };
  const [from, to] = m[q] || m.year; return { from, to };
}
const pct = (n: number, t: number) => (t ? Math.round(n / t * 100) : 0) + '%';

type Table = { cols: string[]; rows: (string | number)[][] };
function csvCell(v: string | number) { return '"' + String(v ?? '').replace(/"/g, '""') + '"'; }
function download(name: string, content: string, mime: string) {
  const blob = new Blob(['﻿' + content], { type: mime });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
function toCSV(name: string, t: Table) {
  download(name + '.csv', [t.cols.map(csvCell).join(','), ...t.rows.map(r => r.map(csvCell).join(','))].join('\n'), 'text/csv;charset=utf-8;');
}
function toExcel(name: string, t: Table) {
  const th = t.cols.map(c => `<th>${c}</th>`).join('');
  const tr = t.rows.map(r => '<tr>' + r.map(c => `<td>${String(c ?? '')}</td>`).join('') + '</tr>').join('');
  download(name + '.xls', `<html><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></body></html>`, 'application/vnd.ms-excel;charset=utf-8;');
}
function toPDF(title: string, sub: string, t: Table) {
  const th = t.cols.map(c => `<th>${c}</th>`).join('');
  const tr = t.rows.map(r => '<tr>' + r.map(c => `<td>${String(c ?? '')}</td>`).join('') + '</tr>').join('');
  const w = window.open('', '_blank'); if (!w) return;
  w.document.write(`<html><head><meta charset="utf-8"><title>${title}</title>
    <style>body{font-family:'Sarabun',sans-serif;padding:24px;color:#0f172a}h1{font-size:18px;margin:0 0 2px}.sub{font-size:12px;color:#64748b;margin-bottom:14px}
    table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}th{background:#1f3a93;color:#fff}
    tr:nth-child(even) td{background:#f8fafc}</style></head>
    <body><h1>${title}</h1><div class="sub">${sub} · การเคหะแห่งชาติ · ระบบ VOC</div>
    <table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>
    <script>window.onload=function(){window.print()}<\/script></body></html>`);
  w.document.close();
}

const btn: React.CSSProperties = { padding: '7px 12px', borderRadius: 8, border: 'none', color: '#fff', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5 };
const sel: React.CSSProperties = { padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 9, fontSize: 13, fontFamily: 'inherit', background: 'var(--card,#fff)', color: 'inherit' };

export default function ReportClient({ rows }: { rows: Voc[] }) {
  const [beYear, setBeYear] = useState(2569);
  const [quarter, setQuarter] = useState('q3');
  const [ptype, setPtype] = useState('all');
  const [projText, setProjText] = useState('');
  const [maxFY, setMaxFY] = useState(2569);
  useEffect(() => { const c = currentFYQuarter(); setMaxFY(c.be); setBeYear(c.be); setQuarter(c.q); }, []);
  const YEARS = [maxFY, maxFY - 1, maxFY - 2];
  const allTime = beYear === 0;
  const range = periodRange(beYear, quarter);
  const projQ = projText.trim().toLowerCase();
  const projOptions = useMemo(() => {
    const m = new Map<string, string>(); rows.forEach(r => { if (r.project) m.set(r.project, r.projectType); });
    return Array.from(m, ([name, type]) => ({ name, type })).filter(p => ptype === 'all' || p.type === ptype);
  }, [rows, ptype]);

  const fr = useMemo(() => rows.filter(r =>
    (allTime || (r.occurredAt >= range.from && r.occurredAt <= range.to)) &&
    (ptype === 'all' || r.projectType === ptype) &&
    (!projQ || (r.project || '').toLowerCase().includes(projQ))
  ), [rows, allTime, range.from, range.to, ptype, projQ]);

  const scope = allTime ? 'ทั้งหมด (ตั้งแต่มีระบบ)' : `ปีงบ ${beYear} · ${QUARTERS.find(q => q.k === quarter)?.label}`;

  // ---------- ตัวสร้างรายงาน ----------
  function grp<T extends string>(key: (r: Voc) => T) {
    const m: Record<string, Voc[]> = {};
    fr.forEach(r => { const k = key(r) || '-'; (m[k] ||= []).push(r); });
    return m;
  }
  const sentOf = (rs: Voc[]) => ({ pos: rs.filter(r => r.sentiment === 'Positive').length, neu: rs.filter(r => r.sentiment === 'Neutral').length, neg: rs.filter(r => r.sentiment === 'Negative').length, high: rs.filter(r => r.priority === 'High').length });

  function repExec(): Table {
    const s = sentOf(fr); const t = fr.length;
    const byCh = grp(r => r.channel); const topCh = Object.entries(byCh).sort((a, b) => b[1].length - a[1].length)[0];
    const byPj = grp(r => r.project); const topPj = Object.entries(byPj).sort((a, b) => b[1].length - a[1].length)[0];
    const tc: Record<string, number> = {}; fr.forEach(r => { if (r.topic) tc[r.topic] = (tc[r.topic] || 0) + 1; });
    const recurring = Object.values(tc).filter(n => n >= 3).length;
    return {
      cols: ['ตัวชี้วัด', 'ค่า'],
      rows: [
        ['ช่วงข้อมูล', scope], ['เสียงลูกค้าทั้งหมด', t], ['เชิงบวก', `${s.pos} (${pct(s.pos, t)})`], ['เป็นกลาง', `${s.neu} (${pct(s.neu, t)})`],
        ['เชิงลบ', `${s.neg} (${pct(s.neg, t)})`], ['เรื่องเร่งด่วน (High)', s.high], ['ประเด็นเฝ้าระวัง (ซ้ำ ≥3)', recurring],
        ['ช่องทางที่มีเสียงมากสุด', topCh ? `${topCh[0]} (${topCh[1].length})` : '-'], ['โครงการที่มีเสียงมากสุด', topPj ? `${topPj[0]} (${topPj[1].length})` : '-'],
      ],
    };
  }
  function repAll(): Table {
    return {
      cols: ['รหัส', 'ช่องทาง', 'แหล่ง', 'ประเภทโครงการ', 'โครงการ', 'ประเด็น', 'เสียงลูกค้า', 'Sentiment', 'ความรุนแรง', 'ฝ่ายที่เกี่ยวข้อง', 'วันที่เกิดเรื่อง'],
      rows: fr.map(r => [r.ref, r.channel, r.source, r.projectType, r.project, r.topic, r.voice, SENT_TH[r.sentiment] || r.sentiment, r.priority, r.owner, r.occurredAt]),
    };
  }
  function repByGroup(cols0: string, keyFn: (r: Voc) => string, extraTypeCol = false): Table {
    const m = grp(keyFn);
    const rowsOut = Object.entries(m).sort((a, b) => b[1].length - a[1].length).map(([k, rs]) => {
      const s = sentOf(rs);
      const base: (string | number)[] = [k];
      if (extraTypeCol) base.push(rs[0]?.projectType || '-');
      return [...base, rs.length, pct(s.pos, rs.length), pct(s.neu, rs.length), pct(s.neg, rs.length), s.high];
    });
    const cols = extraTypeCol ? [cols0, 'ประเภทโครงการ', 'จำนวน', '%บวก', '%กลาง', '%ลบ', 'เร่งด่วน(High)'] : [cols0, 'จำนวน', '%บวก', '%กลาง', '%ลบ', 'เร่งด่วน(High)'];
    return { cols, rows: rowsOut };
  }
  function repBySentiment(): Table {
    const t = fr.length;
    return { cols: ['Sentiment', 'จำนวน', 'สัดส่วน'], rows: (['Positive', 'Neutral', 'Negative'] as const).map(s => { const n = fr.filter(r => r.sentiment === s).length; return [SENT_TH[s], n, pct(n, t)]; }) };
  }
  function repByPriority(): Table {
    const t = fr.length;
    return { cols: ['ความรุนแรง', 'จำนวน', 'สัดส่วน'], rows: (['High', 'Medium', 'Low'] as const).map(p => { const n = fr.filter(r => r.priority === p).length; return [p, n, pct(n, t)]; }) };
  }
  function repRecurring(): Table {
    const m = grp(r => r.topic);
    const rowsOut = Object.entries(m).filter(([, rs]) => rs.length >= 3).sort((a, b) => b[1].length - a[1].length)
      .map(([k, rs]) => [k, rs.length, rs.filter(r => r.sentiment === 'Negative').length, Array.from(new Set(rs.map(r => r.channel))).join(', ')]);
    return { cols: ['ประเด็น', 'จำนวนครั้ง', 'เชิงลบ', 'ช่องทางที่พบ'], rows: rowsOut };
  }

  const REPORTS: { icon: string; name: string; desc: string; title: string; build: () => Table }[] = [
    { icon: '📊', name: 'รายงานสรุปผู้บริหาร', desc: 'ภาพรวมเสียงลูกค้า สัดส่วน และประเด็นเด่น สำหรับนำเสนอผู้บริหาร', title: 'รายงานสรุปผู้บริหาร', build: repExec },
    { icon: '💬', name: 'รายงานเสียงลูกค้าทั้งหมด', desc: 'ข้อมูล VOC รายเรื่อง พร้อมผล AI (Sentiment/ความรุนแรง/ฝ่าย)', title: 'รายงานเสียงลูกค้าทั้งหมด', build: repAll },
    { icon: '📥', name: 'รายงานแยกตามช่องทาง', desc: 'สรุปปริมาณและคุณภาพเสียงราย 8 ช่องทาง', title: 'รายงานแยกตามช่องทาง', build: () => repByGroup('ช่องทาง', r => r.channel) },
    { icon: '🏠', name: 'รายงานแยกตามโครงการ', desc: 'สรุปเสียงลูกค้าตามประเภท/ชื่อโครงการ', title: 'รายงานแยกตามโครงการ', build: () => repByGroup('โครงการ', r => r.project, true) },
    { icon: '😊', name: 'รายงานแยกตาม Sentiment', desc: 'จำนวนและสัดส่วน เชิงบวก/เป็นกลาง/เชิงลบ', title: 'รายงานแยกตาม Sentiment', build: repBySentiment },
    { icon: '🎯', name: 'รายงานแยกตามความรุนแรง', desc: 'จำนวนและสัดส่วนตามระดับความรุนแรง (High/Medium/Low)', title: 'รายงานแยกตามความรุนแรง', build: repByPriority },
    { icon: '🏢', name: 'รายงานแยกตามฝ่ายที่เกี่ยวข้อง', desc: 'ส่งให้แต่ละฝ่ายดูเฉพาะเสียงที่เกี่ยวกับตน', title: 'รายงานแยกตามฝ่ายที่เกี่ยวข้อง', build: () => repByGroup('ฝ่ายที่เกี่ยวข้อง', r => r.owner) },
    { icon: '🔁', name: 'รายงานประเด็นเฝ้าระวัง (ซ้ำ)', desc: 'ประเด็นที่เกิดซ้ำ ≥3 ครั้ง — ตามแนว monitoring', title: 'รายงานประเด็นเฝ้าระวัง', build: repRecurring },
  ];

  return (
    <>
      <header className="top">
        <h1>รายงานข้อมูล</h1>
        <div className="sub">เลือกช่วง/ตัวกรอง แล้วดาวน์โหลดรายงานเป็น CSV / Excel / PDF ได้ตามประเภทที่ต้องการ</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <select style={sel} value={beYear} onChange={e => setBeYear(Number(e.target.value))}>
            <option value={0}>ทั้งหมด (ตั้งแต่มีระบบ)</option>
            {YEARS.map(y => <option key={y} value={y}>ปีงบประมาณ {y}</option>)}
          </select>
          <select style={sel} value={quarter} onChange={e => setQuarter(e.target.value)} disabled={allTime}>
            {QUARTERS.map(q => <option key={q.k} value={q.k}>{q.label}</option>)}
          </select>
          <select style={sel} value={ptype} onChange={e => { setPtype(e.target.value); setProjText(''); }}>
            <option value="all">ทุกประเภทโครงการ</option>
            {PROJECT_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <input list="rep-projects" style={{ ...sel, width: 200 }} value={projText} onChange={e => setProjText(e.target.value)} placeholder="🔎 ทุกชื่อโครงการ" />
          <datalist id="rep-projects">{projOptions.map(p => <option key={p.name} value={p.name} />)}</datalist>
        </div>
      </header>

      <div className="content">
        <div className="card" style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', fontSize: 13 }}>
          📄 กำลังแสดงรายงานของช่วง: <b>{scope}</b> · พบ <b>{fr.length.toLocaleString()}</b> รายการ — ทุกรายงานด้านล่างอิงตามตัวกรองนี้
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16 }}>
          {REPORTS.map(rep => (
            <div key={rep.name} className="card" style={{ marginBottom: 0 }}>
              <h3>{rep.icon} {rep.name}</h3>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', margin: '2px 0 12px' }}>{rep.desc}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button style={{ ...btn, background: '#16a34a' }} onClick={() => toCSV(rep.title, rep.build())}>↓ CSV</button>
                <button style={{ ...btn, background: '#1f7a3d' }} onClick={() => toExcel(rep.title, rep.build())}>↓ Excel</button>
                <button style={{ ...btn, background: '#dc2626' }} onClick={() => toPDF(rep.title, scope, rep.build())}>↓ PDF</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
