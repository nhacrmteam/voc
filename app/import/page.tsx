'use client';
// นำเข้าข้อมูล — อัปโหลดไฟล์ CSV เข้าตาราง voc_record (แอดมิน/ผู้ปฏิบัติงาน)
// หลักการ: แยก "วันที่เกิดเรื่อง (ต้นทาง)" ที่มากับไฟล์ ออกจาก "วันที่นำเข้าระบบ" (บันทึกอัตโนมัติ = วันนี้)
// รองรับ .csv และ .xlsx โดยตรง — หาแถวหัวตารางเองใน 10 แถวแรก + รับชื่อคอลัมน์หลายแบบ + แปลงวันที่ พ.ศ./d-m-Y ให้อัตโนมัติ
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { analyzeText, analyzeSmartBatch, applyScoreHint, SmartResult } from '../../lib/ai';

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

// ---------- ปีงบประมาณ: ช่วงวันที่ของไตรมาสปัจจุบัน (ใช้เป็นค่าเริ่มต้นตอนไฟล์ไม่มีคอลัมน์วันที่) ----------
function currentFYRange(): { from: string; to: string; label: string } {
  const d = new Date(); const y = d.getFullYear(), mo = d.getMonth();   // 0=ม.ค. … 9=ต.ค.
  const be = (mo >= 9 ? y + 1 : y) + 543;
  const s = be - 543 - 1, e = be - 543;
  const Q: Record<string, [string, string, string]> = {
    q1: [s + '-10-01', s + '-12-31', 'ไตรมาส 1 (ต.ค.–ธ.ค.)'],
    q2: [e + '-01-01', e + '-03-31', 'ไตรมาส 2 (ม.ค.–มี.ค.)'],
    q3: [e + '-04-01', e + '-06-30', 'ไตรมาส 3 (เม.ย.–มิ.ย.)'],
    q4: [e + '-07-01', e + '-09-30', 'ไตรมาส 4 (ก.ค.–ก.ย.)'],
  };
  const q = mo >= 9 ? 'q1' : mo <= 2 ? 'q2' : mo <= 5 ? 'q3' : 'q4';
  const [from, to, qLabel] = Q[q];
  const today = new Date().toISOString().slice(0, 10);
  return { from, to: to > today ? today : to, label: 'ปีงบ ' + be + ' · ' + qLabel };   // ไม่ให้เกินวันนี้
}

// ---------- กระจายวันที่เท่า ๆ กันในช่วง from…to สำหรับ n แถว ----------
function spreadDates(from: string, to: string, n: number): string[] {
  const a = Date.parse(from + 'T00:00:00Z'), b = Date.parse(to + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b) || n <= 0) return Array(Math.max(n, 0)).fill(from);
  const lo = Math.min(a, b), hi = Math.max(a, b);
  if (n === 1) return [new Date(lo).toISOString().slice(0, 10)];
  return Array.from({ length: n }, (_, i) =>
    new Date(lo + Math.round((hi - lo) * i / (n - 1))).toISOString().slice(0, 10));
}

// ============================================================
// ตรวจจับชนิดคอลัมน์จาก "เนื้อหาจริง" ไม่ใช่แค่ชื่อหัวคอลัมน์
// เพราะ 8 ช่องทางใช้ฟอร์มคนละแบบ หัวคอลัมน์ไม่มีทางตรงกัน
// ============================================================
type ColKind = 'text' | 'score' | 'date' | 'choice' | 'number' | 'empty';
const KIND_TH: Record<ColKind, string> = {
  text: 'ข้อความบรรยาย', score: 'คะแนน/ระดับ', date: 'วันที่', choice: 'ตัวเลือก', number: 'ตัวเลข', empty: 'ว่าง',
};
interface ColInfo {
  i: number; name: string; kind: ColKind;
  fill: number;        // สัดส่วนแถวที่มีข้อมูล 0..1
  avgLen: number;      // ความยาวเฉลี่ย
  uniqRatio: number;   // ความหลากหลาย (ค่าไม่ซ้ำ / ค่าที่กรอก)
  rank: number;        // คะแนน "น่าจะเป็นข้อความเสียงลูกค้า"
  sample: string;
  scoreMax?: number;   // ถ้าเป็นคะแนนตัวเลข: ค่าสูงสุดที่พบ (ใช้ normalize)
}

