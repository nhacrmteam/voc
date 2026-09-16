// lib/reportChart.ts — ตัวสร้างกราฟเป็น "สตริง SVG" (ไม่พึ่ง DOM · ไม่มีไลบรารีกราฟ)
//
// ทำไมต้องคืนเป็นสตริง ไม่ใช่ React element
//   กราฟชุดเดียวกันต้องไปโผล่ 3 ที่: บนหน้าเว็บ · ในหน้าต่างพิมพ์ PDF · ในไฟล์อินโฟกราฟิก PNG
//   ถ้าเขียนเป็น React element จะใช้ซ้ำในอีกสองที่ไม่ได้ ต้องเขียนกราฟเดียวกันสามรอบแล้วมันจะเพี้ยนกันเอง
//   คืนเป็นสตริงจึงเอาไปยัดได้ทั้ง dangerouslySetInnerHTML · document.write · XMLSerializer
//
// ⚠️ กติกาที่ห้ามพลาด (ไม่งั้นไฟล์ PNG จะพัง)
//   1) ห้ามใช้ <foreignObject> หรือ HTML ใน SVG — ตอนแปลงเป็นรูปภาพ เบราว์เซอร์จะไม่วาดให้ ต้องเป็น <text> ล้วน
//   2) ห้ามพึ่งฟอนต์จาก Google Fonts — ตอนแปลงเป็นรูป SVG ถูกวาดในบริบทแยก มองไม่เห็นฟอนต์ของหน้าเว็บ
//      จึงต้องไล่ฟอนต์ระบบที่มีอยู่ในเครื่องเป็นตัวสำรอง (Windows = Leelawadee UI / Tahoma)
//   3) ห้ามใช้ CSS variable (var(--ink)) — SVG ที่ถูกวาดเป็นรูปไม่เห็นตัวแปรของหน้าเว็บ ต้องใส่สีตรง ๆ
//
// เรื่องสี (ตรวจด้วยเครื่องมือแล้ว ไม่ได้กะเอา)
//   ชุดสีอารมณ์ เขียว/เหลือง/แดง ผ่านเกณฑ์ แต่มีเงื่อนไขบังคับ 2 ข้อ
//     - เขียวกับเหลืองห่างกันน้อยสำหรับคนตาบอดสี (ΔE 7.0) → **ต้องมีป้ายกำกับ + เว้นช่องระหว่างแท่งเสมอ**
//     - เหลืองความคมชัดต่ำกว่า 3:1 เทียบพื้นขาว → **ต้องมีตัวเลข/ตารางกำกับเสมอ** ห้ามสื่อด้วยสีอย่างเดียว
//   ทุกฟังก์ชันในไฟล์นี้จึงใส่ตัวเลขกำกับและเว้นช่อง 2px ให้อยู่แล้ว — อย่าถอดออก

export const FONT = "'Sarabun','Leelawadee UI','Noto Sans Thai',Tahoma,sans-serif";
export const INK = '#0f172a';
export const MUTED = '#556274';
export const LINE = '#dfe6f0';
export const NAVY = '#1f3a93';
export const SENT = { pos: '#16a34a', neu: '#f59e0b', neg: '#dc2626' };
export const SENT_TH = { pos: 'เชิงบวก', neu: 'เป็นกลาง', neg: 'เชิงลบ' };

/** หนีอักขระพิเศษของ XML — ชื่อโครงการ/ประเด็นของจริงมี & และ < ปนมาได้ ถ้าไม่หนีไฟล์ SVG จะพัง */
export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c] as string));
}
const n = (v: number) => (Math.round(v * 100) / 100).toString();
export const fmt = (v: number) => v.toLocaleString('en-US');
const pctOf = (v: number, t: number) => (t ? Math.round(v / t * 100) : 0);

/** ตัดข้อความยาวให้พอดีความกว้าง (SVG ไม่มี text-overflow ต้องตัดเอง) */
export function clip(s: string, max: number): string {
  const t = String(s ?? '');
  return t.length <= max ? t : t.slice(0, max - 1) + '…';
}

function txt(x: number, y: number, s: string, o: { size?: number; fill?: string; weight?: number; anchor?: string } = {}) {
  return `<text x="${n(x)}" y="${n(y)}" font-family="${FONT}" font-size="${o.size ?? 12}"` +
    ` fill="${o.fill ?? INK}"${o.weight ? ` font-weight="${o.weight}"` : ''}` +
    `${o.anchor ? ` text-anchor="${o.anchor}"` : ''}>${esc(s)}</text>`;
}
export const svgText = txt;

