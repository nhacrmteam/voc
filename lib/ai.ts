// lib/ai.ts — เครื่องมือวิเคราะห์แบบ rule/keyword (พอร์ตจาก prototype)
// หมายเหตุ: ขั้นถัดไปสามารถแทนที่ด้วย Thai NLP (WangchanBERTa/PyThaiNLP) หรือ LLM ได้
// โดยคงโครงผลลัพธ์ (AiResult) เดิม — human-in-the-loop: เจ้าหน้าที่ยืนยัน/แก้ไขได้เสมอ
import type { Sentiment, Priority } from './data';

const POS = ['ประทับใจ', 'ชื่นชม', 'ขอบคุณ', 'ดีมาก', 'พอใจ', 'สุภาพ', 'ชัดเจน', 'รวดเร็ว', 'สะดวก', 'ยอดเยี่ยม', 'แนะนำ'];
const NEG = ['ไม่เพียงพอ', 'ไม่สะดวก', 'ไม่', 'สกปรก', 'ดับ', 'ล่าช้า', 'ช้า', 'ค้าง', 'ขัดข้อง', 'รั่ว', 'อ่อน', 'มืด', 'ชำรุด', 'เด้งออก', 'แย่', 'เสีย', 'ปัญหา', 'ผิดหวัง', 'ร้องเรียน', 'ยกเลิก'];
const INTENS = ['มาก', 'สุด', 'เกินไป', 'ตลอด', 'หลายวัน', 'ด่วน'];

export interface AiSent { sentiment: Sentiment; conf: number; uncertain: boolean; reason: string }

export function aiSentiment(text: string): AiSent {
  const t = (text || '').toLowerCase();
  const hp = POS.filter(k => t.includes(k));
  const hn = NEG.filter(k => t.includes(k));
  const pos = hp.length, neg = hn.length, total = pos + neg;
  const intens = INTENS.some(k => t.includes(k)) ? 1 : 0;
  if (total === 0) return { sentiment: 'Neutral', conf: 70, uncertain: false, reason: 'ไม่พบคำบ่งชี้อารมณ์ชัดเจน — เป็นข้อความเชิงสอบถาม/ข้อเท็จจริง' };
  if (pos > 0 && neg > 0 && Math.abs(pos - neg) <= 1) {
    return {
      sentiment: pos >= neg ? 'Positive' : 'Negative', conf: 50, uncertain: true,
      reason: 'พบสัญญาณผสม (บวก: ' + hp.join(', ') + ' | ลบ: ' + hn.join(', ') + ') — AI ไม่แน่ใจทิศทาง ควรให้เจ้าหน้าที่ยืนยัน',
    };
  }
  const sentiment: Sentiment = pos > neg ? 'Positive' : 'Negative';
  return {
    sentiment, conf: Math.min(96, 62 + Math.abs(pos - neg) * 14 + intens * 4), uncertain: false,
    reason: 'สัญญาณ' + (sentiment === 'Positive' ? 'เชิงบวก' : 'เชิงลบ') + 'เด่น (พบคำ: ' + hp.concat(hn).join(', ') + ')',
  };
}

