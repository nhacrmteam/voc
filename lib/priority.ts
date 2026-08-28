// lib/priority.ts — โมเดลจัดลำดับความสำคัญ VOC 4 ปัจจัย (แหล่งเดียวของทั้งระบบ)
// ใช้ร่วมกัน 3 ที่: หน้าจัดลำดับ (รายประเด็น) · หน้า 8 ช่องทาง (รายเสียง) · หน้ารายละเอียด VOC (รายเสียง)
// หลักการ: ประเมิน 4 ปัจจัย ปัจจัยละ 1–5 คะแนน แล้วถ่วงน้ำหนักรวมเป็น 1.00–5.00
import type { Voc } from './data';
import { impactLevel } from './ai';

export const W = { freq: 0.25, sev: 0.35, trend: 0.20, impact: 0.20 };
export const FACTORS = [
  { key: 'freq', name: 'ความถี่ (Volume)', w: W.freq, desc: 'จำนวนครั้งที่ประเด็นถูกพูดถึง — กระทบลูกค้าจำนวนมาก' },
  { key: 'sev', name: 'ความรุนแรง (Severity)', w: W.sev, desc: 'สัดส่วน + ความเข้มของเสียงเชิงลบในประเด็น' },
  { key: 'trend', name: 'แนวโน้ม (Trend)', w: W.trend, desc: 'ประเด็นกำลังพุ่งขึ้นเทียบช่วงก่อนหรือไม่' },
  { key: 'impact', name: 'ผลกระทบ (Impact)', w: W.impact, desc: 'มีคำด้านความปลอดภัย/การเงิน/กฎหมาย — เสี่ยงสูงแม้จำนวนน้อย' },
] as const;

export const INTENSE = ['มาก', 'สุด', 'เกินไป', 'ตลอด', 'หลายวัน', 'ทุกครั้ง', 'ด่วน', 'เร่งด่วน'];

/** ระดับความสำคัญจากคะแนนรวม — ใช้ป้ายสีเดียวกันทุกหน้า */
export function scoreBand(score: number): { label: string; cls: string } {
  if (score >= 4) return { label: 'สูงมาก', cls: 'p-hi' };
  if (score >= 3) return { label: 'สูง', cls: 'p-md' };
  if (score >= 2) return { label: 'ปานกลาง', cls: 'p-lo' };
  return { label: 'ต่ำ', cls: 'p-neu' };
}

export interface TopicScore {
  topic: string; count: number;
  fl: number; sl: number; tl: number; il: number;   // คะแนนรายปัจจัย 1–5
  score: number;                                    // คะแนนถ่วงน้ำหนัก 1.00–5.00
}

/**
 * คำนวณคะแนนของทุก "ประเด็น (topic)" จากชุดข้อมูลที่ให้มา
 * คะแนนของเสียงหนึ่ง = คะแนนของประเด็นที่เสียงนั้นสังกัด (เพราะความถี่/แนวโน้มวัดที่ระดับประเด็น)
 */
