'use client';
// นำเข้าข้อมูล — อัปโหลดไฟล์ CSV เข้าตาราง voc_record (แอดมิน/ผู้ปฏิบัติงาน)
// หลักการ: แยก "วันที่เกิดเรื่อง (ต้นทาง)" ที่มากับไฟล์ ออกจาก "วันที่นำเข้าระบบ" (บันทึกอัตโนมัติ = วันนี้)
// Excel: ให้บันทึกเป็น CSV (UTF-8) ก่อนอัปโหลด — เทมเพลตดาวน์โหลดได้ในหน้านี้
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { analyzeText } from '../../lib/ai';

// ช่องทาง 8 ช่อง (id ตรงตาราง channel ใน Supabase)
const CH = [
  { id: 'social', name: 'Social Media', src: ['Facebook', 'Line OA'], realtime: true },
  { id: 'web', name: 'Website / Email / DB', src: ['Website', 'Email', 'Data อื่นๆ'], realtime: false },
  { id: 'sales', name: 'ทีมรณรงค์ขาย', src: ['ทีมรณรงค์ขาย'], realtime: false },
  { id: 'hq', name: 'ฝ่ายงานสำนักงานใหญ่', src: ['ฝ่ายงานสำนักงานใหญ่'], realtime: false },
  { id: 'branch', name: 'สำนักงานสาขาทั่วประเทศ', src: ['สำนักงานสาขาทั่วประเทศ'], realtime: false },
  { id: 'call', name: 'Call Center', src: ['Call Center 1615'], realtime: false },
  { id: 'complain', name: 'ระบบร้องเรียน/ข้อเสนอแนะ', src: ['ระบบร้องเรียน'], realtime: false },
  { id: 'survey', name: 'แบบประเมินความพึงพอใจ', src: ['Google Forms', 'แบบสอบถามกระดาษ'], realtime: false },
];
const PRODUCTS = ['อาคารเพื่อขาย/เช่าซื้อ', 'อาคารเช่า', 'เช่าจัดประโยชน์'];
const JOURNEYS = ['Awareness', 'Consideration', 'Purchase', 'Service', 'Loyalty', 'Win Back'];
const HEADERS = ['วันที่เกิดเรื่อง', 'หัวข้อ', 'ข้อความเสียงลูกค้า', 'แหล่งที่มา', 'กลุ่มผลิตภัณฑ์', 'Journey'];

// ---------- CSV parser เล็ก ๆ (รองรับ "..." และ , ในข้อความ) ----------
function parseCSV(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some(x => x.trim() !== '')) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some(x => x.trim() !== '')) rows.push(row);
  return rows;
}

interface Parsed { occurred: string; topic: string; text: string; source: string; product: string; journey: string; err: string }