// คำระดับความพึงพอใจแบบไทย → คะแนน 0..1 (เรียงยาวก่อนสั้น เพื่อให้ "มากที่สุด" ชนะ "มาก")
const SCORE_WORDS: [string, number][] = ([
  ['มากที่สุด', 1], ['พอใจมากที่สุด', 1], ['ดีมาก', 1], ['ดีเยี่ยม', 1], ['ประทับใจมาก', 1],
  ['พอใจมาก', 0.85], ['มาก', 0.75], ['ดี', 0.75], ['พอใจ', 0.75],
  ['ปานกลาง', 0.5], ['พอใช้', 0.5], ['เฉย', 0.5], ['ปกติ', 0.5],
  ['น้อยที่สุด', 0], ['ไม่พอใจอย่างยิ่ง', 0], ['แย่มาก', 0], ['ไม่พอใจมาก', 0],
  ['ไม่พอใจ', 0.2], ['น้อย', 0.25], ['แย่', 0.25], ['ควรปรับปรุง', 0.25],
] as [string, number][]).sort((a, b) => b[0].length - a[0].length);
function wordScore(v: string): number | null {
  const t = (v || '').trim();
  if (!t || t.length > 25) return null;
  for (const [w, s] of SCORE_WORDS) if (t.includes(w)) return s;
  return null;
}
// ระวัง: Date.parse('1') = ปี 2001 → ตัวเลขเดี่ยว/คะแนนจะถูกมองเป็นวันที่ผิด ๆ
// จึงบังคับให้ต้องมี "ตัวคั่นวันที่" หรือ "ชื่อเดือน" จริง ๆ เท่านั้น
const looksDate = (v: string) => {
  const t = (v || '').trim();
  if (t.length < 6 || t.length > 30) return false;
  if (/^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/.test(t)) return true;                 // 2026-07-10 · 10/07/2569
  if (/[A-Za-z]{3,}/.test(t) && !isNaN(Date.parse(t))) return true;            // 19 Aug 2026
  return /(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)/.test(t);
};

// ชื่อหัวคอลัมน์ช่วยตัดสินว่าตัวเลขนั้นเป็น "คะแนน" หรือแค่ "ตัวเลขทั่วไป"
const SCORE_NAME = /(พึงพอใจ|ความพอใจ|คะแนน|ระดับ|ประเมิน|satisf|rating|score)/i;
const ID_NAME = /(ลำดับ|เลขที่|รหัส|^\s*no\.?\s*$|^\s*id\s*$)/i;
const QTY_NAME = /(จำนวน|อายุ|รายได้|ค่าใช้จ่าย|บุตร|ชั้น|ห้อง|ปี\b|เดือน|บาท)/;

