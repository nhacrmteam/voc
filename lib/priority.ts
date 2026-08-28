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