export function scoreTopics(rows: Voc[]): Map<string, TopicScore> {
  // แบ่งครึ่งช่วงเวลาเพื่อดูแนวโน้ม (ครึ่งแรก vs ครึ่งหลัง)
  const dates = rows.map(r => r.occurredAt).filter(Boolean).sort();
  const minD = dates[0] || '', maxD = dates[dates.length - 1] || '';
  const midMs = minD && maxD ? (new Date(minD).getTime() + new Date(maxD).getTime()) / 2 : 0;

  const g: Record<string, { c: number; neg: number; intense: number; impact: number; recent: number; earlier: number }> = {};
  rows.forEach(r => {
    const t = r.topic; if (!t) return;
    g[t] ||= { c: 0, neg: 0, intense: 0, impact: 0, recent: 0, earlier: 0 };
    const o = g[t];
    o.c++;
    if (r.sentiment === 'Negative') o.neg++;
    if (INTENSE.some(k => (r.voice || '').includes(k))) o.intense++;
    if (impactLevel(r.voice || '') > 0) o.impact++;
    if (new Date(r.occurredAt).getTime() >= midMs) o.recent++; else o.earlier++;
  });

  const maxc = Math.max(...Object.values(g).map(o => o.c), 1);
  const m = new Map<string, TopicScore>();
  Object.entries(g).forEach(([topic, o]) => {
    // 1) ความถี่ — เทียบกับประเด็นที่ถูกพูดถึงมากที่สุด
    const fl = Math.max(1, Math.min(5, Math.ceil(o.c / maxc * 5)));
    // 2) ความรุนแรง — สัดส่วนเสียงลบ แล้วบวกเพิ่มถ้าใช้ถ้อยคำเข้มข้น
    const negPct = o.c ? o.neg / o.c * 100 : 0;
    let sl = negPct >= 50 ? 5 : negPct >= 35 ? 4 : negPct >= 20 ? 3 : negPct >= 10 ? 2 : 1;
    if (o.neg > 0 && o.intense / o.neg >= 0.5) sl = Math.min(5, sl + 1);
    // 3) แนวโน้ม — ครึ่งหลังเทียบครึ่งแรก
    const ratio = o.recent / (o.earlier || 1);
    const tl = o.earlier === 0 && o.recent > 0 ? 5 : ratio >= 2 ? 5 : ratio >= 1.5 ? 4 : ratio >= 1.1 ? 3 : ratio >= 0.8 ? 2 : 1;
    // 4) ผลกระทบ — สัดส่วนเสียงที่มีคำด้านความปลอดภัย/การเงิน/กฎหมาย
    const impPct = o.c ? o.impact / o.c * 100 : 0;
    const il = impPct >= 40 ? 5 : impPct >= 25 ? 4 : impPct >= 15 ? 3 : impPct >= 5 ? 2 : 1;
    m.set(topic, { topic, count: o.c, fl, sl, tl, il, score: fl * W.freq + sl * W.sev + tl * W.trend + il * W.impact });
  });
  return m;
}

/** คะแนนของเสียงหนึ่งรายการ (คืน null เมื่อไม่มีหัวข้อให้จัดกลุ่ม) */
export function scoreOf(map: Map<string, TopicScore>, r: Voc): TopicScore | null {
  return (r.topic && map.get(r.topic)) || null;
}

// ============================================================
// โมเดล "จุดแข็ง" (Strength) — คู่ขนานกับโมเดลเฝ้าระวัง
// ระบบ VOC ไม่ได้ฟังแค่เสียงลบ — เสียงบวกบอกว่าอะไรทำได้ดีจนควรขยายผลและชื่นชมหน่วยงาน
// ใช้น้ำหนักเดียวกัน แต่เปลี่ยนความหมาย 2 ปัจจัย:
//   ความรุนแรง → ความเข้มเชิงบวก (สัดส่วนเสียงบวก + ถ้อยคำชื่นชม)
//   ผลกระทบ    → การบอกต่อ/ความผูกพัน (แนะนำต่อ ประทับใจ กลับมาใช้ซ้ำ)
// ============================================================
export const SW = { freq: 0.25, pos: 0.35, trend: 0.20, advocacy: 0.20 };
export const STRENGTH_FACTORS = [
  { key: 'freq', name: 'ความถี่ (Volume)', w: SW.freq, desc: 'จำนวนครั้งที่ประเด็นถูกพูดถึง — คนชมเยอะแปลว่าทำได้ดีในวงกว้าง' },
  { key: 'pos', name: 'ความเข้มเชิงบวก (Positivity)', w: SW.pos, desc: 'สัดส่วนเสียงบวก + ถ้อยคำชื่นชมที่หนักแน่น' },
  { key: 'trend', name: 'แนวโน้ม (Trend)', w: SW.trend, desc: 'คำชมกำลังเพิ่มขึ้นเทียบช่วงก่อนหรือไม่' },
  { key: 'advocacy', name: 'การบอกต่อ (Advocacy)', w: SW.advocacy, desc: 'ลูกค้าถึงขั้นแนะนำต่อ/ประทับใจ — สร้างภาพลักษณ์องค์กร' },
] as const;

// ถ้อยคำชื่นชมที่หนักแน่น (ไม่ใช่แค่ "ดี" เฉย ๆ)
const PRAISE = ['ประทับใจ', 'ชื่นชม', 'ขอบคุณ', 'ดีมาก', 'ยอดเยี่ยม', 'สุภาพ', 'เป็นกันเอง', 'รวดเร็ว', 'ใส่ใจ'];
// คำที่แสดงว่าพร้อมบอกต่อ/ผูกพันกับองค์กร
const ADVOCACY = ['แนะนำต่อ', 'บอกต่อ', 'จะกลับมา', 'ซื้อเพิ่ม', 'ประทับใจมาก', 'ไม่ผิดหวัง', 'คุ้มค่า'];