// ---------- จำแนกหมวด (มิติผลิตภัณฑ์ 8 / มิติสนับสนุนการขาย 7) ----------
export const PROD_CATS = ['ทำเลที่ตั้งโครงการ', 'คุณภาพโครงการและการก่อสร้าง', 'การซื้อ/เช่าซื้อ', 'สินเชื่อบ้าน', 'การผ่อนชำระที่อยู่อาศัย', 'ระบบจองบ้านออนไลน์', 'การจองบ้านและข้อมูลโครงการ', 'ข้อมูลอื่นๆ'];
const PROD_KW: Record<string, string[]> = {
  'ทำเลที่ตั้งโครงการ': ['ทำเล', 'ที่ตั้ง', 'เดินทาง', 'รถไฟฟ้า', 'ใกล้', 'สถานที่'],
  'คุณภาพโครงการและการก่อสร้าง': ['ซ่อม', 'ชำรุด', 'รั่ว', 'ก่อสร้าง', 'คุณภาพ', 'วัสดุ', 'ทรุด', 'ประปา', 'ไฟ', 'ส่วนกลาง', 'สะอาด', 'สกปรก', 'จอดรถ'],
  'การซื้อ/เช่าซื้อ': ['เช่าซื้อ', 'โอนกรรมสิทธิ์', 'กรรมสิทธิ์', 'ทำสัญญา', 'เช่า', 'ซื้อ'],
  'สินเชื่อบ้าน': ['สินเชื่อ', 'กู้', 'ธนาคาร', 'ดอกเบี้ย', 'วงเงิน', 'อนุมัติ'],
  'การผ่อนชำระที่อยู่อาศัย': ['ผ่อนผัน', 'ผ่อนชำระ', 'ผ่อน', 'ค่างวด', 'ค่าเช่า', 'ค้างชำระ', 'ชำระ'],
  'ระบบจองบ้านออนไลน์': ['ระบบจอง', 'จองออนไลน์', 'ระบบ', 'ออนไลน์', 'ขัดข้อง', 'เด้งออก', 'แอป'],
  'การจองบ้านและข้อมูลโครงการ': ['จอง', 'คิว', 'ข้อมูลโครงการ', 'รายละเอียดโครงการ'],
};
export const SALES_CATS = ['โปรโมชั่น/ส่งเสริมการขาย', 'สื่อ/ประชาสัมพันธ์โครงการ', 'ข้อมูลโครงการบนเว็บไซต์', 'การให้ข้อมูลโครงการ', 'ข้อมูลสินเชื่อและเงื่อนไข', 'ความสะดวกในการเข้าถึงบริการ', 'ข้อมูลอื่นๆ'];
const SALES_KW: Record<string, string[]> = {
  'โปรโมชั่น/ส่งเสริมการขาย': ['โปรโมชั่น', 'ส่วนลด', 'ของแถม', 'แคมเปญ', 'ส่งเสริมการขาย', 'ข้อเสนอ'],
  'สื่อ/ประชาสัมพันธ์โครงการ': ['โฆษณา', 'ประชาสัมพันธ์', 'สื่อ', 'เพจ', 'โพสต์', 'ป้าย', 'รีวิว'],
  'ข้อมูลโครงการบนเว็บไซต์': ['เว็บไซต์', 'หน้าเว็บ', 'บนเว็บ', 'อัปเดต'],
  'การให้ข้อมูลโครงการ': ['สอบถาม', 'ข้อมูลโครงการ', 'รายละเอียด', 'เจ้าหน้าที่', 'แนะนำ', 'ติดต่อ', 'สุภาพ'],
  'ข้อมูลสินเชื่อและเงื่อนไข': ['สินเชื่อ', 'เงื่อนไข', 'กู้', 'ดอกเบี้ย', 'ดาวน์'],
  'ความสะดวกในการเข้าถึงบริการ': ['เข้าถึง', 'สะดวก', 'ช่องทาง', 'ระบบ', 'ออนไลน์', 'คิว', 'รวดเร็ว', 'ช้า', 'ขัดข้อง', 'ล่าช้า'],
};
function classifyBy(cats: string[], kw: Record<string, string[]>, text: string): string {
  const t = (text || '').toLowerCase();
  let best = 'ข้อมูลอื่นๆ', bs = 0;
  cats.forEach(cat => {
    const arr = kw[cat]; if (!arr) return;
    const sc = arr.reduce((a, k) => a + (t.includes(k.toLowerCase()) ? 1 : 0), 0);
    if (sc > bs) { bs = sc; best = cat; }
  });
  return best;
}
export const catProd = (t: string) => classifyBy(PROD_CATS, PROD_KW, t);
export const catSal = (t: string) => classifyBy(SALES_CATS, SALES_KW, t);