const inp: React.CSSProperties = { padding: '9px 11px', border: '1px solid #dfe6f0', borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit', background: '#fff' };

export default function ImportPage() {
  const [role, setRole] = useState<string | null>(null);
  const [chId, setChId] = useState('web');
  const [source, setSource] = useState('Website');
  const [rows, setRows] = useState<Parsed[]>([]);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const ch = CH.find(c => c.id === chId)!;

  useEffect(() => {
    if (!supabase) { setRole('mock'); return; }
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setRole('none'); return; }
      const { data: p } = await supabase!.from('profiles').select('role').eq('id', data.user.id).single();
      setRole(p?.role ?? 'operator');
    });
  }, []);

  function downloadTemplate() {
    const example = [
      HEADERS.join(','),
      '2026-07-10,แจ้งซ่อมไฟทางเดิน,"ไฟทางเดินหน้าอาคาร 3 ดับหลายจุด กลางคืนมืดมาก",' + (ch.src[0] || ch.name) + ',อาคารเช่า,Service',
      '2026-07-11,สอบถามการจอง,"อยากจองบ้านโครงการใหม่ ต้องใช้เอกสารอะไรบ้าง",' + (ch.src[0] || ch.name) + ',อาคารเพื่อขาย/เช่าซื้อ,Consideration',
    ].join('\r\n');
    const blob = new Blob(['﻿' + example], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'VOC_template_' + chId + '.csv';
    a.click(); URL.revokeObjectURL(a.href);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setMsg(''); setErr(''); setRows([]);
    const f = e.target.files?.[0]; if (!f) return;
    setFileName(f.name);
    if (!/\.(csv|txt)$/i.test(f.name)) { setErr('รองรับไฟล์ .csv — ถ้าเป็น Excel ให้ Save As เป็น CSV UTF-8 ก่อน'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const grid = parseCSV(String(reader.result || ''));
      if (grid.length < 2) { setErr('ไฟล์ว่างหรือไม่มีข้อมูล (ต้องมีหัวตาราง + อย่างน้อย 1 แถว)'); return; }
      const head = grid[0].map(h => h.trim());
      const ix = (name: string) => head.findIndex(h => h.includes(name));
      const iDate = ix('วันที่'), iTopic = ix('หัวข้อ'), iText = ix('ข้อความ'), iSrc = ix('แหล่ง'), iProd = ix('ผลิตภัณฑ์'), iJr = ix('Journey');
      if (iDate < 0 || iText < 0) { setErr('ไม่พบคอลัมน์ "วันที่เกิดเรื่อง" หรือ "ข้อความเสียงลูกค้า" — ใช้เทมเพลตที่ดาวน์โหลดจากหน้านี้'); return; }
      const out: Parsed[] = grid.slice(1).map(r => {
        const occurred = (r[iDate] || '').trim();
        const text = (r[iText] || '').trim();
        const product = iProd >= 0 ? (r[iProd] || '').trim() : '';
        const journey = iJr >= 0 ? (r[iJr] || '').trim() : '';
        let e = '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(occurred)) e = 'วันที่ต้องเป็น YYYY-MM-DD';
        else if (!text) e = 'ไม่มีข้อความเสียงลูกค้า';
        else if (product && !PRODUCTS.includes(product)) e = 'กลุ่มผลิตภัณฑ์ไม่ตรง (ปล่อยว่างได้)';
        else if (journey && !JOURNEYS.includes(journey)) e = 'Journey ไม่ตรง (ปล่อยว่างได้)';
        return { occurred, topic: iTopic >= 0 ? (r[iTopic] || '').trim() : '', text, source: iSrc >= 0 ? (r[iSrc] || '').trim() : '', product, journey, err: e };
      });
      setRows(out);
    };
    reader.readAsText(f, 'utf-8');
  }

  const ok = rows.filter(r => !r.err);
  const bad = rows.filter(r => r.err);

  async function save() {
    if (!supabase || !ok.length) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      const { data: u } = await supabase.auth.getUser();
      const stamp = Date.now();
      // วิเคราะห์อัตโนมัติด้วย AI (rule/keyword) ทุกแถวก่อนบันทึก — เจ้าหน้าที่แก้ไขภายหลังได้
      const ai = ok.map(r => analyzeText((r.topic ? r.topic + ' ' : '') + r.text, chId));
      const payload = ok.map((r, i) => ({
        ref_code: 'VOC-' + stamp + '-' + (i + 1),
        channel_id: chId,
        source: r.source || source,
        product_group: r.product || null,
        journey_stage: r.journey || ai[i].journey,
        raw_text: r.text,
        topic: r.topic || null,
        occurred_at: r.occurred,          // วันที่เกิดเรื่อง (ต้นทาง — มากับไฟล์)
        is_imported: true,                 // นำเข้าจากไฟล์ (imported_at = now อัตโนมัติ)
        owner_dept: ai[i].owner,           // จับคู่ฝ่ายรับผิดชอบตามประเภทเสียง
        created_by: u.user?.id ?? null,
      }));
      // แบ่งชุดละ 100 แถว + บันทึกผลวิเคราะห์ AI ลงตาราง analysis คู่กัน
      for (let i = 0; i < payload.length; i += 100) {
        const { data: ins, error } = await supabase.from('voc_record')
          .insert(payload.slice(i, i + 100)).select('id, ref_code');
        if (error) throw error;
        const byRef = new Map((ins ?? []).map((x: any) => [x.ref_code, x.id]));
        const arows = payload.slice(i, i + 100).map((p, j) => ({
          voc_id: byRef.get(p.ref_code),
          sentiment: ai[i + j].sentiment,
          sentiment_confidence: ai[i + j].conf,
          sentiment_reason: ai[i + j].reason,
          journey_stage: p.journey_stage,
          cat_product: ai[i + j].catProduct,
          cat_sales: ai[i + j].catSales,
          priority: ai[i + j].priority,
        })).filter(a => a.voc_id);
        if (arows.length) {
          const { error: e2 } = await supabase.from('analysis').insert(arows);
          if (e2) throw e2;
        }
      }
      setMsg('นำเข้าสำเร็จ ' + ok.length + ' รายการ เข้าช่องทาง "' + ch.name + '" — ดูได้ในเมนูรายการ VOC');
      setRows([]); setFileName('');
    } catch (e: any) {
      setErr('นำเข้าไม่สำเร็จ: ' + (e.message || String(e)));
    }
    setBusy(false);
  }

  const blocked = role === 'executive';

  return (
    <>
      <header className="top"><h1>นำเข้าข้อมูล (อัปโหลดไฟล์)</h1><div className="sub">CSV → ตรวจสอบ → บันทึกเข้าระบบ · เรียลไทม์เฉพาะ Social (ผ่าน API)</div></header>
      <div className="content">
        {blocked ? (
          <div className="card">👁️ บทบาทผู้บริหาร — ดูข้อมูลอย่างเดียว ไม่สามารถนำเข้าข้อมูลได้</div>
        ) : (
        <>
        {/* ขั้น 1: เลือกช่องทาง */}
        <div className="card">
          <h3>1️⃣ เลือกช่องทางที่มาของข้อมูล</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
            <select style={inp} value={chId} onChange={e => { setChId(e.target.value); const c = CH.find(x => x.id === e.target.value)!; setSource(c.src[0] || c.name); }}>
              {CH.map(c => <option key={c.id} value={c.id}>{c.name}{c.realtime ? ' (ปกติเรียลไทม์ — นำเข้าย้อนหลังได้)' : ''}</option>)}
            </select>
            <select style={inp} value={source} onChange={e => setSource(e.target.value)}>
              {ch.src.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="btn" type="button" onClick={downloadTemplate}>⬇️ ดาวน์โหลดเทมเพลต CSV</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
            คอลัมน์: {HEADERS.join(' · ')} — "วันที่เกิดเรื่อง" ใช้รูปแบบ YYYY-MM-DD ส่วน "วันที่นำเข้าระบบ" ระบบบันทึกให้อัตโนมัติ (วันนี้)
          </div>
        </div>

        {/* ขั้น 2: อัปโหลด */}
        <div className="card">
          <h3>2️⃣ อัปโหลดไฟล์ CSV</h3>
          <input type="file" accept=".csv,.txt" onChange={onFile} style={{ marginTop: 8, fontSize: 13.5, fontFamily: 'inherit' }} />
          {fileName && <span style={{ fontSize: 12.5, color: 'var(--muted)', marginLeft: 10 }}>{fileName}</span>}
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>* ไฟล์ Excel (.xlsx): เปิดใน Excel → Save As → CSV UTF-8 แล้วอัปโหลด</div>
        </div>

        {/* ขั้น 3: พรีวิว + บันทึก */}
        {rows.length > 0 && (
          <div className="card">
            <h3>3️⃣ ตรวจสอบก่อนบันทึก — ผ่าน <b style={{ color: 'var(--green)' }}>{ok.length}</b> / มีปัญหา <b style={{ color: 'var(--red)' }}>{bad.length}</b></h3>
            <table style={{ marginTop: 8 }}>
              <thead><tr><th>#</th><th>วันที่เกิดเรื่อง</th><th>หัวข้อ</th><th>ข้อความ</th><th>แหล่ง</th><th>ผลตรวจ</th></tr></thead>
              <tbody>{rows.slice(0, 10).map((r, i) => (
                <tr key={i} style={r.err ? { background: '#fef2f2' } : undefined}>
                  <td>{i + 1}</td><td>{r.occurred}</td><td>{r.topic}</td>
                  <td style={{ maxWidth: 280, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.text}>{r.text}</td>
                  <td>{r.source || source}</td>
                  <td>{r.err ? <span style={{ color: 'var(--red)', fontSize: 12 }}>✗ {r.err}</span> : <span style={{ color: 'var(--green)', fontSize: 12 }}>✓ พร้อมนำเข้า</span>}</td>
                </tr>
              ))}</tbody>
            </table>
            {rows.length > 10 && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>แสดง 10 จาก {rows.length} แถว</div>}
            <div style={{ marginTop: 12 }}>
              {role === 'mock'
                ? <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>* โหมดข้อมูลจำลอง — ปุ่มบันทึกจะใช้ได้เมื่อเชื่อม Supabase</div>
                : role === 'none'
                ? <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>* กรุณาเข้าสู่ระบบก่อนนำเข้าข้อมูล</div>
                : <button className="btn" onClick={save} disabled={busy || !ok.length}>{busy ? 'กำลังนำเข้า…' : '💾 บันทึก ' + ok.length + ' รายการเข้าระบบ'}</button>}
            </div>
          </div>
        )}
        {msg && <div className="card" style={{ color: '#15803d' }}>✓ {msg}</div>}
        {err && <div className="card" style={{ color: '#b91c1c' }}>{err}</div>}
        </>
        )}
      </div>
    </>
  );
}
