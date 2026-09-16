// lib/report.ts — ตัวสร้าง "เอกสารรายงาน" จากข้อมูลเสียงลูกค้า
//
// ทำไมต้องมีไฟล์นี้: เดิมหน้ารายงานเป็นแค่ปุ่มดาวน์โหลดตารางดิบ 11 ใบ
//   กดแล้วได้ตัวเลขเปล่า ๆ ไม่มีบทสรุป ไม่มีกราฟ และดูก่อนโหลดไม่ได้ว่าข้างในมีอะไร
//   ผู้ใช้จึงต้องมาตีความเองทุกครั้ง = รายงานที่เอาไปใช้ต่อไม่ได้จริง
//
// ไฟล์นี้จึงสร้าง "เอกสาร" ไม่ใช่ "ตาราง" — 1 รายงาน = ตัวชี้วัด + บทสรุปเป็นประโยค + กราฟ + ตาราง (หลายชุด)
// แล้วปลายทางค่อยเลือกว่าจะแสดงบนหน้าเว็บ · พิมพ์เป็น PDF ทางการ · ทำเป็นอินโฟกราฟิก · หรือส่งออกเป็น Excel
//
// ⚠️ ไฟล์นี้ต้องไม่แตะ DOM และไม่แตะ React — เพื่อให้เรียกได้ทั้งฝั่งเซิร์ฟเวอร์และเบราว์เซอร์ และทดสอบได้
//
// เรื่องบทสรุปเป็นข้อความ: เขียนด้วย "สูตร" จากตัวเลขจริงล้วน ไม่มีการเดา
//   ข้อดีคือทำงานทันที ไม่มีค่าใช้จ่ายต่อครั้ง และตัวเลขในประโยคตรงกับตารางเสมอ
//   ถ้าวันหนึ่งจะเปลี่ยนไปใช้ LLM เขียนให้ลื่นกว่า ให้แทนที่เฉพาะฟังก์ชัน narrate* — โครงอื่นไม่ต้องแก้

import type { Voc } from './data';
import { CHANNELS, JOURNEY_TH } from './data';
import { scoreTopics, scoreStrengths, scoreBand, strengthBand } from './priority';
import { dim3Cat, DIM3_OTHER, custGroupOf, CUST_GROUPS } from './dimensions';
import { svgSentDonut, svgStackBars, svgRankBars, svgTrend, type StackRow, type RankRow } from './reportChart';

export interface KPI { label: string; value: string; note?: string; tone?: 'good' | 'bad' | 'warn' | 'plain' }
export interface Section { head: string; paras: string[]; bullets?: string[] }
export interface TableSpec { title: string; sheet: string; cols: string[]; rows: (string | number)[][] }
export interface ChartSpec { title: string; note?: string; svg: string }
export interface Highlight { label: string; value: string; sub?: string; tone?: 'good' | 'bad' | 'warn' | 'plain' }
export interface ReportDoc {
  id: string; icon: string; name: string; desc: string; scope: string;
  total: number;
  headline: string;            // ประโยคเดียว — ใช้เป็นพาดหัวอินโฟกราฟิก
  kpis: KPI[];
  sections: Section[];         // บทสรุป · ข้อสังเกต · ข้อเสนอแนะ
  charts: ChartSpec[];
  tables: TableSpec[];         // ตารางแรก = ตารางหลัก (ใช้ทำ CSV) · ทุกตาราง = 1 ชีตใน Excel
  highlights: Highlight[];     // 3–4 ข้อเด่น สำหรับอินโฟกราฟิก
}

const SENT_TH: Record<string, string> = { Positive: 'เชิงบวก', Neutral: 'เป็นกลาง', Negative: 'เชิงลบ' };
const PRIO_TH: Record<string, string> = { High: 'สูง', Medium: 'ปานกลาง', Low: 'ต่ำ' };
const TH_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const num = (v: number) => v.toLocaleString('en-US');
const pct = (v: number, t: number) => (t ? Math.round(v / t * 100) : 0);
/** ข้อความเปรียบเทียบกับช่วงก่อนหน้า — คืนค่าว่างเมื่อไม่มีข้อมูลช่วงก่อนให้เทียบ (ห้ามเดาเป็น 0%) */
function delta(now: number, prev: number): { text: string; dir: 'up' | 'down' | 'flat' | 'none'; pct: number } {
  if (!prev) return { text: '', dir: 'none', pct: 0 };
  const d = now - prev;
  if (d === 0) return { text: 'เท่ากับช่วงก่อนหน้า', dir: 'flat', pct: 0 };
  const p = Math.round(Math.abs(d) / prev * 1000) / 10;
  return { text: `${d > 0 ? 'เพิ่มขึ้น' : 'ลดลง'} ${p}% จากช่วงก่อนหน้า (${num(prev)} รายการ)`, dir: d > 0 ? 'up' : 'down', pct: p };
}

export interface Counts { total: number; pos: number; neu: number; neg: number; high: number }
export function countOf(rs: Voc[]): Counts {
  const c: Counts = { total: rs.length, pos: 0, neu: 0, neg: 0, high: 0 };
  rs.forEach(r => {
    if (r.sentiment === 'Positive') c.pos++; else if (r.sentiment === 'Negative') c.neg++; else c.neu++;
    if (r.priority === 'High') c.high++;
  });
  return c;
}
function groupBy(rs: Voc[], key: (r: Voc) => string): Record<string, Voc[]> {
  const m: Record<string, Voc[]> = {};
  rs.forEach(r => { const k = key(r) || '-'; (m[k] ||= []).push(r); });
  return m;
}
/** แนวโน้มรายเดือน — เรียงตามเวลาจริง ไม่ใช่ตามจำนวน */
function byMonth(rs: Voc[]): { label: string; value: number; neg: number }[] {
  const m: Record<string, { v: number; neg: number }> = {};
  rs.forEach(r => {
    const k = (r.occurredAt || '').slice(0, 7); if (!k) return;
    m[k] ||= { v: 0, neg: 0 }; m[k].v++; if (r.sentiment === 'Negative') m[k].neg++;
  });
  return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0])).map(([k, o]) => {
    const mo = Number(k.slice(5, 7)) - 1;
    return { label: `${TH_MONTH[mo] ?? k.slice(5, 7)} ${String(Number(k.slice(0, 4)) + 543).slice(2)}`, value: o.v, neg: o.neg };
  });
}