// ---------- Customer Journey (6 ขั้น) ----------
// จำแนกจาก "ประเด็นในข้อความ" เป็นหลัก แล้วใช้ "ช่องทางต้นทาง" ช่วยตัดสินเมื่อกำกวม
// น้ำหนักคำ: คำที่ชี้ขั้นชัดเจน (เช่น โอนกรรมสิทธิ์) ให้ 3 · คำทั่วไป (เช่น จอง) ให้ 1
const JOURNEY_KW: [string, [string, number][]][] = [
  ['Win Back', [['ยกเลิกสัญญา', 3], ['ขอคืนเงิน', 3], ['ย้ายออก', 3], ['เลิกใช้', 3], ['ทิ้งใบจอง', 3], ['ยกเลิก', 2], ['คืนเงิน', 2], ['เปลี่ยนใจ', 2], ['กลับมาใช้', 2]]],
  ['Loyalty', [['แนะนำต่อ', 3], ['บอกต่อ', 3], ['ซื้อเพิ่ม', 3], ['ประทับใจ', 2], ['ชื่นชม', 2], ['ขอบคุณ', 1], ['พอใจมาก', 2], ['อยู่มานาน', 2]]],
  // Purchase ต้องเป็น "การกระทำจริง" ไม่ใช่แค่พูดถึง — คำอย่าง เช่าซื้อ/ดาวน์ ใช้ถามได้ทุกขั้น จึงให้น้ำหนักต่ำ
  ['Purchase', [['โอนกรรมสิทธิ์', 3], ['ทำสัญญา', 3], ['ยื่นกู้', 3], ['อนุมัติสินเชื่อ', 3], ['วางดาวน์', 3], ['นัดโอน', 3], ['ระบบจอง', 3], ['จองสิทธิ์', 3], ['ใบจอง', 3], ['จองคิว', 2], ['เช่าซื้อ', 1], ['ดาวน์', 1], ['จอง', 1], ['ซื้อ', 1]]],
  ['Service', [['แจ้งซ่อม', 3], ['ร้องเรียน', 3], ['ส่วนกลาง', 2], ['ชำรุด', 2], ['ซ่อม', 2], ['ประปา', 2], ['ค่าส่วนกลาง', 2], ['ค่าเช่า', 2], ['ค่างวด', 2], ['ผ่อนชำระ', 2], ['ค้างชำระ', 2], ['ไฟ', 1], ['ขยะ', 1], ['จอดรถ', 1], ['ลิฟต์', 2], ['บริการ', 1], ['เจ้าหน้าที่', 1]]],
  // คำที่บ่งชี้ว่า "ยังแค่ถาม" ให้น้ำหนักสูง เพื่อไม่ให้ถูก Purchase แย่งไป
  ['Consideration', [['เปรียบเทียบ', 3], ['อยากทราบ', 3], ['สอบถาม', 3], ['เงื่อนไข', 3], ['อยากรู้', 3], ['สนใจ', 2], ['ข้อมูลโครงการ', 2], ['คุณสมบัติผู้', 2], ['รายละเอียด', 1], ['ราคา', 1], ['ทำเล', 1]]],
  ['Awareness', [['เห็นโฆษณา', 3], ['ประชาสัมพันธ์', 2], ['โฆษณา', 2], ['เพิ่งรู้จัก', 3], ['เห็นเพจ', 2], ['โพสต์', 1], ['รู้จัก', 1], ['ป้าย', 1]]],
];
// ช่องทางไหน "ปกติ" อยู่ขั้นไหน — ใช้เฉพาะตอนข้อความไม่ชี้ชัด
const CHANNEL_JOURNEY: Record<string, string> = {
  social: 'Awareness',      // Facebook / Line OA — คนเพิ่งเห็นเพจ
  web: 'Consideration',     // เว็บ/อีเมล — หาข้อมูลก่อนตัดสินใจ
  sales: 'Consideration',   // ทีมรณรงค์ขาย
  hq: 'Service',
  branch: 'Service',
  call: 'Service',          // Call Center — ส่วนใหญ่คนที่อยู่อาศัยแล้ว
  complain: 'Service',      // ระบบร้องเรียน
  survey: 'Loyalty',        // แบบประเมินความพึงพอใจ — ประเมินหลังใช้บริการ
};
/**
 * จำแนกขั้น Customer Journey
 * @param text ข้อความเสียงลูกค้า (รวมหัวข้อ)
 * @param channel รหัสช่องทางต้นทาง — ใช้ช่วยตัดสินเมื่อข้อความกำกวม
 */