/** ห่อชิ้นส่วนให้เป็นไฟล์ SVG สมบูรณ์ (ใช้ตอนเซฟเป็นรูป) */
export function svgDoc(w: number, h: number, inner: string, bg = '#ffffff'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="${bg}"/>${inner}</svg>`;
}

// ============================================================
// โดนัทสัดส่วนอารมณ์ — มีตัวเลขกลางวง + คำอธิบายพร้อมจำนวนจริง
// ============================================================
export function svgSentDonut(pos: number, neu: number, neg: number, opt: { size?: number; title?: string } = {}): string {
  const size = opt.size ?? 250;
  const total = pos + neu + neg;
  const cx = 86, cy = 86, r = 62, sw = 26;
  const segs = [
    { v: pos, c: SENT.pos, l: SENT_TH.pos },
    { v: neu, c: SENT.neu, l: SENT_TH.neu },
    { v: neg, c: SENT.neg, l: SENT_TH.neg },
  ].filter(s => s.v > 0);

  const circ = 2 * Math.PI * r;
  let acc = 0;
  let ring = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#eef2f7" stroke-width="${sw}"/>`;
  segs.forEach(s => {
    const frac = s.v / (total || 1);
    // เว้นช่อง 2px ระหว่างส่วน — บังคับตามผลตรวจสี (เขียว/เหลืองแยกยากสำหรับคนตาบอดสี)
    const len = Math.max(0, frac * circ - 2);
    ring += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.c}" stroke-width="${sw}"` +
      ` stroke-dasharray="${n(len)} ${n(circ - len)}" stroke-dashoffset="${n(circ * 0.25 - acc * circ)}"` +
      ` transform="rotate(0 ${cx} ${cy})"/>`;
    acc += frac;
  });

  let legend = '';
  let ly = 44;
  [{ v: pos, c: SENT.pos, l: SENT_TH.pos }, { v: neu, c: SENT.neu, l: SENT_TH.neu }, { v: neg, c: SENT.neg, l: SENT_TH.neg }]
    .forEach(s => {
      legend += `<rect x="186" y="${ly - 9}" width="11" height="11" rx="3" fill="${s.c}"/>`;
      legend += txt(204, ly, s.l, { size: 12.5 });
      legend += txt(size - 6, ly, `${fmt(s.v)} (${pctOf(s.v, total)}%)`, { size: 12.5, weight: 700, anchor: 'end' });
      ly += 26;
    });

  return svgDoc(size, 176,
    ring +
    txt(cx, cy + 4, fmt(total), { size: 26, weight: 800, anchor: 'middle' }) +
    txt(cx, cy + 22, 'เสียงลูกค้า', { size: 10.5, fill: MUTED, anchor: 'middle' }) +
    legend);
}

// ============================================================
// แท่งนอนซ้อนตามอารมณ์ — 1 แถว = 1 ช่องทาง/หมวด
// ============================================================
export interface StackRow { label: string; pos: number; neu: number; neg: number; note?: string }
export function svgStackBars(rows: StackRow[], opt: { width?: number; labelW?: number } = {}): string {
  const W = opt.width ?? 760, LW = opt.labelW ?? 168;
  const rowH = 34, top = 30, barH = 15;
  const H = top + rows.length * rowH + 12;
  const maxTotal = Math.max(...rows.map(r => r.pos + r.neu + r.neg), 1);
  const plotW = W - LW - 96;

  // คำอธิบายสี — ต้องมีเสมอเมื่อมีตั้งแต่ 2 ชุดขึ้นไป
  let out = '';
  let lx = LW;
  ([['pos', SENT_TH.pos], ['neu', SENT_TH.neu], ['neg', SENT_TH.neg]] as const).forEach(([k, l]) => {
    out += `<rect x="${lx}" y="6" width="10" height="10" rx="3" fill="${SENT[k]}"/>` + txt(lx + 15, 15, l, { size: 11.5, fill: MUTED });
    lx += 78;
  });

  rows.forEach((r, i) => {
    const y = top + i * rowH;
    const tot = r.pos + r.neu + r.neg;
    const w = tot / maxTotal * plotW;
    out += txt(0, y + 12, clip(r.label, 24), { size: 12.5, weight: 600 });
    if (r.note) out += txt(0, y + 26, clip(r.note, 30), { size: 10.5, fill: MUTED });
    let x = LW;
    ([['pos', r.pos], ['neu', r.neu], ['neg', r.neg]] as const).forEach(([k, v]) => {
      if (v <= 0) return;
      const sw = Math.max(0, v / (tot || 1) * w - 2);   // เว้นช่อง 2px ระหว่างส่วน
      out += `<rect x="${n(x)}" y="${y}" width="${n(sw)}" height="${barH}" rx="3" fill="${SENT[k]}"/>`;
      x += sw + 2;
    });
    // ตัวเลขกำกับท้ายแท่ง — บังคับตามผลตรวจสี ห้ามสื่อด้วยสีอย่างเดียว
    out += txt(LW + w + 8, y + 12, `${fmt(tot)} · ลบ ${pctOf(r.neg, tot)}%`, { size: 11.5, fill: MUTED });
  });
  return svgDoc(W, H, out);
}