// ============================================================
// 1) รายงานสรุปผู้บริหาร
// ============================================================
export function buildExec(fr: Voc[], prev: Voc[], scope: string): ReportDoc {
  const c = countOf(fr), p = countOf(prev);
  const dTotal = delta(c.total, p.total);
  const negPctNow = pct(c.neg, c.total), negPctPrev = pct(p.neg, p.total);
  const negShift = p.total ? negPctNow - negPctPrev : 0;

  const scores = Array.from(scoreTopics(fr).values()).sort((a, b) => b.score - a.score);
  const watch = scores.slice(0, 5);
  const strengths = scoreStrengths(fr).slice(0, 5);
  const byCh = groupBy(fr, r => r.channel);
  // ช่องทางที่ "เสียงลบหนาแน่นที่สุด" — นับเฉพาะช่องทางที่มีอย่างน้อย 20 เสียง
  // ไม่งั้นช่องทางที่มี 3 เสียงแล้วลบหมดจะได้ 100% แล้วแซงช่องทางที่มีปัญหาจริง
  const chStat = Object.entries(byCh).map(([k, rs]) => ({ k, c: countOf(rs) }));
  const worstCh = chStat.filter(x => x.c.total >= 20).sort((a, b) => pct(b.c.neg, b.c.total) - pct(a.c.neg, a.c.total))[0]
    ?? chStat.sort((a, b) => b.c.neg - a.c.neg)[0];
  const topCh = chStat.slice().sort((a, b) => b.c.total - a.c.total)[0];
  const tCount: Record<string, number> = {};
  fr.forEach(r => { if (r.topic) tCount[r.topic] = (tCount[r.topic] || 0) + 1; });
  const recurring = Object.values(tCount).filter(x => x >= 3).length;
  const months = byMonth(fr);

  const paras1 = [
    `ช่วง ${scope} ระบบรับเสียงลูกค้าทั้งสิ้น ${num(c.total)} รายการ` +
      (dTotal.text ? ` ${dTotal.text}` : ' (ยังไม่มีข้อมูลช่วงก่อนหน้าให้เทียบ)') + '.',
    `แบ่งเป็นเชิงบวก ${num(c.pos)} รายการ (${pct(c.pos, c.total)}%) · เป็นกลาง ${num(c.neu)} รายการ (${pct(c.neu, c.total)}%) · ` +
      `เชิงลบ ${num(c.neg)} รายการ (${negPctNow}%)` +
      (p.total
        ? negShift === 0 ? ' สัดส่วนเสียงเชิงลบเท่ากับช่วงก่อนหน้า.'
          : ` สัดส่วนเสียงเชิงลบ${negShift > 0 ? 'สูงขึ้น' : 'ลดลง'} ${Math.abs(negShift)} จุด จากช่วงก่อนหน้า (${negPctPrev}%).`
        : '.'),
    `มีเรื่องที่ระบบจัดว่าเร่งด่วนระดับสูง ${num(c.high)} รายการ (${pct(c.high, c.total)}% ของทั้งหมด) ` +
      `และมีประเด็นที่เกิดซ้ำตั้งแต่ 3 ครั้งขึ้นไป ${num(recurring)} ประเด็น ซึ่งเข้าข่ายต้องเฝ้าระวังตามแนวทาง monitoring.`,
  ];

  const obs: string[] = [];
  if (topCh) obs.push(`ช่องทางที่มีเสียงเข้ามามากที่สุดคือ ${topCh.k} จำนวน ${num(topCh.c.total)} รายการ (${pct(topCh.c.total, c.total)}% ของทั้งหมด)`);
  if (worstCh) obs.push(`ช่องทางที่สัดส่วนเสียงเชิงลบสูงที่สุดคือ ${worstCh.k} — เชิงลบ ${pct(worstCh.c.neg, worstCh.c.total)}% จาก ${num(worstCh.c.total)} รายการ`);
  if (watch[0]) obs.push(`ประเด็นที่ควรเร่งแก้ที่สุดคือ “${watch[0].topic}” พบ ${num(watch[0].count)} ครั้ง คะแนนความสำคัญ ${watch[0].score.toFixed(2)}/5.00 (ระดับ${scoreBand(watch[0].score).label})`);
  if (strengths[0]) obs.push(`จุดแข็งที่เด่นที่สุดคือ “${strengths[0].topic}” มีเสียงชื่นชม ${num(strengths[0].posCount)} ครั้ง` + (strengths[0].owner ? ` — ฝ่ายที่ควรได้รับคำชมคือ ${strengths[0].owner}` : ''));
  if (months.length >= 2) {
    const last = months[months.length - 1], before = months[months.length - 2];
    obs.push(`เดือนล่าสุด (${last.label}) มี ${num(last.value)} รายการ เทียบเดือนก่อนหน้า (${before.label}) ${num(before.value)} รายการ`);
  }

  const rec: string[] = [];
  if (negPctNow >= 35) rec.push(`สัดส่วนเสียงเชิงลบอยู่ที่ ${negPctNow}% ซึ่งสูงกว่าระดับที่ควรปล่อยไว้ — ควรตั้งเป้าลดลงให้ต่ำกว่า 30% ในไตรมาสถัดไป`);
  if (watch[0]) rec.push(`มอบหมายเจ้าภาพประเด็น “${watch[0].topic}” พร้อมกำหนดวันแล้วเสร็จ และรายงานความคืบหน้าในรอบถัดไป`);
  if (worstCh && pct(worstCh.c.neg, worstCh.c.total) >= 40) rec.push(`ทบทวนกระบวนการรับเรื่องของช่องทาง ${worstCh.k} เป็นลำดับแรก เพราะเป็นจุดที่เสียงเชิงลบหนาแน่นที่สุด`);
  if (recurring >= 5) rec.push(`มีประเด็นซ้ำถึง ${num(recurring)} ประเด็น — ควรแก้ที่ต้นเหตุเชิงระบบ ไม่ใช่แก้ทีละเรื่อง`);
  if (strengths[0]) rec.push(`นำจุดแข็ง “${strengths[0].topic}” ไปสื่อสารและขยายผลไปยังโครงการอื่น พร้อมชื่นชมหน่วยงานที่ทำได้ดี`);
  if (c.high > 0) rec.push(`ติดตามเรื่องเร่งด่วนระดับสูง ${num(c.high)} รายการให้ปิดได้ภายในรอบรายงานนี้`);
  if (rec.length === 0) rec.push('ภาพรวมอยู่ในเกณฑ์ปกติ — คงมาตรการเดิมและติดตามต่อเนื่อง');

  const headline = c.total === 0 ? 'ยังไม่มีเสียงลูกค้าในช่วงที่เลือก'
    : negPctNow >= 35 ? `เสียงเชิงลบ ${negPctNow}% — ต้องเร่งแก้ “${watch[0]?.topic ?? '-'}”`
    : `เสียงลูกค้า ${num(c.total)} รายการ · เชิงบวก ${pct(c.pos, c.total)}% · ประเด็นเฝ้าระวัง ${num(recurring)} เรื่อง`;

  return {
    id: 'exec', icon: '📊', name: 'รายงานสรุปผู้บริหาร',
    desc: 'ภาพรวมเสียงลูกค้า เปรียบเทียบกับช่วงก่อนหน้า ประเด็นที่ต้องเร่งแก้ จุดแข็ง และข้อเสนอแนะ',
    scope, total: c.total, headline,
    kpis: [
      { label: 'เสียงลูกค้าทั้งหมด', value: num(c.total), note: dTotal.text || 'ไม่มีช่วงก่อนหน้าให้เทียบ', tone: 'plain' },
      { label: 'เชิงบวก', value: pct(c.pos, c.total) + '%', note: `${num(c.pos)} รายการ`, tone: 'good' },
      { label: 'เชิงลบ', value: negPctNow + '%', note: p.total ? `${negShift > 0 ? '▲' : negShift < 0 ? '▼' : '='} ${Math.abs(negShift)} จุด จากช่วงก่อน` : `${num(c.neg)} รายการ`, tone: 'bad' },
      { label: 'เร่งด่วนระดับสูง', value: num(c.high), note: `${pct(c.high, c.total)}% ของทั้งหมด`, tone: 'warn' },
      { label: 'ประเด็นเฝ้าระวัง', value: num(recurring), note: 'ประเด็นที่เกิดซ้ำ ≥ 3 ครั้ง', tone: 'warn' },
    ],
    sections: [
      { head: 'บทสรุปสำหรับผู้บริหาร', paras: paras1 },
      { head: 'ข้อสังเกตสำคัญ', paras: [], bullets: obs },
      { head: 'ข้อเสนอแนะ', paras: [], bullets: rec },
    ],
    charts: [
      { title: 'สัดส่วนความรู้สึกของลูกค้า', note: 'ตัวเลขในวงเล็บคือจำนวนรายการจริง', svg: svgSentDonut(c.pos, c.neu, c.neg, { size: 330 }) },
      { title: 'แนวโน้มจำนวนเสียงลูกค้ารายเดือน', note: 'ป้ายตัวเลขแสดงเฉพาะเดือนที่สูงสุดและเดือนล่าสุด', svg: svgTrend(months) },
      {
        title: 'เสียงลูกค้าแยกตามช่องทาง', note: 'แถบเรียงตามจำนวน · ตัวเลขท้ายแถบคือจำนวนรวมและสัดส่วนเชิงลบ',
        svg: svgStackBars(chStat.sort((a, b) => b.c.total - a.c.total).slice(0, 8)
          .map(x => ({ label: x.k, pos: x.c.pos, neu: x.c.neu, neg: x.c.neg } as StackRow))),
      },
    ],
    tables: [
      {
        title: 'ตัวชี้วัดภาพรวม', sheet: 'ภาพรวม', cols: ['ตัวชี้วัด', 'ค่า', 'หมายเหตุ'],
        rows: [
          ['ช่วงข้อมูล', scope, ''],
          ['เสียงลูกค้าทั้งหมด', c.total, dTotal.text || '-'],
          ['เชิงบวก', c.pos, pct(c.pos, c.total) + '%'],
          ['เป็นกลาง', c.neu, pct(c.neu, c.total) + '%'],
          ['เชิงลบ', c.neg, pct(c.neg, c.total) + '%'],
          ['เร่งด่วนระดับสูง', c.high, pct(c.high, c.total) + '%'],
          ['ประเด็นเฝ้าระวัง (ซ้ำ ≥3)', recurring, 'ประเด็น'],
          ['ช่องทางที่มีเสียงมากที่สุด', topCh?.k ?? '-', topCh ? `${topCh.c.total} รายการ` : '-'],
          ['ช่องทางที่เสียงเชิงลบหนาแน่นที่สุด', worstCh?.k ?? '-', worstCh ? `เชิงลบ ${pct(worstCh.c.neg, worstCh.c.total)}%` : '-'],
        ],
      },
      {
        title: 'ประเด็นที่ควรเร่งแก้ 5 อันดับแรก', sheet: 'ประเด็นเร่งแก้',
        cols: ['อันดับ', 'ประเด็น', 'จำนวนครั้ง', 'คะแนน', 'ระดับ'],
        rows: watch.map((w, i) => [i + 1, w.topic, w.count, w.score.toFixed(2), scoreBand(w.score).label]),
      },
      {
        title: 'จุดแข็ง 5 อันดับแรก', sheet: 'จุดแข็ง',
        cols: ['อันดับ', 'ประเด็น', 'เสียงชื่นชม', 'คะแนน', 'ฝ่ายที่ควรได้รับคำชม'],
        rows: strengths.map((s, i) => [i + 1, s.topic, s.posCount, s.score.toFixed(2), s.owner || '-']),
      },
      {
        title: 'แนวโน้มรายเดือน', sheet: 'รายเดือน', cols: ['เดือน', 'จำนวน', 'เชิงลบ', '%เชิงลบ'],
        rows: months.map(m => [m.label, m.value, m.neg, pct(m.neg, m.value) + '%']),
      },
    ],
    highlights: [
      { label: 'เสียงลูกค้าทั้งหมด', value: num(c.total), sub: dTotal.text || scope, tone: 'plain' },
      { label: 'เชิงบวก', value: pct(c.pos, c.total) + '%', sub: `${num(c.pos)} รายการ`, tone: 'good' },
      { label: 'เชิงลบ', value: negPctNow + '%', sub: `${num(c.neg)} รายการ`, tone: 'bad' },
      { label: 'ประเด็นเฝ้าระวัง', value: num(recurring), sub: 'เกิดซ้ำ ≥ 3 ครั้ง', tone: 'warn' },
    ],
  };
}