export function aiJourney(text: string, channel?: string): string {
  const t = (text || '').toLowerCase();
  let best = '', bs = 0;
  for (const [stage, kws] of JOURNEY_KW) {
    const sc = kws.reduce((a, [k, w]) => a + (t.includes(k) ? w : 0), 0);
    if (sc > bs) { bs = sc; best = stage; }
  }
  if (bs >= 2) return best;                                   // ข้อความชี้ชัด → เชื่อข้อความ
  const byChannel = channel ? CHANNEL_JOURNEY[channel] : '';  // กำกวม → ใช้ช่องทางช่วย
  return best || byChannel || 'Service';
}

// ---------- ฝ่ายผู้รับผิดชอบ (ตามผังองค์กร กคช. — จับคู่ตามประเภทเสียง) ----------
export function ownerFor(text: string, channel?: string): string {
  const t = (text || '').toLowerCase();
  if (['ฟ้อง', 'กฎหมาย', 'ทุจริต', 'โกง', 'ยึด', 'สัญญาผิด'].some(k => t.includes(k))) return 'ฝ่ายกฎหมาย';
  if (['ซ่อม', 'ชำรุด', 'รั่ว', 'ประปา', 'ไฟ', 'ส่วนกลาง', 'สกปรก', 'ขยะ', 'จอดรถ', 'สาธารณูปโภค'].some(k => t.includes(k))) return 'ฝ่ายปรับปรุงและบำรุงรักษาชุมชน';
  if (['สินเชื่อ', 'ผ่อน', 'ค่างวด', 'ค้างชำระ', 'หนี้', 'ดอกเบี้ย', 'ค่าเช่า'].some(k => t.includes(k))) return 'ฝ่ายบริหารสินเชื่อและหนี้';
  if (['ระบบจอง', 'จองออนไลน์', 'เว็บไซต์', 'แอป', 'ขัดข้อง', 'เด้งออก', 'ล็อกอิน'].some(k => t.includes(k))) return 'ฝ่ายเทคโนโลยีสารสนเทศ';
  if (['โอนกรรมสิทธิ์', 'กรรมสิทธิ์', 'ทำสัญญา', 'เช่าซื้อ', 'โอน'].some(k => t.includes(k))) return 'ฝ่ายบริหารงานขาย';
  if (channel === 'complain' || ['ร้องเรียน', 'ข้อเสนอแนะ'].some(k => t.includes(k))) return 'ฝ่ายสื่อสารองค์กร';
  return 'ฝ่ายการตลาด';
}

// ---------- ความรุนแรงรายเสียง (Priority) ----------
// คิดจาก: ความลบ + ความเข้ม + ผลกระทบสูง (ความปลอดภัย/การเงิน/กฎหมาย) — ไม่ใช่แค่ลบ/ไม่ลบ
export const IMPACT_SAFETY = ['อันตราย', 'ไม่ปลอดภัย', 'ไฟไหม้', 'ไฟดับ', 'มืด', 'รั่ว', 'ทรุด', 'ล้ม', 'บาดเจ็บ'];
export const IMPACT_FINLEGAL = ['ฟ้อง', 'กฎหมาย', 'ทุจริต', 'โกง', 'หนี้', 'ยึด'];
const INTENSE = ['มาก', 'สุด', 'เกินไป', 'ตลอด', 'หลายวัน', 'ทุกครั้ง', 'ด่วน', 'เร่งด่วน'];
export function impactLevel(text: string): number {
  const t = text || '';
  return (IMPACT_SAFETY.some(k => t.includes(k)) ? 2 : 0) + (IMPACT_FINLEGAL.some(k => t.includes(k)) ? 1 : 0);
}
export function aiPriority(s: AiSent, text: string): Priority {
  const t = text || '';
  let score = s.sentiment === 'Negative' ? 2 : s.sentiment === 'Positive' ? -1 : 0;
  if (INTENSE.some(k => t.includes(k))) score += 1;
  score += impactLevel(t);            // +2 ความปลอดภัย, +1 การเงิน/กฎหมาย
  if (score >= 3) return 'High';
  if (score >= 1) return 'Medium';
  return 'Low';
}