export interface StrengthScore {
  topic: string; count: number; posCount: number;
  fl: number; pl: number; tl: number; al: number;
  score: number;
  owner: string;   // ฝ่ายที่ถูกพูดถึงมากที่สุดในประเด็นนี้ — ฝ่ายที่ควรได้รับคำชม
}

/** คำนวณคะแนน "จุดแข็ง" ของทุกประเด็น — เอาเฉพาะประเด็นที่มีเสียงบวกจริง */
export function scoreStrengths(rows: Voc[]): StrengthScore[] {
  const dates = rows.map(r => r.occurredAt).filter(Boolean).sort();
  const minD = dates[0] || '', maxD = dates[dates.length - 1] || '';
  const midMs = minD && maxD ? (new Date(minD).getTime() + new Date(maxD).getTime()) / 2 : 0;

  const g: Record<string, {
    c: number; pos: number; praise: number; adv: number;
    recentPos: number; earlierPos: number; owners: Record<string, number>;
  }> = {};
  rows.forEach(r => {
    const t = r.topic; if (!t) return;
    g[t] ||= { c: 0, pos: 0, praise: 0, adv: 0, recentPos: 0, earlierPos: 0, owners: {} };
    const o = g[t];
    o.c++;
    if (r.owner) o.owners[r.owner] = (o.owners[r.owner] || 0) + 1;
    if (r.sentiment !== 'Positive') return;
    o.pos++;
    const v = r.voice || '';
    if (PRAISE.some(k => v.includes(k))) o.praise++;
    if (ADVOCACY.some(k => v.includes(k))) o.adv++;
    if (new Date(r.occurredAt).getTime() >= midMs) o.recentPos++; else o.earlierPos++;
  });

  const maxPos = Math.max(...Object.values(g).map(o => o.pos), 1);
  return Object.entries(g)
    .filter(([, o]) => o.pos > 0)                    // ไม่มีเสียงบวกเลย = ไม่ใช่จุดแข็ง
    .map(([topic, o]) => {
      // 1) ความถี่ — เทียบกับประเด็นที่ได้คำชมมากที่สุด
      const fl = Math.max(1, Math.min(5, Math.ceil(o.pos / maxPos * 5)));
      // 2) ความเข้มเชิงบวก — สัดส่วนเสียงบวก แล้วบวกเพิ่มถ้าใช้ถ้อยคำชื่นชมหนักแน่น
      const posPct = o.c ? o.pos / o.c * 100 : 0;
      let pl = posPct >= 70 ? 5 : posPct >= 50 ? 4 : posPct >= 30 ? 3 : posPct >= 15 ? 2 : 1;
      if (o.pos > 0 && o.praise / o.pos >= 0.5) pl = Math.min(5, pl + 1);
      // 3) แนวโน้ม — คำชมครึ่งหลังเทียบครึ่งแรก
      const ratio = o.recentPos / (o.earlierPos || 1);
      const tl = o.earlierPos === 0 && o.recentPos > 0 ? 5 : ratio >= 2 ? 5 : ratio >= 1.5 ? 4 : ratio >= 1.1 ? 3 : ratio >= 0.8 ? 2 : 1;
      // 4) การบอกต่อ
      const advPct = o.pos ? o.adv / o.pos * 100 : 0;
      const al = advPct >= 40 ? 5 : advPct >= 25 ? 4 : advPct >= 15 ? 3 : advPct >= 5 ? 2 : 1;
      const owner = Object.entries(o.owners).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
      return {
        topic, count: o.c, posCount: o.pos, fl, pl, tl, al, owner,
        score: fl * SW.freq + pl * SW.pos + tl * SW.trend + al * SW.advocacy,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/** ระดับจุดแข็งจากคะแนนรวม */
export function strengthBand(score: number): { label: string; cls: string } {
  if (score >= 4) return { label: 'จุดแข็งเด่น', cls: 'p-pos' };
  if (score >= 3) return { label: 'จุดแข็ง', cls: 'p-pos' };
  if (score >= 2) return { label: 'ทำได้ดี', cls: 'p-lo' };
  return { label: 'พอใช้', cls: 'p-neu' };
}