function profileColumns(grid: string[][], headRow: number): ColInfo[] {
  const head = grid[headRow] || [];
  const body = grid.slice(headRow + 1);
  const width = grid.reduce((m, r) => Math.max(m, r.length), 0);

  return Array.from({ length: width }, (_, i) => {
    const vals = body.map(r => (r[i] ?? '').trim());
    const nz = vals.filter(v => v !== '');
    const fill = body.length ? nz.length / body.length : 0;
    const avgLen = nz.length ? nz.reduce((a, v) => a + v.length, 0) / nz.length : 0;
    const uniq = new Set(nz).size;
    const uniqRatio = nz.length ? uniq / nz.length : 0;
    const nums = nz.map(v => Number(v.replace(/,/g, ''))).filter(n => !isNaN(n));
    const numRatio = nz.length ? nums.length / nz.length : 0;
    const dateRatio = nz.length ? nz.filter(looksDate).length / nz.length : 0;
    const wordRatio = nz.length ? nz.filter(v => wordScore(v) !== null).length / nz.length : 0;
    // จำนวนคำเฉลี่ย — ใช้แยก "ข้อความบรรยาย" ออกจาก "ชื่อโครงการ/ชื่อจังหวัด" ที่ยาวแต่เป็นคำนามสั้น ๆ
    const avgWords = nz.length ? nz.reduce((a, v) => a + v.split(/\s+/).filter(Boolean).length, 0) / nz.length : 0;
    const hName = (head[i] || '').trim();
    // เลขลำดับ/เลขที่ใบ (1,2,3,…) ต้องไม่ถูกนับเป็นคะแนน ไม่งั้นค่าเฉลี่ยเพี้ยนทั้งไฟล์
    const isSeq = nums.length === nz.length && nums.length >= 4 && nums.every((n, k) => n === nums[0] + k);

    let kind: ColKind = 'empty';
    let scoreMax: number | undefined;
    if (!nz.length) kind = 'empty';
    else if (dateRatio > 0.7) kind = 'date';
    else if (wordRatio > 0.7 && uniq <= 8) kind = 'score';   // มากที่สุด/มาก/ปานกลาง/น้อย…
    else if (
      numRatio > 0.9 && !isSeq && !ID_NAME.test(hName) && !QTY_NAME.test(hName) &&
      uniq <= 11 && Math.max(...nums) <= 10 && Math.min(...nums) >= 0 &&
      (SCORE_NAME.test(hName) || uniqRatio < 0.5)               // ชื่อบ่งชี้ว่าเป็นคะแนน หรือค่าซ้ำกันมาก
    ) { kind = 'score'; scoreMax = Math.max(...nums) || 5; }
    else if (numRatio > 0.9) kind = 'number';
    // ข้อความบรรยาย = ยาวพอ + ไม่ซ้ำเดิม ๆ + (หลายคำ หรือ ยาวมากพอแบบภาษาไทยที่ไม่เว้นวรรค)
    else if (avgLen >= 15 && uniqRatio > 0.5 && (avgWords >= 3.5 || avgLen >= 30)) kind = 'text';
    else kind = 'choice';

    // คะแนน "น่าจะเป็นข้อความเสียงลูกค้า": ยาว + หลากหลาย + มีคนกรอกจริง
    const rank = kind === 'text' ? Math.min(avgLen, 200) * uniqRatio * Math.max(fill, 0.15) : 0;
    return { i, name: (head[i] || '').trim(), kind, fill, avgLen, uniqRatio, rank, sample: nz[0] || '', scoreMax };
  });
}

// ---------- จำการจับคู่คอลัมน์ต่อช่องทาง (ไฟล์รอบหน้าของแหล่งเดิมจับคู่ให้เอง) ----------
// เก็บเป็น "ชื่อหัวคอลัมน์" ไม่ใช่ตำแหน่ง — สลับลำดับคอลัมน์แล้วยังจำได้
interface SavedMap { text: string[]; score: string[]; date: string; topic: string; src: string; prod: string; jr: string }
const MAP_KEY = 'voc-colmap-';
function loadSavedMap(chId: string): SavedMap | null {
  try { const s = localStorage.getItem(MAP_KEY + chId); return s ? JSON.parse(s) as SavedMap : null; } catch { return null; }
}
function saveMap(chId: string, m: SavedMap) {
  try { localStorage.setItem(MAP_KEY + chId, JSON.stringify(m)); } catch { /* โหมดส่วนตัว/พื้นที่เต็ม — ข้าม */ }
}
const nameOf = (cols: ColInfo[], i: number) => (i >= 0 ? (cols[i]?.name || '') : '');
const idxOfName = (cols: ColInfo[], name: string) =>
  name ? cols.findIndex(c => c.name && c.name === name) : -1;