// ---------- คะแนนความพึงพอใจจากแบบประเมิน → ช่วยตัดสิน sentiment ----------
// score = 0..1 (normalize มาแล้วจากหน้านำเข้า) · ใช้เมื่อข้อความสั้น/กำกวม เพราะคะแนนตรงกว่า
export function scoreToSentiment(score: number): Sentiment {
  if (score >= 0.7) return 'Positive';
  if (score <= 0.4) return 'Negative';
  return 'Neutral';
}
export function applyScoreHint<T extends AiResult>(r: T, score: number | null | undefined, text: string): T {
  if (score == null || isNaN(score)) return r;
  const s = scoreToSentiment(score);
  const pct = Math.round(score * 100);
  const short = (text || '').trim().length < 12;
  // ข้อความสั้น/ว่าง หรือ AI ไม่มั่นใจ → เชื่อคะแนนแบบประเมิน
  if (short || r.uncertain || r.conf <= 55) {
    const merged = { ...r, sentiment: s, conf: Math.max(r.conf, 80), uncertain: false };
    return {
      ...merged,
      reason: 'ตัดสินจากคะแนนความพึงพอใจในแบบประเมิน (' + pct + '%)' + (short ? ' — ไม่มีข้อความบรรยาย' : ' — ข้อความมีสัญญาณกำกวม'),
      priority: aiPriority(merged, text),
    };
  }
  // ข้อความกับคะแนนขัดกันชัดเจน → ส่งให้เจ้าหน้าที่ยืนยัน
  const polar = (x: Sentiment) => x === 'Positive' || x === 'Negative';
  if (s !== r.sentiment && polar(s) && polar(r.sentiment)) {
    return {
      ...r, uncertain: true, conf: Math.min(r.conf, 55),
      reason: r.reason + ' · แต่คะแนนในแบบประเมิน (' + pct + '%) ชี้ไปทาง' +
        (s === 'Positive' ? 'เชิงบวก' : 'เชิงลบ') + ' — ควรให้เจ้าหน้าที่ยืนยัน',
    };
  }
  return r;
}

// ---------- วิเคราะห์ครบชุด (rule-based) ----------
export interface AiResult extends AiSent { journey: string; catProduct: string; catSales: string; owner: string; priority: Priority }
export function analyzeText(text: string, channel?: string): AiResult {
  const s = aiSentiment(text);
  return { ...s, journey: aiJourney(text, channel), catProduct: catProd(text), catSales: catSal(text), owner: ownerFor(text, channel), priority: aiPriority(s, text) };
}

// ---------- วิเคราะห์ด้วย LLM จริง (Edge Function analyze-voc) + fallback เป็น rule ----------
// via: 'llm' = ผลจาก LLM, 'rule' = fallback keyword (LLM ใช้ไม่ได้/ยังไม่ตั้งค่า)
export type SmartResult = AiResult & { via: 'llm' | 'rule'; model?: string };

export const LLM_BATCH_SIZE = 10;   // ต้องไม่เกิน MAX_BATCH ใน Edge Function

