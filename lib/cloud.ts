// lib/cloud.ts — Word Cloud: นับคำเด่นจาก "ข้อความจริง"
//
// เดิมใช้รายการคำตายตัว 38 คำ → คำที่ลูกค้าพูดจริงแต่ไม่อยู่ในรายการจะไม่ขึ้นเลย
// (เช่น ลิฟต์ · น้ำท่วม · แอร์ · ทางเท้า) ทำให้พลาดประเด็นใหม่ที่ไม่เคยคาดไว้
//
// ตอนนี้ตัดคำภาษาไทยจริงด้วย Intl.Segmenter (ICU dictionary — มีในเบราว์เซอร์สมัยใหม่ทุกตัว)
// แล้วรวมคำคู่ที่มักอยู่ติดกันเป็นคำเดียว (น้ำ+ท่วม → น้ำท่วม · ประทับ+ใจ → ประทับใจ)
// ถ้าเบราว์เซอร์เก่าไม่มี Segmenter จะถอยไปใช้รายการคำเดิมโดยอัตโนมัติ
import type { Voc } from './data';

// คำสำคัญที่รู้จัก — ใช้เป็นตัวช่วยรวมคำ และเป็นตัวสำรองเมื่อไม่มี Intl.Segmenter
export const VOC_VOCAB = [
  'ระบบจองออนไลน์', 'โอนกรรมสิทธิ์', 'ค่าส่วนกลาง', 'เจ้าหน้าที่', 'สาธารณูปโภค',
  'จอง', 'คิว', 'ซ่อม', 'ประปา', 'ไฟ', 'ส่วนกลาง', 'สะอาด', 'สกปรก',
  'บริการ', 'ประทับใจ', 'สุภาพ', 'เช่าซื้อ', 'สัญญา', 'เอกสาร',
  'ผ่อน', 'ค่าเช่า', 'ชำระ', 'สินเชื่อ', 'ดอกเบี้ย', 'วงเงิน', 'ทำเล', 'เดินทาง', 'รถไฟฟ้า',
  'โปรโมชั่น', 'ส่วนลด', 'แคมเปญ', 'ราคา', 'เว็บไซต์', 'อัปเดต', 'ขัดข้อง', 'ล่าช้า', 'ติดตาม',
  'จอดรถ', 'มืด', 'ปลอดภัย', 'ลิฟต์', 'ขยะ', 'น้ำท่วม', 'แอร์', 'รั่ว', 'ชำรุด',
];

// คำหยุด — คำเชื่อม/สรรพนาม/คำช่วย ที่พบบ่อยแต่ไม่บอกประเด็น
const STOP = new Set([
  'และ', 'หรือ', 'แต่', 'ที่', 'ซึ่ง', 'ของ', 'ให้', 'ได้', 'ไม่', 'ไม่ได้', 'เป็น', 'อยู่', 'คือ', 'มี', 'จะ',
  'ก็', 'ว่า', 'กับ', 'จาก', 'ใน', 'บน', 'ถึง', 'ๆ', 'มาก', 'ครับ', 'ค่ะ', 'คะ', 'นะ', 'ด้วย', 'แล้ว',
  'ผม', 'ดิฉัน', 'ฉัน', 'เรา', 'ท่าน', 'เขา', 'มัน', 'นี้', 'นั้น', 'ทาง', 'การ', 'ความ', 'อย่าง', 'อัน',
  'ต้อง', 'ควร', 'อยาก', 'เลย', 'ยัง', 'กว่า', 'ทุก', 'บาง', 'หลาย', 'มา', 'ไป', 'ทำ', 'ให้ได้',
  'เมื่อ', 'ถ้า', 'เพราะ', 'จึง', 'ตาม', 'เอง', 'ขอ', 'ช่วย', 'รบกวน', 'หน่อย', 'เท่า', 'ที', 'ไร',
  'ดี', 'ใจ', 'คน', 'วัน', 'ครั้ง', 'เรื่อง', 'ตัว', 'อีก', 'พอ', 'ทั้ง', 'ต่อ', 'ทำไม', 'อะไร', 'ไหม',
]);

const MIN_HITS = 2;     // ต้องปรากฏในอย่างน้อยกี่ "เสียง" จึงนับเป็นคำเด่น
const MAX_WORDS = 40;   // จำนวนคำสูงสุดใน cloud
const MIN_CHARS = 2;    // ความยาวคำต่ำสุด

type Seg = { segment: string; isWordLike?: boolean };
type SegmenterLike = { segment: (s: string) => Iterable<Seg> };

let segmenter: SegmenterLike | null | undefined;
function getSegmenter(): SegmenterLike | null {
  if (segmenter !== undefined) return segmenter;
  try {
    const I = Intl as unknown as { Segmenter?: new (loc: string, o: object) => SegmenterLike };
    segmenter = I.Segmenter ? new I.Segmenter('th', { granularity: 'word' }) : null;
  } catch { segmenter = null; }
  return segmenter;
}

