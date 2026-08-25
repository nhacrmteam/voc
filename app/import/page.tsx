'use client';
// นำเข้าข้อมูล — อัปโหลดไฟล์ CSV เข้าตาราง voc_record (แอดมิน/ผู้ปฏิบัติงาน)
// หลักการ: แยก "วันที่เกิดเรื่อง (ต้นทาง)" ที่มากับไฟล์ ออกจาก "วันที่นำเข้าระบบ" (บันทึกอัตโนมัติ = วันนี้)
// รองรับ .csv และ .xlsx โดยตรง — หาแถวหัวตารางเองใน 10 แถวแรก + รับชื่อคอลัมน์หลายแบบ + แปลงวันที่ พ.ศ./d-m-Y ให้อัตโนมัติ
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { analyzeText, analyzeSmartBatch, SmartResult } from '../../lib/ai';

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

// ---------- ทำตารางให้ "ทึบ" ทุกช่อง ----------
// สำคัญ: SheetJS คืน array ที่มีรูโหว่ (sparse) เมื่อเซลล์ว่าง — .map() ข้ามรู แต่ .findIndex() ไม่ข้าม
// ทำให้เจอ undefined แล้วพัง ("Cannot read properties of undefined") จึงต้องสร้างใหม่ด้วย Array.from
function dense(rows: unknown[][]): string[][] {
  return rows
    .map(r => {
      const a = Array.isArray(r) ? r : [];
      return Array.from({ length: a.length }, (_, i) => String(a[i] ?? '').trim());
    })
    .filter(r => r.some(c => c !== ''));
}

// ---------- ชื่อหัวคอลัมน์ที่ยอมรับ (ไฟล์จริงมักไม่ตรงเทมเพลตเป๊ะ) ----------
const HKEY = {
  date: ['วันที่'],
  text: ['ข้อความ', 'เสียงลูกค้า', 'รายละเอียด', 'ความคิดเห็น', 'ข้อเสนอแนะ', 'ความเห็น', 'voice', 'comment'],
  topic: ['หัวข้อ', 'ประเด็น', 'เรื่องที่', 'topic'],
  src: ['แหล่ง', 'ที่มา', 'ช่องทาง', 'source'],
  prod: ['ผลิตภัณฑ์', 'product'],
  jr: ['journey', 'ขั้นตอน'],
};
function findCol(head: string[], keys: string[], skip: number[] = []): number {
  const low = head.map(h => (h || '').toLowerCase());
  for (const k of keys) {
    const kk = k.toLowerCase();
    const i = low.findIndex((h, idx) => !skip.includes(idx) && h.includes(kk));
    if (i >= 0) return i;
  }
  return -1;
}

// ---------- แปลงวันที่หลายรูปแบบ → YYYY-MM-DD (รองรับ พ.ศ. และ วัน/เดือน/ปี) ----------
function normDate(v: string): string {
  const s = (v || '').trim();
  if (!s) return '';
  const fix = (y: number, mo: number, d: number) => {
    if (y > 2400) y -= 543;                       // พ.ศ. → ค.ศ.
    else if (y < 100) y += y > 50 ? 1900 : 2000;  // ปี 2 หลัก
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return s;
    return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  };
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);      // 2026-07-10 / 2569-07-10
  if (m) return fix(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);          // 10/07/2026 · 10/07/2569
  if (m) return fix(+m[3], +m[2], +m[1]);
  const d = new Date(s);                                        // รูปแบบอื่นที่ JS อ่านออก
  if (!isNaN(d.getTime())) return fix(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return s;
}

interface Parsed { occurred: string; topic: string; text: string; source: string; product: string; journey: string; err: string }