// ============================================================
// 2) รายงานแยกตามช่องทาง
// ============================================================
export function buildChannel(fr: Voc[], prev: Voc[], scope: string): ReportDoc {
  const all = countOf(fr);
  const stat = CHANNELS.map(name => {
    const rs = fr.filter(r => r.channel === name);
    const c = countOf(rs);
    const pc = countOf(prev.filter(r => r.channel === name));
    const tp: Record<string, number> = {};
    rs.forEach(r => { if (r.topic) tp[r.topic] = (tp[r.topic] || 0) + 1; });
    const top = Object.entries(tp).sort((a, b) => b[1] - a[1])[0];
    return { name, c, prev: pc, topTopic: top ? `${top[0]} (${top[1]})` : '-' };
  }).filter(x => x.c.total > 0 || x.prev.total > 0);

  const busiest = stat.slice().sort((a, b) => b.c.total - a.c.total)[0];
  const sized = stat.filter(x => x.c.total >= 20);
  const worst = (sized.length ? sized : stat).slice().sort((a, b) => pct(b.c.neg, b.c.total) - pct(a.c.neg, a.c.total))[0];
  const best = (sized.length ? sized : stat).slice().sort((a, b) => pct(b.c.pos, b.c.total) - pct(a.c.pos, a.c.total))[0];
  const quiet = stat.filter(x => x.c.total > 0).slice().sort((a, b) => a.c.total - b.c.total)[0];
  const grew = stat.filter(x => x.prev.total >= 10 && x.c.total > x.prev.total * 1.3)
    .sort((a, b) => (b.c.total / b.prev.total) - (a.c.total / a.prev.total))[0];

  const obs: string[] = [];
  if (busiest) obs.push(`${busiest.name} เป็นช่องทางที่รับเสียงมากที่สุด ${num(busiest.c.total)} รายการ (${pct(busiest.c.total, all.total)}% ของทั้งหมด) ประเด็นที่พบบ่อยที่สุดคือ ${busiest.topTopic}`);
  if (worst) obs.push(`${worst.name} มีสัดส่วนเสียงเชิงลบสูงที่สุด ${pct(worst.c.neg, worst.c.total)}% (${num(worst.c.neg)} จาก ${num(worst.c.total)} รายการ)`);
  if (best) obs.push(`${best.name} มีสัดส่วนเสียงเชิงบวกสูงที่สุด ${pct(best.c.pos, best.c.total)}% — เป็นช่องทางที่ลูกค้าพึงพอใจมากที่สุด`);
  if (grew) obs.push(`${grew.name} มีปริมาณเสียงเพิ่มขึ้นเร็วผิดปกติ จาก ${num(grew.prev.total)} เป็น ${num(grew.c.total)} รายการ — ควรตรวจสอบว่าเกิดจากเหตุใด`);
  if (quiet && busiest && quiet.name !== busiest.name) obs.push(`${quiet.name} มีเสียงเข้ามาน้อยที่สุดเพียง ${num(quiet.c.total)} รายการ — ควรตรวจว่าช่องทางนี้ถูกใช้งานจริงหรือยังไม่ได้เชื่อมข้อมูลครบ`);

  const rec: string[] = [];
  if (worst && pct(worst.c.neg, worst.c.total) >= 40) rec.push(`ทบทวนกระบวนการของ ${worst.name} เป็นลำดับแรก และกำหนดผู้รับผิดชอบติดตามผลรายสัปดาห์`);
  if (busiest && worst && busiest.name === worst.name) rec.push(`${busiest.name} เป็นทั้งช่องทางที่เสียงมากที่สุดและลบมากที่สุด — ควรเพิ่มกำลังคนหรือปรับขั้นตอนรับเรื่องเป็นการเร่งด่วน`);
  if (best) rec.push(`ถอดบทเรียนวิธีทำงานของ ${best.name} ไปใช้กับช่องทางที่คะแนนต่ำกว่า`);
  if (quiet) rec.push(`ตรวจสอบการเชื่อมข้อมูลของ ${quiet.name} ว่าครบถ้วนหรือไม่ ก่อนสรุปว่าลูกค้าไม่ใช้ช่องทางนี้`);
  if (rec.length === 0) rec.push('ทุกช่องทางอยู่ในเกณฑ์ใกล้เคียงกัน — คงมาตรการเดิมและติดตามต่อเนื่อง');

  return {
    id: 'channel', icon: '📥', name: 'รายงานแยกตามช่องทาง',
    desc: 'เปรียบเทียบปริมาณและคุณภาพเสียงราย 8 ช่องทาง พร้อมประเด็นเด่นและช่องทางที่ต้องดูแลก่อน',
    scope, total: all.total,
    headline: worst ? `${worst.name} เสียงเชิงลบสูงสุด ${pct(worst.c.neg, worst.c.total)}%` : `เสียงลูกค้า ${num(all.total)} รายการจาก ${stat.length} ช่องทาง`,
    kpis: [
      { label: 'ช่องทางที่มีข้อมูล', value: `${stat.filter(x => x.c.total > 0).length} / ${CHANNELS.length}`, note: 'ช่องทางที่มีเสียงเข้ามาในช่วงนี้', tone: 'plain' },
      { label: 'ช่องทางที่เสียงมากที่สุด', value: busiest?.name ?? '-', note: busiest ? `${num(busiest.c.total)} รายการ` : '-', tone: 'plain' },
      { label: 'เชิงลบหนาแน่นที่สุด', value: worst?.name ?? '-', note: worst ? `เชิงลบ ${pct(worst.c.neg, worst.c.total)}%` : '-', tone: 'bad' },
      { label: 'เชิงบวกสูงที่สุด', value: best?.name ?? '-', note: best ? `เชิงบวก ${pct(best.c.pos, best.c.total)}%` : '-', tone: 'good' },
    ],
    sections: [
      {
        head: 'บทสรุป', paras: [
          `ช่วง ${scope} มีเสียงลูกค้าเข้ามารวม ${num(all.total)} รายการ กระจายอยู่ใน ${stat.filter(x => x.c.total > 0).length} ช่องทางจากทั้งหมด ${CHANNELS.length} ช่องทาง.`,
          `ภาพรวมทุกช่องทางแบ่งเป็นเชิงบวก ${pct(all.pos, all.total)}% · เป็นกลาง ${pct(all.neu, all.total)}% · เชิงลบ ${pct(all.neg, all.total)}% ` +
            `การเปรียบเทียบสัดส่วนเชิงลบรายช่องทางด้านล่างคิดเฉพาะช่องทางที่มีอย่างน้อย 20 รายการ เพื่อไม่ให้ช่องทางที่มีข้อมูลน้อยได้เปอร์เซ็นต์สูงเกินจริง.`,
        ],
      },
      { head: 'ข้อสังเกตรายช่องทาง', paras: [], bullets: obs },
      { head: 'ข้อเสนอแนะ', paras: [], bullets: rec },
    ],
    charts: [
      {
        title: 'ปริมาณและคุณภาพเสียงรายช่องทาง', note: 'ความยาวแถบ = จำนวนรวม · สีในแถบ = สัดส่วนอารมณ์ · ตัวเลขท้ายแถบ = จำนวนและ %เชิงลบ',
        svg: svgStackBars(stat.slice().sort((a, b) => b.c.total - a.c.total)
          .map(x => ({ label: x.name, pos: x.c.pos, neu: x.c.neu, neg: x.c.neg } as StackRow))),
      },
      {
        title: 'ช่องทางเรียงตามจำนวนเสียงเชิงลบ', note: 'ใช้จำนวนจริง ไม่ใช่เปอร์เซ็นต์ — ช่องทางที่มีข้อมูลน้อยจะไม่ถูกดันขึ้นมาผิดอันดับ',
        svg: svgRankBars(stat.filter(x => x.c.neg > 0).sort((a, b) => b.c.neg - a.c.neg).slice(0, 8)
          .map(x => ({ label: x.name, value: x.c.neg, note: `จาก ${num(x.c.total)} รายการ (${pct(x.c.neg, x.c.total)}%)`, valueText: num(x.c.neg) } as RankRow))),
      },
    ],
    tables: [
      {
        title: 'สรุปรายช่องทาง', sheet: 'รายช่องทาง',
        cols: ['ช่องทาง', 'จำนวน', '%ของทั้งหมด', 'เชิงบวก', 'เป็นกลาง', 'เชิงลบ', '%เชิงลบ', 'เร่งด่วนสูง', 'ประเด็นที่พบบ่อยที่สุด', 'ช่วงก่อนหน้า'],
        rows: stat.slice().sort((a, b) => b.c.total - a.c.total).map(x => [
          x.name, x.c.total, pct(x.c.total, all.total) + '%', x.c.pos, x.c.neu, x.c.neg,
          pct(x.c.neg, x.c.total) + '%', x.c.high, x.topTopic, x.prev.total,
        ]),
      },
      {
        title: 'ประเด็นเด่นรายช่องทาง (5 อันดับแรกของแต่ละช่องทาง)', sheet: 'ประเด็นรายช่องทาง',
        cols: ['ช่องทาง', 'อันดับ', 'ประเด็น', 'จำนวน', 'เชิงลบ'],
        rows: stat.flatMap(x => {
          const rs = fr.filter(r => r.channel === x.name);
          const tp = groupBy(rs, r => r.topic);
          return Object.entries(tp).sort((a, b) => b[1].length - a[1].length).slice(0, 5)
            .map(([t, arr], i) => [x.name, i + 1, t, arr.length, arr.filter(r => r.sentiment === 'Negative').length]);
        }),
      },
    ],
    highlights: [
      { label: 'ช่องทางที่เสียงมากที่สุด', value: busiest?.name ?? '-', sub: busiest ? `${num(busiest.c.total)} รายการ` : '', tone: 'plain' },
      { label: 'เชิงลบหนาแน่นที่สุด', value: worst?.name ?? '-', sub: worst ? `เชิงลบ ${pct(worst.c.neg, worst.c.total)}%` : '', tone: 'bad' },
      { label: 'เชิงบวกสูงที่สุด', value: best?.name ?? '-', sub: best ? `เชิงบวก ${pct(best.c.pos, best.c.total)}%` : '', tone: 'good' },
      { label: 'เร่งด่วนระดับสูง', value: num(all.high), sub: 'ทุกช่องทางรวมกัน', tone: 'warn' },
    ],
  };
}

