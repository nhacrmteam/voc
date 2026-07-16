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
const JOURNEY_KW: [string, string[]][] = [
  ['Win Back', ['ยกเลิก', 'ย้ายออก', 'เลิกใช้', 'กลับมา', 'คืนเงิน']],
  ['Loyalty', ['ชื่นชม', 'ประทับใจ', 'ขอบคุณ', 'แนะนำต่อ', 'บอกต่อ']],
  ['Purchase', ['ทำสัญญา', 'โอนกรรมสิทธิ์', 'เช่าซื้อ', 'ดาวน์', 'จอง', 'ซื้อ']],
  ['Service', ['ซ่อม', 'ชำรุด', 'ประปา', 'ไฟ', 'ส่วนกลาง', 'ร้องเรียน', 'ค่าเช่า', 'ผ่อน', 'ชำระ', 'สินเชื่อ', 'บริการ']],
  ['Consideration', ['สอบถาม', 'เปรียบเทียบ', 'เงื่อนไข', 'รายละเอียด', 'ข้อมูลโครงการ', 'สนใจ']],
  ['Awareness', ['โฆษณา', 'ประชาสัมพันธ์', 'เพจ', 'โพสต์', 'รู้จัก', 'เห็น']],
];
export function aiJourney(text: string): string {
  const t = (text || '').toLowerCase();
  for (const [stage, kws] of JOURNEY_KW) if (kws.some(k => t.includes(k))) return stage;
  return 'Service';
}

// ---------- ฝ่ายผู้รับผิดชอบ (ตามผังองค์กร กคช. — จับคู่ตามประเภทเสียง) ----------
export function ownerFor(text: string, channel?: string): string {
  const t = (text || '').toLowerCase();
  if (['ซ่อม', 'ชำรุด', 'รั่ว', 'ประปา', 'ไฟ', 'ส่วนกลาง', 'สกปรก', 'ขยะ', 'จอดรถ'].some(k => t.includes(k))) return 'ฝ่ายปรับปรุงและบำรุงรักษาชุมชน';
  if (['สินเชื่อ', 'ผ่อน', 'ค่างวด', 'ค้างชำระ', 'หนี้', 'ดอกเบี้ย'].some(k => t.includes(k))) return 'ฝ่ายบริหารสินเชื่อและหนี้';
  if (['ระบบจอง', 'จองออนไลน์', 'เว็บไซต์', 'แอป', 'ขัดข้อง', 'เด้งออก'].some(k => t.includes(k))) return 'ฝ่ายเทคโนโลยีสารสนเทศ';
  if (channel === 'complain' || ['ร้องเรียน', 'ข้อเสนอแนะ'].some(k => t.includes(k))) return 'ฝ่ายสื่อสารองค์กร';
  return 'ฝ่ายการตลาด';
}

// ---------- Priority ----------
export function aiPriority(s: AiSent, text: string): Priority {
  const urgent = ['ด่วน', 'อันตราย', 'ไม่ปลอดภัย', 'หลายวัน', 'ตลอด'].some(k => (text || '').includes(k));
  if (s.sentiment === 'Negative') return urgent || s.conf >= 85 ? 'High' : 'Medium';
  return 'Low';
}

// ---------- วิเคราะห์ครบชุด ----------
export interface AiResult extends AiSent { journey: string; catProduct: string; catSales: string; owner: string; priority: Priority }
export function analyzeText(text: string, channel?: string): AiResult {
  const s = aiSentiment(text);
  return { ...s, journey: aiJourney(text), catProduct: catProd(text), catSales: catSal(text), owner: ownerFor(text, channel), priority: aiPriority(s, text) };
}