const inp: React.CSSProperties = { padding: '9px 11px', border: '1px solid #dfe6f0', borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit', background: '#fff' };
const cellInp: React.CSSProperties = { padding: '5px 7px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12.5, fontFamily: 'inherit', background: 'var(--card,#fff)', color: 'inherit' };
interface UploadLog { id: string; file_name: string | null; channel_id: string; total: number; ok_count: number; created_at: string; profiles?: { full_name: string | null } | { full_name: string | null }[] }

export default function ImportPage() {
  const [role, setRole] = useState<string | null>(null);
  const [chId, setChId] = useState('web');
  const [source, setSource] = useState('Website');
  const [rows, setRows] = useState<Parsed[]>([]);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [useLLM, setUseLLM] = useState(false);
  const [prog, setProg] = useState('');
  const [method, setMethod] = useState<'file' | 'api' | 'forms' | 'db'>('file');
  const [history, setHistory] = useState<UploadLog[]>([]);
  const fnBase = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://<โปรเจกต์>.supabase.co') + '/functions/v1/ingest-voc';

  async function loadHistory() {
    if (!supabase) return;
    const { data } = await supabase.from('upload_log')
      .select('id, file_name, channel_id, total, ok_count, created_at, profiles(full_name)')
      .order('created_at', { ascending: false }).limit(20);
    if (data) setHistory(data as UploadLog[]);
  }

  const ch = CH.find(c => c.id === chId)!;

  useEffect(() => {
    if (!supabase) { setRole('mock'); return; }
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setRole('none'); return; }
      const { data: p } = await supabase!.from('profiles').select('role').eq('id', data.user.id).single();
      setRole(p?.role ?? 'operator');
      loadHistory();
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
    const isXlsx = /\.(xlsx|xls)$/i.test(f.name);
    if (!isXlsx && !/\.(csv|txt)$/i.test(f.name)) { setErr('รองรับไฟล์ .csv และ .xlsx เท่านั้น'); return; }
    if (isXlsx) {
      // อ่าน Excel ด้วย SheetJS (แผ่นแรก) — วันที่ Excel แปลงเป็น YYYY-MM-DD ให้อัตโนมัติ
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const XLSX = await import('xlsx');
          const wb = XLSX.read(reader.result, { type: 'array', cellDates: true });
          const ws = wb.Sheets[wb.SheetNames[0]];
          if (!ws) { setErr('ไฟล์ Excel นี้ไม่มีแผ่นงาน (sheet) ที่อ่านได้'); return; }
          const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd', defval: '' }) as unknown[][];
          handleGrid(dense(raw));
        } catch (ex: any) { setErr('อ่านไฟล์ Excel ไม่สำเร็จ: ' + (ex.message || String(ex))); }
      };
      reader.readAsArrayBuffer(f);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => handleGrid(dense(parseCSV(String(reader.result || ''))));
    reader.readAsText(f, 'utf-8');
  }

  function handleGrid(grid: string[][]) {
    if (grid.length < 2) { setErr('ไฟล์ว่างหรือไม่มีข้อมูล (ต้องมีหัวตาราง + อย่างน้อย 1 แถว)'); return; }

    // หาแถวหัวตารางเอง — ไฟล์จริงมักมีบรรทัดชื่อรายงาน/โลโก้อยู่ข้างบนก่อน
    let hr = -1, iDate = -1, iText = -1;
    for (let i = 0; i < Math.min(grid.length, 10); i++) {
      const d = findCol(grid[i], HKEY.date);
      const t = findCol(grid[i], HKEY.text, d >= 0 ? [d] : []);
      if (d >= 0 && t >= 0) { hr = i; iDate = d; iText = t; break; }
    }
    if (hr < 0) {
      const shown = (grid[0] || []).filter(Boolean).join(' | ').slice(0, 400);
      setErr('ไม่พบคอลัมน์วันที่ และ/หรือ ข้อความเสียงลูกค้าในไฟล์นี้' +
        (shown ? ' · หัวตารางที่อ่านได้: ' + shown : '') +
        ' — เปลี่ยนชื่อหัวคอลัมน์ให้มีคำว่า "วันที่" และ "ข้อความ" (หรือดาวน์โหลดเทมเพลตจากหน้านี้)');
      return;
    }

    const head = grid[hr];
    const used = [iDate, iText];
    const iTopic = findCol(head, HKEY.topic, used);
    const iSrc = findCol(head, HKEY.src, used);
    const iProd = findCol(head, HKEY.prod, used);
    const iJr = findCol(head, HKEY.jr, used);
    const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');

    let dropped = 0;
    const out: Parsed[] = grid.slice(hr + 1)
      .filter(r => cell(r, iDate) !== '' || cell(r, iText) !== '')   // ตัดแถวท้ายไฟล์ที่ว่าง/แถวรวมยอด
      .map(r => {
        // ค่ากลุ่มผลิตภัณฑ์/Journey ที่ไม่ตรงรายการมาตรฐาน → ปล่อยว่างแทนที่จะฟ้อง error ทั้งแถว
        const prod = cell(r, iProd), jr = cell(r, iJr);
        const okProd = PRODUCTS.includes(prod) ? prod : '';
        const okJr = JOURNEYS.includes(jr) ? jr : '';
        if ((prod && !okProd) || (jr && !okJr)) dropped++;
        const p: Parsed = {
          occurred: normDate(cell(r, iDate)),
          topic: cell(r, iTopic),
          text: cell(r, iText),
          source: cell(r, iSrc),
          product: okProd,
          journey: okJr,
          err: '',
        };
        p.err = validateRow(p);
        return p;
      });

    if (!out.length) { setErr('พบหัวตารางแล้ว แต่ไม่มีแถวข้อมูลด้านล่าง'); return; }
    setErr('');
    const good = out.filter(x => !x.err).length;
    setMsg('อ่านไฟล์สำเร็จ ' + out.length + ' แถว · ผ่านการตรวจ ' + good + ' แถว' +
      (out.length - good ? ' · ต้องแก้ ' + (out.length - good) + ' แถว (แก้ในตารางด้านล่างได้)' : '') +
      (dropped ? ' · ข้ามค่ากลุ่มผลิตภัณฑ์/Journey ที่ไม่ตรงรายการ ' + dropped + ' แถว' : ''));
    setRows(out);
  }

  // ตรวจสอบความถูกต้องต่อแถว (ใช้ทั้งตอนอ่านไฟล์และตอนแก้ไข)
  function validateRow(p: Parsed): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.occurred)) return 'วันที่ต้องเป็น YYYY-MM-DD';
    if (!p.text.trim()) return 'ไม่มีข้อความเสียงลูกค้า';
    if (p.product && !PRODUCTS.includes(p.product)) return 'กลุ่มผลิตภัณฑ์ไม่ตรง (ปล่อยว่างได้)';
    if (p.journey && !JOURNEYS.includes(p.journey)) return 'Journey ไม่ตรง (ปล่อยว่างได้)';
    return '';
  }
  // แก้ไขค่าในแถว → ตรวจสอบใหม่ทันที
  function editRow(i: number, key: keyof Parsed, value: string) {
    setRows(rs => rs.map((r, idx) => {
      if (idx !== i) return r;
      const nr = { ...r, [key]: value };
      nr.err = validateRow(nr);
      return nr;
    }));
  }
  function delRow(i: number) { setRows(rs => rs.filter((_, idx) => idx !== i)); }

  const ok = rows.filter(r => !r.err);
  const bad = rows.filter(r => r.err);

  async function save() {
    if (!supabase || !ok.length) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      const { data: u } = await supabase.auth.getUser();
      const stamp = Date.now();
      // วิเคราะห์อัตโนมัติทุกแถวก่อนบันทึก — LLM (ถ้าเลือก) หรือ rule/keyword; เจ้าหน้าที่แก้ไขภายหลังได้
      let ai: SmartResult[];
      let llmCount = 0;
      let model = '';
      if (useLLM) {
        const texts = ok.map(r => (r.topic ? r.topic + ' ' : '') + r.text);
        ai = await analyzeSmartBatch(texts, chId, (done, total) =>
          setProg('วิเคราะห์ด้วย AI แล้ว ' + done + '/' + total + ' แถว…'));
        ai.forEach(b => { if (b.via === 'llm') { llmCount++; if (!model && b.model) model = b.model; } });
        setProg('');
      } else {
        ai = ok.map(r => ({ ...analyzeText((r.topic ? r.topic + ' ' : '') + r.text, chId), via: 'rule' as const }));
      }
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
          engine: ai[i + j].via,                        // 'llm' | 'rule' — ดูได้ในหน้า AI วิเคราะห์
          model: ai[i + j].model ?? null,
          analyzed_by: 'import',
        })).filter(a => a.voc_id);
        if (arows.length) {
          const { error: e2 } = await supabase.from('analysis').insert(arows);
          // ถ้ายังไม่ได้รัน supabase_llm_engine.sql จะไม่มีคอลัมน์ engine/model/analyzed_by → บันทึกซ้ำแบบไม่มีคอลัมน์ใหม่
          if (e2) {
            if (/engine|model|analyzed_by|column/i.test(e2.message || '')) {
              const legacy = arows.map(({ engine, model, analyzed_by, ...rest }) => rest);
              const { error: e3 } = await supabase.from('analysis').insert(legacy);
              if (e3) throw e3;
            } else throw e2;
          }
        }
      }
      // บันทึกประวัติการอัปโหลด (ไม่ให้ error ตรงนี้ทำให้การนำเข้าล้ม)
      try {
        await supabase.from('upload_log').insert({
          uploaded_by: u.user?.id ?? null, channel_id: chId, source, file_name: fileName || null,
          total: rows.length, ok_count: ok.length, method: 'file',
        });
        loadHistory();
      } catch { /* ตาราง upload_log อาจยังไม่ถูกสร้าง — ข้าม */ }
      setMsg('นำเข้าสำเร็จ ' + ok.length + ' รายการ เข้าช่องทาง "' + ch.name + '"' +
        (useLLM
          ? (llmCount === ok.length
              ? ' · วิเคราะห์ด้วย LLM ทั้งหมด' + (model ? ' (' + model + ')' : '')
              : ' · LLM ' + llmCount + ' แถว, rule-based ' + (ok.length - llmCount) + ' แถว (LLM ใช้ไม่ได้บางส่วน)')
          : ' · วิเคราะห์แบบ rule-based') +
        ' — ดูได้ในเมนูรายการ VOC');
      setRows([]); setFileName('');
    } catch (e: any) {
      setErr('นำเข้าไม่สำเร็จ: ' + (e.message || String(e)));
    }
    setBusy(false);
  }

  // นำเข้าข้อมูลเป็นสิทธิ์ของแอดมินเท่านั้น (operator/executive เข้าไม่ได้)
  const blocked = role !== 'admin' && role !== 'mock' && role !== 'none';

  return (
    <>
      <header className="top"><h1>นำเข้า & เชื่อมต่อข้อมูลเสียงลูกค้า</h1><div className="sub">รับข้อมูลได้หลายรูปแบบ — อัปโหลดไฟล์ · Google Forms/ฟอร์มออนไลน์ · ฐานข้อมูล/ระบบภายใน · API เรียลไทม์</div></header>
      <div className="content">
        {blocked ? (
          <div className="card">🔒 เมนูนำเข้าข้อมูลสำหรับบทบาทแอดมินเท่านั้น</div>
        ) : (
        <>
        {/* เลือกรูปแบบการนำเข้า */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginBottom: 16 }}>
          {([
            ['file', '📤', 'อัปโหลดไฟล์', 'CSV / Excel'],
            ['forms', '📝', 'Google Forms / ฟอร์มออนไลน์', 'Forms · Microsoft Forms ฯลฯ'],
            ['db', '🗄️', 'ฐานข้อมูล / ระบบภายใน', 'เชื่อมระบบองค์กร'],
            ['api', '🔌', 'API / Webhook (เรียลไทม์)', 'LINE OA · Facebook · อื่น ๆ'],
          ] as const).map(([k, ic, name, desc]) => (
            <div key={k} className="card chan-card" style={{ marginBottom: 0, borderColor: method === k ? 'var(--blue)' : 'var(--line)', outline: method === k ? '2px solid var(--blue)' : 'none' }} onClick={() => setMethod(k)}>
              <div style={{ fontSize: 22 }}>{ic}</div>
              <div style={{ fontWeight: 700, fontSize: 14, marginTop: 4 }}>{name}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{desc}</div>
            </div>
          ))}
        </div>

        {method === 'file' && <>
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
          <h3>2️⃣ อัปโหลดไฟล์ CSV หรือ Excel</h3>
          <input type="file" accept=".csv,.txt,.xlsx,.xls" onChange={onFile} style={{ marginTop: 8, fontSize: 13.5, fontFamily: 'inherit' }} />
          {fileName && <span style={{ fontSize: 12.5, color: 'var(--muted)', marginLeft: 10 }}>{fileName}</span>}
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>* รองรับ .csv และ .xlsx (อ่านแผ่นแรก) — หัวตารางตามเทมเพลต</div>
        </div>

        {/* ขั้น 3: พรีวิว + บันทึก */}
        {rows.length > 0 && (
          <div className="card">
            <h3>3️⃣ ตรวจสอบ/แก้ไขก่อนบันทึก — ผ่าน <b style={{ color: 'var(--green)' }}>{ok.length}</b> / มีปัญหา <b style={{ color: 'var(--red)' }}>{bad.length}</b></h3>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>แก้ไขในช่องได้เลย (ตรวจสอบใหม่ทันที) · แถวที่มีปัญหาเป็นพื้นแดง · กด 🗑️ เพื่อลบแถว</div>
            <div style={{ maxHeight: 440, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 10 }}>
              <table style={{ fontSize: 12.5 }}>
                <thead><tr><th style={{ width: 34 }}>#</th><th>วันที่เกิดเรื่อง</th><th>หัวข้อ</th><th>ข้อความเสียงลูกค้า</th><th>แหล่ง</th><th>ผลตรวจ</th><th></th></tr></thead>
                <tbody>{rows.map((r, i) => (
                  <tr key={i} style={r.err ? { background: '#fef2f2' } : undefined}>
                    <td>{i + 1}</td>
                    <td><input value={r.occurred} onChange={e => editRow(i, 'occurred', e.target.value)} style={{ ...cellInp, width: 108 }} placeholder="YYYY-MM-DD" /></td>
                    <td><input value={r.topic} onChange={e => editRow(i, 'topic', e.target.value)} style={{ ...cellInp, width: 130 }} /></td>
                    <td><input value={r.text} onChange={e => editRow(i, 'text', e.target.value)} style={{ ...cellInp, width: 280 }} /></td>
                    <td><input value={r.source} onChange={e => editRow(i, 'source', e.target.value)} style={{ ...cellInp, width: 100 }} placeholder={source} /></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.err ? <span style={{ color: 'var(--red)', fontSize: 11.5 }}>✗ {r.err}</span> : <span style={{ color: 'var(--green)', fontSize: 11.5 }}>✓ พร้อม</span>}</td>
                    <td><button type="button" onClick={() => delRow(i)} title="ลบแถวนี้" style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 15 }}>🗑️</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>ทั้งหมด {rows.length} แถว · จะบันทึกเฉพาะแถวที่ผ่าน ({ok.length})</div>
            <div style={{ marginTop: 12 }}>
              {role === 'mock'
                ? <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>* โหมดข้อมูลจำลอง — ปุ่มบันทึกจะใช้ได้เมื่อเชื่อม Supabase</div>
                : role === 'none'
                ? <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>* กรุณาเข้าสู่ระบบก่อนนำเข้าข้อมูล</div>
                : (
                <>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 10, cursor: 'pointer' }}>
                    <input type="checkbox" checked={useLLM} onChange={e => setUseLLM(e.target.checked)} />
                    🧠 วิเคราะห์ด้วย LLM จริง (แม่นกว่า — ส่งครั้งละ 10 แถว, ถ้า LLM ใช้ไม่ได้จะสลับเป็น rule-based ให้อัตโนมัติ)
                  </label>
                  {useLLM && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', margin: '-4px 0 10px 26px' }}>
                      ประมาณ {Math.ceil(ok.length / 10)} คำขอ · ตรวจการเชื่อมต่อ LLM ได้ที่เมนู &ldquo;จัดการระบบ&rdquo;
                    </div>
                  )}
                  <button className="btn" onClick={save} disabled={busy || !ok.length}>{busy ? (prog || 'กำลังนำเข้า…') : '💾 บันทึก ' + ok.length + ' รายการเข้าระบบ'}</button>
                </>
                )}
            </div>
          </div>
        )}
        {msg && <div className="card" style={{ color: '#15803d' }}>✓ {msg}</div>}
        {err && <div className="card" style={{ color: '#b91c1c' }}>{err}</div>}

        {/* ประวัติการอัปโหลด */}
        <div className="card">
          <h3>🕒 ประวัติการอัปโหลด (ล่าสุด 20 ครั้ง)</h3>
          {history.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>ยังไม่มีประวัติ — เมื่อบันทึกการนำเข้าสำเร็จจะแสดงที่นี่ (ต้องรัน supabase_upload_log.sql ก่อน)</div>
          ) : (
            <table>
              <thead><tr><th>วันเวลา</th><th>ช่องทาง</th><th>ไฟล์</th><th>ทั้งหมด</th><th>นำเข้าสำเร็จ</th><th>โดย</th></tr></thead>
              <tbody>{history.map(h => {
                const prof = Array.isArray(h.profiles) ? h.profiles[0] : h.profiles;
                return (
                  <tr key={h.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{(h.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                    <td>{CH.find(c => c.id === h.channel_id)?.name || h.channel_id}</td>
                    <td>{h.file_name || '-'}</td>
                    <td>{h.total}</td>
                    <td style={{ color: 'var(--green)', fontWeight: 600 }}>{h.ok_count}</td>
                    <td>{prof?.full_name || '-'}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          )}
        </div>
        </>}

        {/* Google Forms / ฟอร์มออนไลน์ */}
        {method === 'forms' && (
          <div className="card">
            <h3>📝 Google Forms / ฟอร์มออนไลน์</h3>
            <p style={{ fontSize: 13.5, lineHeight: 1.8, color: 'var(--ink)' }}>
              เชื่อมแบบสอบถามออนไลน์ให้ส่งทุกคำตอบใหม่เข้าระบบอัตโนมัติ (เรียลไทม์) เหมาะกับช่องทาง &ldquo;แบบประเมินความพึงพอใจ&rdquo;
            </p>
            <ol style={{ fontSize: 13, lineHeight: 2, paddingLeft: 20 }}>
              <li><b>Google Forms:</b> เปิดฟอร์ม → Apps Script → วางสคริปต์ onFormSubmit ที่ยิงมาที่ endpoint ด้านล่าง (มีตัวอย่างในคู่มือ)</li>
              <li><b>Microsoft Forms / Typeform / Jotform:</b> ใช้ Power Automate / Zapier / Make เชื่อม &ldquo;New response&rdquo; → HTTP POST มาที่ endpoint</li>
              <li>ตั้งค่า secret ของช่องทาง <code>survey</code> ที่เมนู <b>จัดการระบบ → ตั้งค่า API</b></li>
            </ol>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 4 }}>Endpoint กลาง:</div>
            <code style={{ display: 'block', background: 'var(--hover,#f1f5f9)', borderRadius: 8, padding: '8px 10px', fontSize: 12, wordBreak: 'break-all', marginBottom: 10 }}>{fnBase}</code>
            <Link className="btn" href="/admin">ไปตั้งค่า API ช่องทาง →</Link>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>* ดูสคริปต์และวิธีเชื่อมทีละขั้นในไฟล์ <b>เชื่อมต่อ_API_ช่องทาง.md</b> · หรือส่งออกคำตอบเป็นไฟล์แล้วใช้แท็บ &ldquo;อัปโหลดไฟล์&rdquo; ก็ได้</div>
          </div>
        )}

        {/* ฐานข้อมูล / ระบบภายใน */}
        {method === 'db' && (
          <div className="card">
            <h3>🗄️ เชื่อมฐานข้อมูล / ระบบภายในองค์กร</h3>
            <p style={{ fontSize: 13.5, lineHeight: 1.8 }}>
              ระบบภายใน (Call Center, ระบบร้องเรียน, ฐานข้อมูลลูกค้า ฯลฯ) ให้ทีม IT ส่งข้อมูลเข้าระบบได้ 2 แบบ:
            </p>
            <ol style={{ fontSize: 13, lineHeight: 2, paddingLeft: 20 }}>
              <li><b>ยิง API เป็นรอบ/เรียลไทม์:</b> ให้ระบบต้นทางส่ง <code>POST</code> มาที่ endpoint พร้อม header <code>x-voc-secret</code> ของช่องทางนั้น</li>
              <li><b>ส่งออกไฟล์เป็นงวด:</b> export เป็น CSV/Excel แล้วนำเข้าที่แท็บ &ldquo;อัปโหลดไฟล์&rdquo; (เหมาะกับข้อมูลย้อนหลัง)</li>
            </ol>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 4 }}>รูปแบบข้อมูลที่ส่ง (JSON):</div>
            <code style={{ display: 'block', background: 'var(--hover,#f1f5f9)', borderRadius: 8, padding: '8px 10px', fontSize: 12, whiteSpace: 'pre-wrap', marginBottom: 10 }}>{`POST ${fnBase}
Header: x-voc-secret: <secret ของช่องทาง>
Body: { "channel_id": "call", "text": "ข้อความลูกค้า",
        "source": "Call Center 1615", "occurred_at": "2026-07-20" }`}</code>
            <Link className="btn" href="/admin">ไปตั้งค่า API ช่องทาง →</Link>
          </div>
        )}

        {/* API / Webhook เรียลไทม์ */}
        {method === 'api' && (
          <div className="card">
            <h3>🔌 API / Webhook (รับข้อมูลเรียลไทม์)</h3>
            <p style={{ fontSize: 13.5, lineHeight: 1.8 }}>
              รับเสียงลูกค้าทันทีที่เกิดขึ้น จากช่องทางที่มี API เช่น <b>LINE OA</b> (ส่ง webhook มาตรงได้เลย), <b>Facebook</b>, อีเมล หรือระบบอื่น ๆ
            </p>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 4 }}>Endpoint กลาง (ทุกช่องทางใช้ URL เดียวกัน แยกด้วย channel_id + secret):</div>
            <code style={{ display: 'block', background: 'var(--hover,#f1f5f9)', borderRadius: 8, padding: '8px 10px', fontSize: 12, wordBreak: 'break-all', marginBottom: 10 }}>{fnBase}</code>
            <ul style={{ fontSize: 13, lineHeight: 2, paddingLeft: 20 }}>
              <li><b>LINE OA:</b> ใส่ Webhook URL นี้ใน LINE Developers → ระบบอ่านรูปแบบ LINE ได้ในตัว (channel_id = social)</li>
              <li><b>Facebook / อื่น ๆ:</b> ผ่านตัวกลาง (n8n / Make / Zapier) แนบ header <code>x-voc-secret</code> แล้วส่งต่อ</li>
              <li>เปิดใช้งาน + สุ่ม secret รายช่องทางที่เมนู <b>จัดการระบบ → ตั้งค่า API</b></li>
            </ul>
            <Link className="btn" href="/admin">ไปตั้งค่า API ช่องทาง →</Link>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>* ต้องสร้าง Edge Function <code>ingest-voc</code> ใน Supabase ก่อน (ดู <b>เชื่อมต่อ_API_ช่องทาง.md</b>)</div>
          </div>
        )}
        </>
        )}
      </div>
    </>
  );
}