// แปลง payload ที่ได้จาก LLM → AiResult (เติมค่าที่ขาดด้วย rule-based)
function fromLLM(d: any, text: string, channel: string | undefined, model?: string): SmartResult {
  return {
    sentiment: d.sentiment,
    conf: d.confidence ?? 70,
    uncertain: !!d.uncertain,
    reason: d.reason || 'วิเคราะห์โดย LLM',
    journey: d.journey ?? aiJourney(text, channel),
    catProduct: d.catProduct ?? catProd(text),
    catSales: d.catSales ?? catSal(text),
    owner: d.owner ?? ownerFor(text, channel),
    priority: d.priority ?? 'Low',
    via: 'llm',
    model,
  };
}

/** วิเคราะห์ข้อความเดียว — LLM ก่อน ถ้าไม่ได้ใช้ rule-based */
export async function analyzeSmart(text: string, channel?: string): Promise<SmartResult> {
  const { supabase } = await import('./supabaseClient');
  if (supabase) {
    try {
      const { data, error } = await supabase.functions.invoke('analyze-voc', { body: { text, channel } });
      if (!error && data && data.sentiment && !data.error) return fromLLM(data, text, channel, data.model);
    } catch { /* ตกลงมาใช้ rule-based */ }
  }
  return { ...analyzeText(text, channel), via: 'rule' };
}

/**
 * วิเคราะห์หลายข้อความในคำขอเดียว (เร็วกว่าเรียกทีละอัน ~5-8 เท่า)
 * - แบ่งเป็นชุดละ LLM_BATCH_SIZE โดยอัตโนมัติ
 * - ชุดไหน LLM ล้มเหลว → ชุดนั้น fallback เป็น rule-based (ชุดอื่นยังใช้ LLM ได้)
 * - onProgress(done, total) สำหรับแสดงความคืบหน้า
 */
export async function analyzeSmartBatch(
  texts: string[],
  channel?: string,
  onProgress?: (done: number, total: number) => void,
): Promise<SmartResult[]> {
  const out: SmartResult[] = [];
  const { supabase } = await import('./supabaseClient');
  for (let i = 0; i < texts.length; i += LLM_BATCH_SIZE) {
    const chunk = texts.slice(i, i + LLM_BATCH_SIZE);
    let done = false;
    if (supabase) {
      try {
        const { data, error } = await supabase.functions.invoke('analyze-voc', { body: { texts: chunk, channel } });
        const rs = data?.results;
        if (!error && Array.isArray(rs) && rs.length === chunk.length && !data.error) {
          rs.forEach((d: any, j: number) => out.push(fromLLM(d, chunk[j], channel, data.model)));
          done = true;
        }
      } catch { /* ตกลงมาใช้ rule-based เฉพาะชุดนี้ */ }
    }
    if (!done) chunk.forEach(t => out.push({ ...analyzeText(t, channel), via: 'rule' }));
    onProgress?.(Math.min(i + chunk.length, texts.length), texts.length);
  }
  return out;
}

/** ทดสอบการเชื่อมต่อ LLM (ใช้ในหน้าจัดการระบบ) */
export interface LlmPing { ok: boolean; model?: string; base?: string; latencyMs?: number; sample?: any; error?: string }
export async function pingLLM(): Promise<LlmPing> {
  const { supabase } = await import('./supabaseClient');
  if (!supabase) return { ok: false, error: 'ยังไม่ได้เชื่อมต่อ Supabase (ตั้งค่า ENV ก่อน)' };
  try {
    const { data, error } = await supabase.functions.invoke('analyze-voc', { body: { ping: true } });
    if (error) return { ok: false, error: error.message || 'เรียก Edge Function ไม่สำเร็จ (ยัง Deploy หรือยัง?)' };
    if (data?.error) return { ok: false, error: String(data.error) };
    if (data?.ok) return { ok: true, model: data.model, base: data.base, latencyMs: data.latencyMs, sample: data.sample };
    return { ok: false, error: 'ผลลัพธ์ไม่ถูกต้อง: ' + JSON.stringify(data).slice(0, 200) };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}