// ============================================================
// 3) รายงานประเด็นเฝ้าระวัง (เกิดซ้ำ ≥ 3 ครั้ง)
// ============================================================
export function buildWatch(fr: Voc[], prev: Voc[], scope: string): ReportDoc {
  const all = countOf(fr);
  const map = scoreTopics(fr);
  const tp = groupBy(fr, r => r.topic);
  const prevCount = groupBy(prev, r => r.topic);

  const items = Object.entries(tp)
    .filter(([t, rs]) => t && t !== '-' && rs.length >= 3)
    .map(([t, rs]) => {
      const c = countOf(rs);
      const sc = map.get(t);
      const owners = groupBy(rs, r => r.owner);
      const owner = Object.entries(owners).sort((a, b) => b[1].length - a[1].length)[0]?.[0] ?? '-';
      const chs = Array.from(new Set(rs.map(r => r.channel))).filter(Boolean);
      const before = prevCount[t]?.length ?? 0;
      return { topic: t, c, sc, owner, chs, before, score: sc?.score ?? 0 };
    })
    .sort((a, b) => b.score - a.score || b.c.total - a.c.total);

  const affected = items.reduce((a, x) => a + x.c.total, 0);
  const risingList = items.filter(x => x.before > 0 && x.c.total > x.before);
  const newList = items.filter(x => x.before === 0 && prev.length > 0);
  const top = items[0];

  const obs: string[] = [];
  if (top) obs.push(`ประเด็นอันดับหนึ่งคือ “${top.topic}” พบ ${num(top.c.total)} ครั้ง (เชิงลบ ${num(top.c.neg)} ครั้ง) คะแนนความสำคัญ ${top.score.toFixed(2)}/5.00 ระดับ${scoreBand(top.score).label} — ฝ่ายที่เกี่ยวข้องมากที่สุดคือ ${top.owner}`);
  obs.push(`ประเด็นเฝ้าระวังทั้งหมด ${num(items.length)} ประเด็น ครอบคลุมเสียงลูกค้า ${num(affected)} รายการ คิดเป็น ${pct(affected, all.total)}% ของเสียงทั้งหมดในช่วงนี้`);
  if (risingList.length) obs.push(`มี ${num(risingList.length)} ประเด็นที่จำนวนครั้งเพิ่มขึ้นจากช่วงก่อนหน้า — เด่นที่สุดคือ “${risingList[0].topic}” จาก ${risingList[0].before} เป็น ${risingList[0].c.total} ครั้ง`);
  if (newList.length) obs.push(`มี ${num(newList.length)} ประเด็นที่ไม่เคยพบในช่วงก่อนหน้า — ประเด็นใหม่ที่ควรจับตาคือ “${newList[0].topic}” (${newList[0].c.total} ครั้ง)`);
  const multiCh = items.filter(x => x.chs.length >= 3);
  if (multiCh.length) obs.push(`มี ${num(multiCh.length)} ประเด็นที่ลูกค้าพูดถึงข้ามตั้งแต่ 3 ช่องทางขึ้นไป แสดงว่าเป็นปัญหาเชิงระบบ ไม่ใช่ปัญหาเฉพาะช่องทางใดช่องทางหนึ่ง`);

  const rec: string[] = [];
  items.slice(0, 3).forEach((x, i) => rec.push(`ลำดับที่ ${i + 1}: มอบหมาย ${x.owner} เป็นเจ้าภาพประเด็น “${x.topic}” (${num(x.c.total)} ครั้ง · เชิงลบ ${pct(x.c.neg, x.c.total)}%) พร้อมกำหนดวันแล้วเสร็จ`));
  if (multiCh.length) rec.push('ประเด็นที่พบข้ามหลายช่องทางควรแก้ที่ต้นเหตุเชิงระบบ แล้วสื่อสารผลกลับทุกช่องทางพร้อมกัน');
  if (risingList.length) rec.push('ตั้งการติดตามรายสัปดาห์สำหรับประเด็นที่จำนวนครั้งกำลังเพิ่มขึ้น เพื่อไม่ให้ลุกลามข้ามรอบรายงาน');
  if (rec.length === 0) rec.push('ยังไม่มีประเด็นที่เกิดซ้ำถึงเกณฑ์เฝ้าระวังในช่วงนี้');

  return {
    id: 'watch', icon: '🔁', name: 'รายงานประเด็นเฝ้าระวัง',
    desc: 'ประเด็นที่เกิดซ้ำตั้งแต่ 3 ครั้งขึ้นไป จัดอันดับด้วยโมเดล 4 ปัจจัย พร้อมเจ้าภาพและแนวโน้มเทียบช่วงก่อน',
    scope, total: all.total,
    headline: top ? `ประเด็นเฝ้าระวัง ${num(items.length)} เรื่อง — อันดับ 1 “${top.topic}” ${num(top.c.total)} ครั้ง` : 'ยังไม่มีประเด็นที่เข้าเกณฑ์เฝ้าระวัง',
    kpis: [
      { label: 'ประเด็นเฝ้าระวัง', value: num(items.length), note: 'เกิดซ้ำ ≥ 3 ครั้ง', tone: 'warn' },
      { label: 'เสียงที่เกี่ยวข้อง', value: num(affected), note: `${pct(affected, all.total)}% ของเสียงทั้งหมด`, tone: 'plain' },
      { label: 'ประเด็นที่กำลังเพิ่มขึ้น', value: num(risingList.length), note: 'เทียบกับช่วงก่อนหน้า', tone: 'bad' },
      { label: 'ประเด็นข้ามหลายช่องทาง', value: num(multiCh.length), note: 'พบตั้งแต่ 3 ช่องทางขึ้นไป', tone: 'warn' },
    ],
    sections: [
      {
        head: 'บทสรุป', paras: [
          `ช่วง ${scope} พบประเด็นที่เกิดซ้ำตั้งแต่ 3 ครั้งขึ้นไปจำนวน ${num(items.length)} ประเด็น ครอบคลุมเสียงลูกค้า ${num(affected)} รายการ (${pct(affected, all.total)}% ของทั้งหมด).`,
          'การจัดอันดับใช้โมเดล 4 ปัจจัยชุดเดียวกับหน้าจัดลำดับ — ความถี่ (25%) · ความรุนแรง (35%) · แนวโน้ม (20%) · ผลกระทบด้านความปลอดภัย/การเงิน/กฎหมาย (20%) จึงไม่ได้เรียงตามจำนวนครั้งอย่างเดียว.',
        ],
      },
      { head: 'ข้อสังเกต', paras: [], bullets: obs },
      { head: 'ข้อเสนอแนะเชิงปฏิบัติ', paras: [], bullets: rec },
    ],
    charts: [
      {
        title: 'ประเด็นเฝ้าระวังเรียงตามคะแนนความสำคัญ', note: 'คะแนนเต็ม 5.00 · ตัวเลขในวงเล็บคือจำนวนครั้งที่พบ',
        svg: svgRankBars(items.slice(0, 10).map(x => ({
          label: x.topic, value: x.score, valueText: x.score.toFixed(2),
          note: `${num(x.c.total)} ครั้ง · เชิงลบ ${pct(x.c.neg, x.c.total)}% · ${x.owner}`,
        } as RankRow))),
      },
      {
        title: 'ประเด็นเฝ้าระวังเรียงตามจำนวนเสียงเชิงลบ', note: 'มุมมองเสริม — บางประเด็นครั้งไม่เยอะแต่ลบหนัก',
        svg: svgRankBars(items.slice().sort((a, b) => b.c.neg - a.c.neg).slice(0, 10).map(x => ({
          label: x.topic, value: x.c.neg, valueText: num(x.c.neg),
          note: `จาก ${num(x.c.total)} ครั้ง (${pct(x.c.neg, x.c.total)}%)`,
        } as RankRow))),
      },
    ],
    tables: [
      {
        title: 'ประเด็นเฝ้าระวังทั้งหมด', sheet: 'ประเด็นเฝ้าระวัง',
        cols: ['อันดับ', 'ประเด็น', 'จำนวนครั้ง', 'เชิงลบ', '%เชิงลบ', 'เร่งด่วนสูง', 'คะแนน', 'ระดับ', 'ช่วงก่อนหน้า', 'แนวโน้ม', 'ฝ่ายที่เกี่ยวข้อง', 'ช่องทางที่พบ'],
        rows: items.map((x, i) => [
          i + 1, x.topic, x.c.total, x.c.neg, pct(x.c.neg, x.c.total) + '%', x.c.high,
          x.score.toFixed(2), scoreBand(x.score).label, x.before,
          x.before === 0 ? 'ใหม่' : x.c.total > x.before ? 'เพิ่มขึ้น' : x.c.total < x.before ? 'ลดลง' : 'เท่าเดิม',
          x.owner, x.chs.join(', '),
        ]),
      },
      {
        title: 'เสียงลูกค้าของประเด็นเฝ้าระวัง 3 อันดับแรก', sheet: 'เสียงตัวอย่าง',
        cols: ['ประเด็น', 'รหัส', 'วันที่', 'ช่องทาง', 'โครงการ', 'Sentiment', 'ข้อความเสียงลูกค้า'],
        rows: items.slice(0, 3).flatMap(x =>
          fr.filter(r => r.topic === x.topic).slice(0, 15)
            .map(r => [x.topic, r.ref, r.occurredAt, r.channel, r.project, SENT_TH[r.sentiment] ?? r.sentiment, r.voice])),
      },
    ],
    highlights: [
      { label: 'ประเด็นเฝ้าระวัง', value: num(items.length), sub: 'เกิดซ้ำ ≥ 3 ครั้ง', tone: 'warn' },
      { label: 'อันดับ 1', value: top ? top.topic : '-', sub: top ? `${num(top.c.total)} ครั้ง · ${top.owner}` : '', tone: 'bad' },
      { label: 'เสียงที่เกี่ยวข้อง', value: num(affected), sub: `${pct(affected, all.total)}% ของทั้งหมด`, tone: 'plain' },
      { label: 'กำลังเพิ่มขึ้น', value: num(risingList.length), sub: 'เทียบช่วงก่อนหน้า', tone: 'bad' },
    ],
  };
}