// ค่าคะแนนของเซลล์ → 0..1
function cellScore(v: string, info: ColInfo): number | null {
  const t = (v || '').trim();
  if (!t) return null;
  const w = wordScore(t);
  if (w !== null) return w;
  const n = Number(t.replace(/,/g, ''));
  if (!isNaN(n) && info.scoreMax) {
    if (info.scoreMax <= 1) return Math.max(0, Math.min(1, n));
    return Math.max(0, Math.min(1, (n - 1) / (info.scoreMax - 1)));   // 1..max → 0..1
  }
  return null;
}

interface ColMap { date: number; topic: number; src: number; prod: number; jr: number }
interface Parsed { occurred: string; topic: string; text: string; source: string; product: string; journey: string; score: number | null; err: string }

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
  // ตารางดิบจากไฟล์ + การจับคู่คอลัมน์ (ผู้ใช้แก้เองได้) + ช่วงวันที่กรณีไฟล์ไม่มีคอลัมน์วันที่
  const [grid, setGrid] = useState<string[][]>([]);
  const [headRow, setHeadRow] = useState(0);
  const [cols, setCols] = useState<ColInfo[]>([]);          // ผลตรวจจับชนิดคอลัมน์
  const [textCols, setTextCols] = useState<number[]>([]);   // คอลัมน์ข้อความ (เลือกได้หลายช่อง → แยกเป็นหลายเสียง)
  const [scoreCols, setScoreCols] = useState<number[]>([]); // คอลัมน์คะแนนความพึงพอใจ
  const [useScore, setUseScore] = useState(true);
  const [cmap, setCmap] = useState<ColMap>({ date: -1, topic: -1, src: -1, prod: -1, jr: -1 });
  const [dFrom, setDFrom] = useState('');
  const [dTo, setDTo] = useState('');
  const [fyLabel, setFyLabel] = useState('');
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

  // ค่าเริ่มต้นช่วงวันที่ = ไตรมาสปัจจุบันของปีงบประมาณ (คำนวณฝั่ง client กัน hydration mismatch)
  useEffect(() => {
    const r = currentFYRange();
    setDFrom(r.from); setDTo(r.to); setFyLabel(r.label);
  }, []);

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
    setMsg(''); setErr(''); setRows([]); setGrid([]);
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

  // อ่านไฟล์เสร็จ → เดาแถวหัวตาราง + จับคู่คอลัมน์ให้อัตโนมัติ (ผู้ใช้แก้เองได้ในการ์ด "จับคู่คอลัมน์")
  function handleGrid(g: string[][]) {
    if (g.length < 2) { setErr('ไฟล์ว่างหรือไม่มีข้อมูล (ต้องมีหัวตาราง + อย่างน้อย 1 แถว)'); setGrid([]); return; }

    let hr = 0, best = -1;
    for (let i = 0; i < Math.min(g.length, 10); i++) {
      const t = findCol(g[i], HKEY.text);
      const d = findCol(g[i], HKEY.date);
      // ให้น้ำหนัก: เจอคอลัมน์ข้อความ 3 · เจอวันที่ 2 · จำนวนช่องที่ไม่ว่าง (หัวตารางมักเต็มแถว)
      const score = (t >= 0 ? 3 : 0) + (d >= 0 ? 2 : 0) + Math.min(g[i].filter(Boolean).length, 10) / 100;
      if (score > best) { best = score; hr = i; }
    }
    const head = g[hr];
    const info = profileColumns(g, hr);
    setGrid(g); setHeadRow(hr); setCols(info);

    // --- คอลัมน์วันที่: เชื่อ "เนื้อหา" ก่อน ถ้าไม่มีค่อยดูชื่อหัวคอลัมน์ ---
    const byContentDate = info.filter(c => c.kind === 'date').sort((a, b) => b.fill - a.fill)[0];
    const byNameDate = findCol(head, HKEY.date);
    const iDate = byContentDate ? byContentDate.i : (info[byNameDate]?.kind === 'date' ? byNameDate : byNameDate);

    // --- คอลัมน์ข้อความ: เลือกทุกคอลัมน์ที่เป็น "ข้อความบรรยาย" จริง (เรียงตามคะแนน สูงสุด 6 ช่อง) ---
    const auto = info
      .filter(c => c.kind === 'text' && c.i !== iDate && c.avgLen >= 15 && c.fill >= 0.05)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 6)
      .map(c => c.i)
      .sort((a, b) => a - b);
    // เผื่อไฟล์เทมเพลตปกติที่ข้อความสั้น — ใช้ชื่อหัวคอลัมน์ช่วย
    const byName = findCol(head, HKEY.text, iDate >= 0 ? [iDate] : []);
    const picked = auto.length ? auto : (byName >= 0 ? [byName] : []);

    const scores = info.filter(c => c.kind === 'score').map(c => c.i);
    const used = [iDate, ...picked].filter(x => x >= 0);
    setTextCols(picked);
    setScoreCols(scores);
    setCmap({
      date: iDate,
      topic: findCol(head, HKEY.topic, used),
      src: findCol(head, HKEY.src, used),
      prod: findCol(head, HKEY.prod, used),
      jr: findCol(head, HKEY.jr, used),
    });

    // ถ้าเคยจับคู่ช่องทางนี้ไว้แล้วและชื่อคอลัมน์ตรงกัน → ใช้ของเดิมทับผลตรวจจับ
    const saved = loadSavedMap(chId);
    let restored = false;
    if (saved) {
      const t = saved.text.map(n => idxOfName(info, n)).filter(x => x >= 0);
      if (t.length) {
        restored = true;
        setTextCols(t.sort((a, b) => a - b));
        setScoreCols(saved.score.map(n => idxOfName(info, n)).filter(x => x >= 0));
        setCmap({
          date: idxOfName(info, saved.date), topic: idxOfName(info, saved.topic),
          src: idxOfName(info, saved.src), prod: idxOfName(info, saved.prod), jr: idxOfName(info, saved.jr),
        });
      }
    }

    setErr('');
    setMsg(restored
      ? 'ใช้การจับคู่คอลัมน์ที่เคยบันทึกไว้ของช่องทาง "' + ch.name + '" — แก้ได้ด้านล่าง'
      : picked.length
      ? 'ตรวจจับอัตโนมัติสำเร็จ — พบคอลัมน์ข้อความ ' + picked.length + ' ช่อง' +
        (scores.length ? ' · คอลัมน์คะแนนความพึงพอใจ ' + scores.length + ' ช่อง' : '') +
        ' · ตรวจความถูกต้องด้านล่างก่อนบันทึก'
      : 'อ่านไฟล์สำเร็จ แต่ยังไม่พบคอลัมน์ที่เป็นข้อความบรรยาย — เลือกเองในการ์ดด้านล่าง');
  }

  // สร้างรายการที่จะบันทึกจาก grid + การจับคู่คอลัมน์ + ช่วงวันที่ (คำนวณใหม่ทุกครั้งที่ผู้ใช้เปลี่ยนค่า)
  useEffect(() => {
    if (!grid.length || !textCols.length) { setRows([]); return; }
    const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
    // เก็บเฉพาะแถวที่มีข้อความอย่างน้อย 1 ช่อง (ตัดแถวว่าง/แถวรวมยอดท้ายไฟล์)
    const body = grid.slice(headRow + 1).filter(r => textCols.some(c => cell(r, c) !== ''));
    // ไม่มีคอลัมน์วันที่ (เช่น แบบสอบถามกระดาษ) → กระจายวันที่เท่า ๆ กันในช่วงที่เลือก (ต่อ "ผู้ตอบ" 1 คน)
    const autoDates = cmap.date < 0 ? spreadDates(dFrom, dTo, body.length) : [];

    const out: Parsed[] = [];
    body.forEach((r, i) => {
      const prod = cell(r, cmap.prod), jr = cell(r, cmap.jr);
      const occurred = cmap.date >= 0 ? normDate(cell(r, cmap.date)) : (autoDates[i] || dFrom);
      // คะแนนความพึงพอใจของผู้ตอบคนนี้ = ค่าเฉลี่ยของทุกคอลัมน์คะแนนที่กรอกไว้
      let score: number | null = null;
      if (useScore && scoreCols.length) {
        const vs = scoreCols
          .map(c => cellScore(cell(r, c), cols[c]))
          .filter((v): v is number => v !== null);
        if (vs.length) score = vs.reduce((a, b) => a + b, 0) / vs.length;
      }
      const baseTopic = cell(r, cmap.topic);
      // แต่ละคอลัมน์ข้อความที่กรอก = 1 รายการ VOC (หัวข้อ = ชื่อคอลัมน์นั้น)
      textCols.forEach(c => {
        const text = cell(r, c);
        if (!text) return;
        const colName = (cols[c]?.name || '').trim();
        const p: Parsed = {
          occurred,
          topic: baseTopic || colName.slice(0, 120),
          text,
          source: cell(r, cmap.src),
          product: PRODUCTS.includes(prod) ? prod : '',   // ค่าที่ไม่ตรงรายการมาตรฐาน → ปล่อยว่าง
          journey: JOURNEYS.includes(jr) ? jr : '',
          score,
          err: '',
        };
        p.err = validateRow(p);
        out.push(p);
      });
    });
    setRows(out);
  }, [grid, headRow, cols, textCols, scoreCols, useScore, cmap, dFrom, dTo]);

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

  // ตัวเลือกคอลัมน์ใน dropdown จับคู่ (ใช้ชื่อจากแถวหัวตาราง ถ้าว่างใช้ "คอลัมน์ N")
  const colOptions = (() => {
    const width = grid.reduce((m, r) => Math.max(m, r.length), 0);
    const head = grid[headRow] || [];
    return Array.from({ length: width }, (_, i) => ({
      i,
      label: (i + 1) + '. ' + ((head[i] || '').trim() || '(ไม่มีชื่อ)').slice(0, 60),
    }));
  })();

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
      // เสริมด้วยคะแนนความพึงพอใจจากแบบประเมิน (ถ้ามี) — ช่วยตัดสินเมื่อข้อความสั้น/กำกวม
      ai = ai.map((a, i) => applyScoreHint(a, ok[i].score, ok[i].text));
      const scored = ok.filter(r => r.score !== null).length;
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
      // จำการจับคู่คอลัมน์ของช่องทางนี้ไว้ใช้รอบหน้า
      saveMap(chId, {
        text: textCols.map(i => nameOf(cols, i)).filter(Boolean),
        score: scoreCols.map(i => nameOf(cols, i)).filter(Boolean),
        date: nameOf(cols, cmap.date), topic: nameOf(cols, cmap.topic),
        src: nameOf(cols, cmap.src), prod: nameOf(cols, cmap.prod), jr: nameOf(cols, cmap.jr),
      });

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
        (scored ? ' · ใช้คะแนนแบบประเมินช่วยตัดสิน ' + scored + ' รายการ' : '') +
        ' — ดูได้ในเมนูรายการ VOC');
      setRows([]); setFileName(''); setGrid([]); setCols([]); setTextCols([]); setScoreCols([]);
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
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
            * รองรับ .csv และ .xlsx (อ่านแผ่นแรก) · ไม่ต้องตรงเทมเพลตก็ได้ — ขั้นถัดไปจะให้เลือกเองว่าคอลัมน์ไหนคืออะไร
          </div>
        </div>

        {/* ขั้น 3: จับคู่คอลัมน์ */}
        {grid.length > 0 && (
          <div className="card">
            <h3>3️⃣ ตรวจจับคอลัมน์อัตโนมัติ — ตรวจความถูกต้องก่อนบันทึก</h3>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
              ระบบอ่าน<b>เนื้อหาจริง</b>ในทุกคอลัมน์แล้วเดาให้ว่าอันไหนเป็นข้อความบรรยาย / คะแนน / วันที่ — ไม่ต้องพึ่งชื่อหัวคอลัมน์
              จึงรองรับฟอร์มที่ต่างกันของทั้ง 8 ช่องทางได้ · ติ๊กเพิ่ม/เอาออกได้เอง
            </div>

            {/* ตารางผลตรวจจับ + เลือกคอลัมน์ข้อความ (หลายช่องได้ → แยกเป็นหลายเสียง) */}
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
              🗣️ คอลัมน์ที่จะนำไปวิเคราะห์ ({textCols.length} ช่อง → {rows.length.toLocaleString()} รายการ)
            </div>
            <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 10, marginBottom: 12 }}>
              <table style={{ fontSize: 12 }}>
                <thead><tr>
                  <th style={{ width: 40 }}>ใช้</th><th>คอลัมน์</th><th style={{ width: 92 }}>ระบบมองเป็น</th>
                  <th style={{ width: 62 }}>กรอก</th><th style={{ width: 66 }}>ยาวเฉลี่ย</th><th>ตัวอย่าง</th>
                </tr></thead>
                <tbody>{cols.filter(c => c.kind !== 'empty').map(c => {
                  const on = textCols.includes(c.i);
                  return (
                    <tr key={c.i} style={on ? { background: 'rgba(46,108,240,.07)' } : undefined}>
                      <td>
                        <input type="checkbox" checked={on} onChange={() =>
                          setTextCols(v => (on ? v.filter(x => x !== c.i) : [...v, c.i].sort((a, b) => a - b)))} />
                      </td>
                      <td>{(c.i + 1)}. {c.name || <i style={{ color: 'var(--muted)' }}>(ไม่มีชื่อ)</i>}</td>
                      <td><span style={{
                        fontSize: 11, padding: '1px 7px', borderRadius: 20,
                        background: c.kind === 'text' ? '#dbeafe' : c.kind === 'score' ? '#fef3c7' : c.kind === 'date' ? '#dcfce7' : '#f1f5f9',
                        color: '#334155',
                      }}>{KIND_TH[c.kind]}</span></td>
                      <td>{Math.round(c.fill * 100)}%</td>
                      <td>{Math.round(c.avgLen)}</td>
                      <td style={{ color: 'var(--muted)' }}>{c.sample.slice(0, 60)}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }}>
              <label style={{ fontSize: 12.5 }}>
                <div style={{ marginBottom: 4, color: 'var(--muted)' }}>แถวหัวตาราง</div>
                <select style={{ ...inp, width: '100%' }} value={headRow} onChange={e => setHeadRow(+e.target.value)}>
                  {grid.slice(0, 10).map((r, i) => (
                    <option key={i} value={i}>แถวที่ {i + 1} — {r.filter(Boolean).slice(0, 3).join(' / ').slice(0, 45) || '(ว่าง)'}</option>
                  ))}
                </select>
              </label>

              {([
                ['date', 'วันที่เกิดเรื่อง'],
                ['topic', 'หัวข้อ/ประเด็น'],
                ['src', 'แหล่งที่มา'],
                ['prod', 'กลุ่มผลิตภัณฑ์'],
                ['jr', 'Journey'],
              ] as const).map(([k, label]) => (
                <label key={k} style={{ fontSize: 12.5 }}>
                  <div style={{ marginBottom: 4, color: 'var(--muted)' }}>{label}</div>
                  <select style={{ ...inp, width: '100%' }} value={cmap[k]}
                    onChange={e => setCmap(m => ({ ...m, [k]: +e.target.value }))}>
                    <option value={-1}>{k === 'date' ? '— ไม่มีในไฟล์ (ให้ระบบเติมให้) —' : '— ไม่ใช้ —'}</option>
                    {colOptions.map(o => <option key={o.i} value={o.i}>{o.label}</option>)}
                  </select>
                </label>
              ))}
            </div>

            {/* คะแนนความพึงพอใจ → ช่วยตัดสิน sentiment */}
            {scoreCols.length > 0 && (
              <div style={{ marginTop: 14, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '11px 13px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                  <input type="checkbox" checked={useScore} onChange={e => setUseScore(e.target.checked)} />
                  ⭐ ใช้คะแนนความพึงพอใจ {scoreCols.length} คอลัมน์ ช่วยตัดสิน Sentiment
                </label>
                <div style={{ fontSize: 11.5, color: '#92400e', marginTop: 7, lineHeight: 1.75 }}>
                  คอลัมน์: {scoreCols.map(i => (cols[i]?.name || 'คอลัมน์ ' + (i + 1)).slice(0, 28)).join(' · ')}<br />
                  คะแนนสูง → เชิงบวก · คะแนนต่ำ → เชิงลบ · ใช้เมื่อข้อความสั้นหรือกำกวม ถ้าข้อความชัดเจนแต่ขัดกับคะแนน
                  ระบบจะส่งเข้าคิวให้เจ้าหน้าที่ยืนยันแทน
                </div>
              </div>
            )}

            {/* ไม่มีคอลัมน์วันที่ → ให้ระบุช่วงแล้วกระจายเท่า ๆ กัน */}
            {cmap.date < 0 && (
              <div style={{ marginTop: 14, background: '#f1f5f9', borderRadius: 10, padding: '11px 13px' }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>
                  📅 ไฟล์ไม่มีวันที่ — ระบบจะกระจายวันที่เท่า ๆ กันในช่วงที่กำหนด
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5 }}>
                  <label>ตั้งแต่ <input type="date" style={{ ...inp, padding: '6px 9px' }} value={dFrom} onChange={e => setDFrom(e.target.value)} /></label>
                  <label>ถึง <input type="date" style={{ ...inp, padding: '6px 9px' }} value={dTo} onChange={e => setDTo(e.target.value)} /></label>
                  <button className="btn" type="button" style={{ padding: '6px 12px', fontSize: 12 }}
                    onClick={() => { const r = currentFYRange(); setDFrom(r.from); setDTo(r.to); }}>
                    ↺ ใช้ไตรมาสปัจจุบัน
                  </button>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>
                  ค่าเริ่มต้น = {fyLabel || 'ไตรมาสปัจจุบันของปีงบประมาณ'} (ไม่เกินวันนี้) · แก้วันรายแถวได้อีกในตารางด้านล่าง
                </div>
              </div>
            )}

            {!textCols.length && (
              <div style={{ fontSize: 12.5, color: '#b91c1c', marginTop: 12 }}>
                ⚠ ติ๊กเลือกอย่างน้อย 1 คอลัมน์ในตารางด้านบน จึงจะแสดงตารางตรวจสอบและบันทึกได้
              </div>
            )}

            {textCols.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12, lineHeight: 1.8 }}>
                ตัวอย่างที่จะบันทึก (3 รายการแรก):
                {rows.slice(0, 3).map((r, i) => (
                  <div key={i}>• <b>{r.topic.slice(0, 40) || '(ไม่มีหัวข้อ)'}</b> — {r.text.slice(0, 90)}
                    {r.score !== null && <span style={{ color: '#92400e' }}> · คะแนน {Math.round(r.score * 100)}%</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ขั้น 4: พรีวิว + บันทึก */}
        {rows.length > 0 && (
          <div className="card">
            <h3>4️⃣ ตรวจสอบ/แก้ไขก่อนบันทึก — ผ่าน <b style={{ color: 'var(--green)' }}>{ok.length}</b> / มีปัญหา <b style={{ color: 'var(--red)' }}>{bad.length}</b></h3>
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