// ============================================================
// แท่งนอนจัดอันดับ — ใช้กับประเด็นเฝ้าระวัง / จุดแข็ง
// สีเดียวไล่เข้ม→อ่อนตามอันดับ (magnitude = ไล่เฉดสีเดียว ห้ามใช้หลายสี)
// ============================================================
export interface RankRow { label: string; value: number; note?: string; valueText?: string }
export function svgRankBars(rows: RankRow[], opt: { width?: number; labelW?: number; hue?: 'navy' | 'green' } = {}): string {
  const W = opt.width ?? 760, LW = opt.labelW ?? 250;
  const rowH = 32, top = 8, barH = 14;
  const H = top + rows.length * rowH + 8;
  const max = Math.max(...rows.map(r => r.value), 1);
  const plotW = W - LW - 86;
  const ramp = opt.hue === 'green'
    ? ['#14532d', '#166534', '#15803d', '#16a34a', '#22c55e', '#4ade80', '#86efac', '#bbf7d0']
    : ['#1e3a8a', '#1f3a93', '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'];

  let out = '';
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    const w = Math.max(2, r.value / max * plotW);
    out += txt(0, y + 11, `${i + 1}. ${clip(r.label, 28)}`, { size: 12.5, weight: 600 });
    if (r.note) out += txt(14, y + 25, clip(r.note, 40), { size: 10.5, fill: MUTED });
    out += `<rect x="${LW}" y="${y}" width="${n(w)}" height="${barH}" rx="3" fill="${ramp[Math.min(i, ramp.length - 1)]}"/>`;
    out += txt(LW + w + 8, y + 11, r.valueText ?? fmt(r.value), { size: 12, weight: 700 });
  });
  return svgDoc(W, H, out);
}

// ============================================================
// เส้นแนวโน้มรายเดือน — เส้นเดียว ไม่มีแกนคู่ (ห้ามมีสองสเกลในกราฟเดียว)
// ============================================================
export interface TrendPt { label: string; value: number; neg?: number }
export function svgTrend(pts: TrendPt[], opt: { width?: number; height?: number } = {}): string {
  const W = opt.width ?? 760, H = opt.height ?? 190;
  const L = 44, R = 14, T = 16, B = 34;
  const pw = W - L - R, ph = H - T - B;
  if (pts.length === 0) return svgDoc(W, H, txt(W / 2, H / 2, 'ยังไม่มีข้อมูล', { fill: MUTED, anchor: 'middle' }));
  const max = Math.max(...pts.map(p => p.value), 1);
  const x = (i: number) => L + (pts.length === 1 ? pw / 2 : i / (pts.length - 1) * pw);
  const y = (v: number) => T + ph - v / max * ph;

  let out = '';
  // เส้นกริดจาง ๆ + ป้ายแกน (แกนต้องถอยหลังฉาก ไม่แย่งสายตากับข้อมูล)
  [0, 0.5, 1].forEach(f => {
    const gy = T + ph - f * ph;
    out += `<line x1="${L}" y1="${n(gy)}" x2="${W - R}" y2="${n(gy)}" stroke="${LINE}" stroke-width="1"/>`;
    out += txt(L - 8, gy + 4, fmt(Math.round(max * f)), { size: 10.5, fill: MUTED, anchor: 'end' });
  });
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${n(x(i))},${n(y(p.value))}`).join(' ');
  out += `<path d="${d}" fill="none" stroke="${NAVY}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  // ป้ายตัวเลขเฉพาะ "จุดสูงสุดจุดเดียว" กับ "จุดล่าสุด" — ถ้าติดทุกจุดที่เท่ากับค่าสูงสุด
  // ข้อมูลที่ทุกเดือนเท่ากันจะกลายเป็นตัวเลขเรียงเต็มเส้น อ่านไม่ออก
  const peak = pts.findIndex(p => p.value === max);
  pts.forEach((p, i) => {
    out += `<circle cx="${n(x(i))}" cy="${n(y(p.value))}" r="4" fill="#fff" stroke="${NAVY}" stroke-width="2"/>`;
    if (i === peak || i === pts.length - 1) {
      const a = i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle';
      out += txt(x(i), y(p.value) - 10, fmt(p.value), { size: 11, weight: 700, anchor: a });
    }
    // ป้ายแกนล่าง: จุดแรกชิดซ้าย จุดท้ายชิดขวา ไม่งั้นตัวอักษรล้นออกนอกกรอบภาพ
    if (pts.length <= 14 || i % 2 === 0) {
      const a = i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle';
      out += txt(x(i), H - 12, p.label, { size: 10.5, fill: MUTED, anchor: a });
    }
  });
  return svgDoc(W, H, out);
}