// ============================================================
// 4) รายงานจุดแข็งที่ควรขยายผล
// ============================================================
export function buildStrength(fr: Voc[], prev: Voc[], scope: string): ReportDoc {
  const all = countOf(fr);
  const list = scoreStrengths(fr);
  const top = list[0];
  const byOwner = groupBy(fr.filter(r => r.sentiment === 'Positive'), r => r.owner);
  const ownerRank = Object.entries(byOwner).sort((a, b) => b[1].length - a[1].length).slice(0, 8);
  const byProj = groupBy(fr.filter(r => r.sentiment === 'Positive'), r => r.project);
  const projRank = Object.entries(byProj).filter(([k]) => k && k !== '-').sort((a, b) => b[1].length - a[1].length).slice(0, 8);
  const prevPos = prev.filter(r => r.sentiment === 'Positive').length;
  const dPos = delta(all.pos, prevPos);

  const obs: string[] = [];
  if (top) obs.push(`จุดแข็งอันดับหนึ่งคือ “${top.topic}” มีเสียงชื่นชม ${num(top.posCount)} ครั้ง จากทั้งหมด ${num(top.count)} ครั้งที่พูดถึง (${pct(top.posCount, top.count)}%) คะแนน ${top.score.toFixed(2)}/5.00 ระดับ${strengthBand(top.score).label}`);
  if (ownerRank[0]) obs.push(`ฝ่ายที่ได้รับคำชมมากที่สุดคือ ${ownerRank[0][0]} จำนวน ${num(ownerRank[0][1].length)} ครั้ง`);
  if (projRank[0]) obs.push(`โครงการที่ลูกค้าชื่นชมมากที่สุดคือ ${projRank[0][0]} จำนวน ${num(projRank[0][1].length)} ครั้ง`);
  obs.push(`เสียงเชิงบวกในช่วงนี้มี ${num(all.pos)} รายการ (${pct(all.pos, all.total)}% ของทั้งหมด)` + (dPos.text ? ` ${dPos.text}` : ''));
  const rising = list.filter(x => x.tl >= 4).slice(0, 3);
  if (rising.length) obs.push(`จุดแข็งที่คำชมกำลังเพิ่มขึ้นเร็ว: ${rising.map(x => `“${x.topic}”`).join(' · ')}`);

  const rec: string[] = [];
  if (top) rec.push(`นำ “${top.topic}” ไปทำเป็นมาตรฐานการทำงาน แล้วขยายผลไปยังโครงการและช่องทางอื่น`);
  if (ownerRank[0]) rec.push(`ส่งรายงานคำชมให้ ${ownerRank[0][0]} เพื่อชื่นชมทีมงาน และใช้เป็นข้อมูลประกอบการประเมินผลการปฏิบัติงาน`);
  if (projRank[0]) rec.push(`ถอดบทเรียนจากโครงการ ${projRank[0][0]} ว่าทำอะไรจึงได้คำชม แล้วทำเป็นแนวปฏิบัติกลาง`);
  rec.push('ใช้ข้อความคำชมจริงจากลูกค้าในสื่อประชาสัมพันธ์ขององค์กร (ขออนุญาตและปิดบังข้อมูลส่วนบุคคลก่อนเผยแพร่)');

  return {
    id: 'strength', icon: '🌟', name: 'รายงานจุดแข็งที่ควรขยายผล',
    desc: 'ประเด็นที่ลูกค้าชื่นชม จัดอันดับด้วยโมเดล 4 ปัจจัยด้านบวก พร้อมฝ่ายและโครงการที่ควรได้รับคำชม',
    scope, total: all.total,
    headline: top ? `จุดแข็งอันดับ 1 “${top.topic}” — ชื่นชม ${num(top.posCount)} ครั้ง` : `เสียงเชิงบวก ${num(all.pos)} รายการ (${pct(all.pos, all.total)}%)`,
    kpis: [
      { label: 'เสียงเชิงบวก', value: num(all.pos), note: `${pct(all.pos, all.total)}% ของทั้งหมด`, tone: 'good' },
      { label: 'จุดแข็งที่จัดอันดับได้', value: num(list.length), note: 'ประเด็นที่มีเสียงชื่นชม', tone: 'good' },
      { label: 'ฝ่ายที่ได้รับคำชมมากที่สุด', value: ownerRank[0]?.[0] ?? '-', note: ownerRank[0] ? `${num(ownerRank[0][1].length)} ครั้ง` : '-', tone: 'plain' },
      { label: 'เทียบช่วงก่อนหน้า', value: dPos.dir === 'none' ? '-' : `${dPos.dir === 'up' ? '▲' : dPos.dir === 'down' ? '▼' : '='} ${dPos.pct}%`, note: prevPos ? `ช่วงก่อน ${num(prevPos)} รายการ` : 'ไม่มีช่วงก่อนหน้าให้เทียบ', tone: dPos.dir === 'up' ? 'good' : 'plain' },
    ],
    sections: [
      {
        head: 'บทสรุป', paras: [
          `ช่วง ${scope} มีเสียงเชิงบวก ${num(all.pos)} รายการ คิดเป็น ${pct(all.pos, all.total)}% ของเสียงทั้งหมด ${num(all.total)} รายการ` + (dPos.text ? ` ${dPos.text}` : '') + '.',
          'ระบบ VOC ไม่ได้ฟังเฉพาะเสียงลบ — เสียงบวกบอกว่าอะไรที่องค์กรทำได้ดีจนควรรักษาไว้และขยายผล รายงานนี้จึงจัดอันดับด้วยโมเดล 4 ปัจจัยด้านบวก: ความถี่ (25%) · ความเข้มของคำชม (35%) · แนวโน้ม (20%) · การบอกต่อ (20%).',
        ],
      },
      { head: 'ข้อสังเกต', paras: [], bullets: obs },
      { head: 'ข้อเสนอแนะ', paras: [], bullets: rec },
    ],
    charts: [
      {
        title: 'จุดแข็งเรียงตามคะแนน', note: 'คะแนนเต็ม 5.00 · บรรทัดรองคือจำนวนคำชมและฝ่ายที่เกี่ยวข้อง',
        svg: svgRankBars(list.slice(0, 10).map(x => ({
          label: x.topic, value: x.score, valueText: x.score.toFixed(2),
          note: `ชื่นชม ${num(x.posCount)} ครั้ง · ${x.owner || '-'}`,
        } as RankRow)), { hue: 'green' }),
      },
      {
        title: 'ฝ่ายที่ได้รับคำชมมากที่สุด', note: 'นับจากเสียงเชิงบวกที่ระบบจับคู่ฝ่ายผู้รับผิดชอบไว้',
        svg: svgRankBars(ownerRank.map(([k, rs]) => ({ label: k, value: rs.length, valueText: num(rs.length) } as RankRow)), { hue: 'green' }),
      },
    ],
    tables: [
      {
        title: 'จุดแข็งจัดอันดับ', sheet: 'จุดแข็ง',
        cols: ['อันดับ', 'ประเด็น', 'เสียงชื่นชม', 'พูดถึงทั้งหมด', '%บวก', 'ความถี่', 'ความเข้มบวก', 'แนวโน้ม', 'การบอกต่อ', 'คะแนน', 'ระดับ', 'ฝ่ายที่ควรได้รับคำชม'],
        rows: list.map((x, i) => [i + 1, x.topic, x.posCount, x.count, pct(x.posCount, x.count) + '%', x.fl, x.pl, x.tl, x.al, x.score.toFixed(2), strengthBand(x.score).label, x.owner || '-']),
      },
      {
        title: 'คำชมรายเรื่อง', sheet: 'คำชมรายเรื่อง',
        cols: ['รหัส', 'วันที่', 'ช่องทาง', 'โครงการ', 'ประเด็น', 'ข้อความที่ลูกค้าชม', 'ฝ่ายที่เกี่ยวข้อง'],
        rows: fr.filter(r => r.sentiment === 'Positive').map(r => [r.ref, r.occurredAt, r.channel, r.project, r.topic, r.voice, r.owner]),
      },
      {
        title: 'โครงการที่ได้รับคำชม', sheet: 'รายโครงการ',
        cols: ['โครงการ', 'คำชม', 'เสียงทั้งหมดของโครงการ', '%บวก'],
        rows: projRank.map(([k, rs]) => {
          const tot = fr.filter(r => r.project === k).length;
          return [k, rs.length, tot, pct(rs.length, tot) + '%'];
        }),
      },
    ],
    highlights: [
      { label: 'เสียงเชิงบวก', value: num(all.pos), sub: `${pct(all.pos, all.total)}% ของทั้งหมด`, tone: 'good' },
      { label: 'จุดแข็งอันดับ 1', value: top ? top.topic : '-', sub: top ? `ชื่นชม ${num(top.posCount)} ครั้ง` : '', tone: 'good' },
      { label: 'ฝ่ายที่ถูกชมมากสุด', value: ownerRank[0]?.[0] ?? '-', sub: ownerRank[0] ? `${num(ownerRank[0][1].length)} ครั้ง` : '', tone: 'plain' },
      { label: 'โครงการที่ถูกชมมากสุด', value: projRank[0]?.[0] ?? '-', sub: projRank[0] ? `${num(projRank[0][1].length)} ครั้ง` : '', tone: 'plain' },
    ],
  };
}

