'use client';
import { useMemo, useState } from 'react';
import type { Voc } from '../../lib/data';

const SENT_TH: Record<string, string> = { Positive: 'เชิงบวก', Neutral: 'เป็นกลาง', Negative: 'เชิงลบ' };
const COLS: { key: keyof Voc; label: string }[] = [
  { key: 'ref', label: 'รหัส' }, { key: 'channel', label: 'ช่องทาง' }, { key: 'source', label: 'แหล่ง' },
  { key: 'project', label: 'โครงการ' }, { key: 'topic', label: 'ประเด็น' }, { key: 'voice', label: 'เสียงลูกค้า' },
  { key: 'sentiment', label: 'Sentiment' }, { key: 'priority', label: 'ความเร่งด่วน' },
  { key: 'owner', label: 'ฝ่ายรับผิดชอบ' }, { key: 'status', label: 'สถานะ' }, { key: 'occurredAt', label: 'วันที่เกิดเรื่อง' },
];

function cell(r: Voc, k: keyof Voc) {
  const v = r[k];
  return k === 'sentiment' ? (SENT_TH[v as string] || v) : String(v ?? '');
}

function download(name: string, content: string, mime: string) {
  const blob = new Blob(['﻿' + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export default function ReportClient({ rows }: { rows: Voc[] }) {
  const [channel, setChannel] = useState('');
  const [sentiment, setSentiment] = useState('');

  const channels = useMemo(() => Array.from(new Set(rows.map(r => r.channel))).filter(Boolean), [rows]);
  const filtered = useMemo(() => rows.filter(r =>
    (!channel || r.channel === channel) && (!sentiment || r.sentiment === sentiment)
  ), [rows, channel, sentiment]);

  const stamp = () => new Date().toISOString().slice(0, 10);

  function toCSV() {
    const head = COLS.map(c => c.label).join(',');
    const body = filtered.map(r => COLS.map(c => {
      const t = cell(r, c.key).replace(/"/g, '""');
      return `"${t}"`;
    }).join(',')).join('\n');
    download(`VOC_report_${stamp()}.csv`, head + '\n' + body, 'text/csv;charset=utf-8;');
  }

  function toExcel() {
    // HTML table ที่ Excel เปิดได้ (.xls)
    const th = COLS.map(c => `<th>${c.label}</th>`).join('');
    const tr = filtered.map(r => '<tr>' + COLS.map(c => `<td>${cell(r, c.key)}</td>`).join('') + '</tr>').join('');
    const html = `<html><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></body></html>`;
    download(`VOC_report_${stamp()}.xls`, html, 'application/vnd.ms-excel;charset=utf-8;');
  }

  const btn: React.CSSProperties = { padding: '9px 16px', borderRadius: 9, border: 'none', color: '#fff', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5 };
  const sel: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid #dfe6f0', fontFamily: 'inherit', fontSize: 13.5 };

  return (
    <>
      <div className="card no-print" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, color: '#64748b' }}>ช่องทาง</div>
          <select style={sel} value={channel} onChange={e => setChannel(e.target.value)}>
            <option value="">ทั้งหมด</option>
            {channels.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#64748b' }}>Sentiment</div>
          <select style={sel} value={sentiment} onChange={e => setSentiment(e.target.value)}>
            <option value="">ทั้งหมด</option>
            <option value="Positive">เชิงบวก</option>
            <option value="Neutral">เป็นกลาง</option>
            <option value="Negative">เชิงลบ</option>
          </select>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <button style={{ ...btn, background: '#16a34a' }} onClick={toCSV}>⬇ CSV</button>
          <button style={{ ...btn, background: '#1f7a3d' }} onClick={toExcel}>⬇ Excel</button>
          <button style={{ ...btn, background: '#dc2626' }} onClick={() => window.print()}>⬇ PDF (พิมพ์)</button>
        </div>
      </div>

      <div className="card">
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>แสดง {filtered.length.toLocaleString()} รายการ</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '2px solid #eef2f7' }}>
              {COLS.map(c => <th key={String(c.key)} style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                {COLS.map(c => (
                  <td key={String(c.key)} style={{ padding: '7px 6px', maxWidth: c.key === 'voice' ? 320 : undefined }}>
                    {cell(r, c.key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{`@media print { .no-print{display:none!important} .side{display:none!important} .top{display:none!important} body{background:#fff} }`}</style>
    </>
  );
}