/**
 * ตัดข้อความเป็นรายการคำ พร้อมบอกว่าคำนั้น "ติดกับคำก่อนหน้าโดยตรง" หรือไม่
 * adj = false เมื่อมีช่องว่าง/เครื่องหมาย/คำหยุดคั่น — ใช้กันไม่ให้รวมคำคู่ข้ามขอบประโยค
 * (ไม่งั้นจะได้คำประหลาดอย่าง "ประทับชื่นชม" จากท้ายประโยคหนึ่งต่อหัวอีกประโยค)
 */
function tokenize(text: string, seg: SegmenterLike): { w: string; adj: boolean }[] {
  const out: { w: string; adj: boolean }[] = [];
  let broken = true;
  for (const s of seg.segment(text)) {
    const raw = s.segment;
    if (s.isWordLike === false || /^[\d\s\p{P}]+$/u.test(raw)) { broken = true; continue; }
    const w = raw.trim();
    if (w.length < MIN_CHARS || STOP.has(w)) { broken = true; continue; }
    out.push({ w, adj: !broken });
    broken = false;
  }
  return out;
}

/**
 * นับคำเด่นจากเสียงลูกค้า
 * นับเป็น "จำนวนเสียงที่มีคำนั้น" (ไม่ใช่จำนวนครั้งที่ปรากฏ)
 * เพื่อไม่ให้ข้อความยาว ๆ ข้อความเดียวครอบงำ cloud
 */
export function computeCloud(rows: Voc[]): [string, number][] {
  const texts = rows.map(r => ((r.voice || '') + ' ' + (r.topic || '')).trim()).filter(Boolean);
  if (!texts.length) return [];

  const seg = getSegmenter();
  // ---- เบราว์เซอร์เก่าไม่มีตัวตัดคำ → ถอยไปใช้รายการคำที่รู้จัก ----
  if (!seg) {
    return VOC_VOCAB
      .map(w => [w, texts.filter(t => t.includes(w)).length] as [string, number])
      .filter(p => p[1] > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_WORDS);
  }

  const uni = new Map<string, Set<number>>();   // คำเดี่ยว → เซ็ตของเสียงที่พบ
  const bi = new Map<string, Set<number>>();    // คำคู่ติดกัน → เซ็ตของเสียงที่พบ
  const add = (m: Map<string, Set<number>>, w: string, idx: number) => {
    let s = m.get(w); if (!s) { s = new Set(); m.set(w, s); }
    s.add(idx);
  };

  const pairParts = new Map<string, [string, string]>();   // คำคู่ → คำย่อย 2 ตัว
  texts.forEach((t, idx) => {
    const ws = tokenize(t, seg);
    ws.forEach((cur, i) => {
      add(uni, cur.w, idx);
      const next = ws[i + 1];
      if (!next || !next.adj) return;                      // มีอะไรคั่น = ไม่ใช่คำประสม
      const pair = cur.w + next.w;
      if (pair.length > 14) return;
      add(bi, pair, idx);
      pairParts.set(pair, [cur.w, next.w]);
    });
  });

  const hits = (m: Map<string, Set<number>>, w: string) => m.get(w)?.size || 0;
  const known = new Set(VOC_VOCAB);

  // เก็บคำคู่ที่ "อยู่ติดกันแทบทุกครั้ง" → ถือเป็นคำเดียว
  // เลือกแบบ greedy จากคำคู่ที่พบบ่อยที่สุดก่อน และห้ามใช้คำย่อยซ้ำ
  // (ไม่งั้นจะได้ทั้ง "น้ำท่วม" และ "ท่วมขัง" ซ้อนกัน)
  const merged = new Map<string, number>();
  const consumed = new Set<string>();
  Array.from(bi.entries())
    .map(([pair, s]) => [pair, s.size] as [string, number])
    .filter(([, n]) => n >= MIN_HITS)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .forEach(([pair, n]) => {
      const parts = pairParts.get(pair);
      if (!parts) return;
      const [a, b] = parts;
      if (consumed.has(a) || consumed.has(b)) return;       // คำย่อยถูกใช้ไปแล้ว
      const na = hits(uni, a), nb = hits(uni, b);
      // รวมเมื่อเป็นคำที่รู้จัก หรือทั้งสองคำแทบไม่เคยปรากฏแยกกัน
      if (known.has(pair) || (n >= na * 0.7 && n >= nb * 0.7)) {
        merged.set(pair, n);
        consumed.add(a); consumed.add(b);
      }
    });

  const single = Array.from(uni.entries())
    .map(([w, s]) => [w, s.size] as [string, number])
    .filter(([w, n]) => n >= MIN_HITS && !consumed.has(w));

  // ยืดคำให้เต็มด้วยคำที่รู้จัก — "ประทับ" → "ประทับใจ" (เพราะ "ใจ" ถูกตัดเป็นคำหยุด)
  const result = new Map<string, number>([...merged.entries(), ...single]);
  VOC_VOCAB.filter(v => v.length >= 4).forEach(v => {
    const nv = texts.filter(t => t.includes(v)).length;
    if (nv < MIN_HITS) return;
    let replaced = false;
    Array.from(result.keys()).forEach(w => {
      if (w !== v && v.includes(w) && result.get(w)! <= nv * 1.2) { result.delete(w); replaced = true; }
    });
    if (replaced || result.has(v)) result.set(v, nv);
  });

  return Array.from(result.entries())
    .filter(([w]) => !STOP.has(w))
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, MAX_WORDS);
}