// ============================================================
// รายงานตารางล้วน (ยังคงไว้ครบ — ใช้ส่งต่อให้หน่วยงาน ไม่ต้องมีบทสรุป)
// ============================================================
export interface PlainReport { id: string; icon: string; name: string; desc: string; build: () => TableSpec }
export function plainReports(fr: Voc[]): PlainReport[] {
  const all = countOf(fr);
  const grpTable = (col: string, key: (r: Voc) => string, extraType = false): TableSpec => {
    const m = groupBy(fr, key);
    return {
      title: col, sheet: col.slice(0, 28),
      cols: extraType ? [col, 'ประเภทโครงการ', 'จำนวน', '%บวก', '%กลาง', '%ลบ', 'เร่งด่วนสูง'] : [col, 'จำนวน', '%บวก', '%กลาง', '%ลบ', 'เร่งด่วนสูง'],
      rows: Object.entries(m).sort((a, b) => b[1].length - a[1].length).map(([k, rs]) => {
        const c = countOf(rs);
        const base: (string | number)[] = [k];
        if (extraType) base.push(rs[0]?.projectType || '-');
        return [...base, c.total, pct(c.pos, c.total) + '%', pct(c.neu, c.total) + '%', pct(c.neg, c.total) + '%', c.high];
      }),
    };
  };
  return [
    {
      id: 'all', icon: '💬', name: 'รายงานเสียงลูกค้าทั้งหมด', desc: 'ข้อมูล VOC รายเรื่องทุกคอลัมน์ พร้อมผลวิเคราะห์และมิติทั้ง 4',
      build: () => ({
        title: 'เสียงลูกค้าทั้งหมด', sheet: 'เสียงลูกค้า',
        cols: ['รหัส', 'วันที่เกิดเรื่อง', 'ช่องทาง', 'แหล่ง', 'ประเภทโครงการ', 'โครงการ', 'ประเด็น', 'เสียงลูกค้า', 'Sentiment', 'ความเชื่อมั่น AI', 'ยืนยันโดยเจ้าหน้าที่', 'ความรุนแรง', 'ฝ่ายที่เกี่ยวข้อง', 'มิติ 1 วงจรชีวิต', 'มิติ 2 ผลิตภัณฑ์/บริการ', 'มิติ 3 การสนับสนุน', 'มิติ 4 กลุ่มลูกค้า'],
        rows: fr.map(r => [
          r.ref, r.occurredAt, r.channel, r.source, r.projectType, r.project, r.topic, r.voice,
          SENT_TH[r.sentiment] ?? r.sentiment, r.sentConf + '%', r.sentManual ? 'ใช่' : 'ไม่', PRIO_TH[r.priority] ?? r.priority, r.owner,
          JOURNEY_TH[r.journey] ?? r.journey, r.catProduct, dim3Cat(r), custGroupOf(r).name,
        ]),
      }),
    },
    { id: 'project', icon: '🏠', name: 'รายงานแยกตามโครงการ', desc: 'สรุปเสียงลูกค้าตามประเภทและชื่อโครงการ', build: () => grpTable('โครงการ', r => r.project, true) },
    { id: 'owner', icon: '🏢', name: 'รายงานแยกตามฝ่ายที่เกี่ยวข้อง', desc: 'ส่งให้แต่ละฝ่ายดูเฉพาะเสียงที่เกี่ยวกับตน', build: () => grpTable('ฝ่ายที่เกี่ยวข้อง', r => r.owner) },
    { id: 'journey', icon: '🔄', name: 'รายงานมิติที่ 1 วงจรชีวิตลูกค้า', desc: 'แยกตาม 6 ขั้นของเส้นทางลูกค้า', build: () => grpTable('ขั้นวงจรชีวิตลูกค้า', r => JOURNEY_TH[r.journey] ?? r.journey) },
    { id: 'dim3', icon: '🤝', name: 'รายงานมิติที่ 3 การสนับสนุนลูกค้า', desc: 'แยกตาม 9 ด้านของคุณภาพการให้บริการ', build: () => grpTable('ด้านการสนับสนุนลูกค้า', r => dim3Cat(r)) },
    { id: 'segment', icon: '👥', name: 'รายงานมิติที่ 4 กลุ่มลูกค้า', desc: 'แยกตาม 5 กลุ่มลูกค้าตามเส้นทางการเดินทาง', build: () => grpTable('กลุ่มลูกค้า', r => custGroupOf(r).name) },
    {
      id: 'sentiment', icon: '😊', name: 'รายงานแยกตาม Sentiment และความรุนแรง', desc: 'จำนวนและสัดส่วนไขว้ระหว่างอารมณ์กับระดับความรุนแรง',
      build: () => ({
        title: 'Sentiment × ความรุนแรง', sheet: 'Sentiment',
        cols: ['Sentiment', 'เร่งด่วนสูง', 'ปานกลาง', 'ต่ำ', 'รวม', 'สัดส่วน'],
        rows: (['Positive', 'Neutral', 'Negative'] as const).map(s => {
          const rs = fr.filter(r => r.sentiment === s);
          return [SENT_TH[s], rs.filter(r => r.priority === 'High').length, rs.filter(r => r.priority === 'Medium').length,
            rs.filter(r => r.priority === 'Low').length, rs.length, pct(rs.length, all.total) + '%'];
        }),
      }),
    },
  ];
}
