// lib/reportInfographic.ts — ทำรายงานหนึ่งฉบับให้เป็น "อินโฟกราฟิกแผ่นเดียว"
//
// ใช้ตอนต้องการหน้าเดียวจบสำหรับแปะสไลด์ ส่งไลน์ผู้บริหาร หรือติดบอร์ด
// ขนาด 1600×900 (อัตราส่วน 16:9) วางลง PowerPoint ได้เต็มสไลด์พอดี
//
// ⚠️ ต้องเป็น SVG ล้วน ห้ามมี <foreignObject>/HTML — ไม่งั้นตอนแปลงเป็น PNG เบราว์เซอร์จะไม่วาดให้
// ⚠️ SVG ไม่มีการตัดบรรทัดอัตโนมัติ — ข้อความทุกชิ้นต้องกำหนดความยาวสูงสุดเอง (ใช้ wrap()/clip())

import type { ReportDoc } from './report';
import { FONT, INK, MUTED, NAVY, SENT, esc, clip, svgText as txt } from './reportChart';

const W = 1600, H = 900;
const TONE: Record<string, string> = { good: SENT.pos, bad: SENT.neg, warn: '#b45309', plain: NAVY };

/** ตัดข้อความยาวเป็นหลายบรรทัดด้วยมือ — SVG ไม่มี word-wrap ให้ใช้ */
function wrap(s: string, perLine: number, maxLines: number): string[] {
  const words = String(s ?? '').split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > perLine && cur) { lines.push(cur.trim()); cur = w; }
    else cur = (cur + ' ' + w).trim();
    if (lines.length === maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur.trim());
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = clip(lines[maxLines - 1], perLine);
  }
  return lines;
}

export interface InfoMeta { org?: string; system?: string; printedAt?: string }

export function buildInfographicSvg(doc: ReportDoc, meta: InfoMeta = {}): string {
  const org = meta.org ?? 'การเคหะแห่งชาติ';
  const system = meta.system ?? 'ระบบรับฟังเสียงลูกค้า (Voice of Customer)';
  const printedAt = meta.printedAt ?? '';
  let s = '';

  // ---------- พื้นหลัง + แถบหัว ----------
  s += `<rect width="${W}" height="${H}" fill="#f4f7fc"/>`;
  s += `<rect width="${W}" height="118" fill="${NAVY}"/>`;
  s += `<rect x="0" y="118" width="${W}" height="4" fill="#f59e0b"/>`;
  // ตราสัญลักษณ์อย่างง่าย (วาดเอง — ไม่ดึงรูปจากภายนอก เพราะตอนแปลงเป็น PNG รูปภายนอกจะไม่ถูกโหลด)
  s += `<rect x="44" y="30" width="58" height="58" rx="14" fill="#ffffff"/>`;
  s += `<path d="M58 74 L58 50 L73 40 L88 50 L88 74 Z" fill="none" stroke="${NAVY}" stroke-width="4" stroke-linejoin="round"/>`;
  s += `<line x1="73" y1="56" x2="73" y2="74" stroke="${NAVY}" stroke-width="4"/>`;
  s += txt(120, 52, org, { size: 21, weight: 800, fill: '#ffffff' });
  s += txt(120, 76, system, { size: 13.5, fill: '#c7d2fe' });
  s += txt(W - 44, 52, doc.icon + ' ' + doc.name, { size: 19, weight: 700, fill: '#ffffff', anchor: 'end' });
  s += txt(W - 44, 76, doc.scope, { size: 13, fill: '#c7d2fe', anchor: 'end' });

  // ---------- พาดหัว ----------
  const head = wrap(doc.headline, 74, 2);
  head.forEach((l, i) => { s += txt(44, 172 + i * 34, l, { size: 27, weight: 800, fill: INK }); });
  const headBottom = 172 + head.length * 34;

  // ---------- การ์ดตัวเลขเด่น 4 ใบ ----------
  const tileY = headBottom + 12, tileH = 128, gap = 18;
  const tileW = (W - 88 - gap * 3) / 4;
  doc.highlights.slice(0, 4).forEach((h, i) => {
    const x = 44 + i * (tileW + gap);
    const col = TONE[h.tone ?? 'plain'] ?? NAVY;
    s += `<rect x="${x}" y="${tileY}" width="${tileW}" height="${tileH}" rx="14" fill="#ffffff" stroke="#e2e8f0"/>`;
    s += `<rect x="${x}" y="${tileY}" width="${tileW}" height="5" rx="2.5" fill="${col}"/>`;
    s += txt(x + 20, tileY + 34, clip(h.label, 30), { size: 13, fill: MUTED, weight: 600 });
    // ค่าที่เป็นข้อความยาว (เช่นชื่อช่องทาง) ย่อขนาดลงให้พอดีการ์ด ไม่ล้นออกนอกกรอบ
    const v = String(h.value ?? '-');
    const big = v.length <= 8;
    if (big) {
      s += txt(x + 20, tileY + 82, v, { size: 40, weight: 800, fill: col });
    } else {
      wrap(v, 26, 2).forEach((l, k) => { s += txt(x + 20, tileY + 62 + k * 23, l, { size: 18, weight: 800, fill: col }); });
    }
    if (h.sub) s += txt(x + 20, tileY + tileH - 16, clip(h.sub, 34), { size: 12, fill: MUTED });
  });

  // ---------- กราฟหลัก (ซ้าย) ----------
  const bodyY = tileY + tileH + 20;
  const bodyH = H - bodyY - 86;
  const leftW = Math.round((W - 88) * 0.58);
  s += `<rect x="44" y="${bodyY}" width="${leftW}" height="${bodyH}" rx="14" fill="#ffffff" stroke="#e2e8f0"/>`;
  const c0 = doc.charts[0];
  if (c0) {
    s += txt(68, bodyY + 32, c0.title, { size: 15.5, weight: 700 });
    if (c0.note) s += txt(68, bodyY + 52, clip(c0.note, 78), { size: 11.5, fill: MUTED });
    // ฝัง SVG ของกราฟแบบซ้อน — viewBox ของกราฟทำให้ย่อ/ขยายได้พอดีกรอบเอง
    s += `<svg x="68" y="${bodyY + 64}" width="${leftW - 48}" height="${bodyH - 88}" preserveAspectRatio="xMidYMid meet">` +
      c0.svg.replace(/^<svg[^>]*>/, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + viewBoxOf(c0.svg) + '">') + '</svg>';
  }

  // ---------- ข้อสังเกต/ข้อเสนอแนะ (ขวา) ----------
  const rx = 44 + leftW + 18, rw = W - 44 - rx;
  s += `<rect x="${rx}" y="${bodyY}" width="${rw}" height="${bodyH}" rx="14" fill="#ffffff" stroke="#e2e8f0"/>`;
  // เลือกหัวข้อ "ข้อเสนอแนะ" ก่อน ถ้าไม่มีค่อยใช้ "ข้อสังเกต" — แผ่นเดียวควรบอกว่าให้ทำอะไรต่อ
  const sec = doc.sections.find(x => x.head.includes('ข้อเสนอแนะ')) ?? doc.sections.find(x => (x.bullets?.length ?? 0) > 0);
  s += txt(rx + 24, bodyY + 32, sec ? '✔ ' + sec.head : 'สรุปประเด็น', { size: 15.5, weight: 700 });
  let by = bodyY + 62;
  const bullets = (sec?.bullets ?? sec?.paras ?? []).slice(0, 5);
  bullets.forEach((b, i) => {
    if (by > bodyY + bodyH - 34) return;
    s += `<circle cx="${rx + 30}" cy="${by - 4}" r="9" fill="#eef2ff"/>`;
    s += txt(rx + 30, by, String(i + 1), { size: 11, weight: 800, fill: NAVY, anchor: 'middle' });
    wrap(b, 46, 3).forEach((l, k) => {
      if (by > bodyY + bodyH - 20) return;
      s += txt(rx + 48, by + k * 20, l, { size: 12.5, fill: INK });
    });
    by += wrap(b, 46, 3).length * 20 + 16;
  });

  // ---------- ท้ายแผ่น ----------
  s += `<line x1="44" y1="${H - 62}" x2="${W - 44}" y2="${H - 62}" stroke="#dbe3ee" stroke-width="1"/>`;
  s += txt(44, H - 38, `คิดจากเสียงลูกค้า ${doc.total.toLocaleString('en-US')} รายการ · ${doc.scope}`, { size: 12.5, fill: MUTED });
  s += txt(44, H - 20, 'จัดทำโดยระบบ VOC การเคหะแห่งชาติ — ตัวเลขทุกตัวคิดจากข้อมูลจริงในระบบตามตัวกรองที่เลือก', { size: 11, fill: MUTED });
  if (printedAt) s += txt(W - 44, H - 38, 'ออกรายงาน ' + printedAt, { size: 12, fill: MUTED, anchor: 'end' });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">${s}</svg>`;
}

/** อ่าน viewBox จากสตริง SVG ของกราฟ เพื่อนำไปซ้อนในแผ่นอินโฟกราฟิกให้สเกลถูก */
function viewBoxOf(svg: string): string {
  const m = svg.match(/viewBox="([^"]+)"/);
  if (m) return m[1];
  const w = svg.match(/width="(\d+)"/)?.[1] ?? '760';
  const h = svg.match(/height="(\d+)"/)?.[1] ?? '300';
  return `0 0 ${w} ${h}`;
}

/** เอกสารทางการแบบพิมพ์ได้ (A4) — คืนเป็น HTML เต็มหน้าสำหรับเปิดหน้าต่างพิมพ์ */
export function buildPrintHtml(doc: ReportDoc, meta: InfoMeta = {}): string {
  const org = meta.org ?? 'การเคหะแห่งชาติ';
  const system = meta.system ?? 'ระบบรับฟังเสียงลูกค้า (Voice of Customer)';
  const printedAt = meta.printedAt ?? '';
  const kpi = doc.kpis.map(k =>
    `<div class="kpi"><div class="kl">${esc(k.label)}</div><div class="kv t-${k.tone ?? 'plain'}">${esc(k.value)}</div>` +
    (k.note ? `<div class="kn">${esc(k.note)}</div>` : '') + '</div>').join('');
  const secs = doc.sections.map(s =>
    `<section><h2>${esc(s.head)}</h2>` +
    s.paras.map(p => `<p>${esc(p)}</p>`).join('') +
    (s.bullets?.length ? '<ul>' + s.bullets.map(b => `<li>${esc(b)}</li>`).join('') + '</ul>' : '') +
    '</section>').join('');
  const charts = doc.charts.map(c =>
    `<figure><figcaption>${esc(c.title)}</figcaption>` +
    (c.note ? `<div class="fnote">${esc(c.note)}</div>` : '') + c.svg + '</figure>').join('');
  const tables = doc.tables.map(t =>
    `<section class="tbl"><h2>${esc(t.title)}</h2><table><thead><tr>` +
    t.cols.map(c => `<th>${esc(c)}</th>`).join('') + '</tr></thead><tbody>' +
    t.rows.slice(0, 400).map(r => '<tr>' + r.map(c => `<td>${esc(c)}</td>`).join('') + '</tr>').join('') +
    '</tbody></table>' +
    (t.rows.length > 400 ? `<div class="fnote">แสดง 400 แถวแรกจากทั้งหมด ${t.rows.length.toLocaleString('en-US')} แถว — ดาวน์โหลด Excel เพื่อดูครบทุกแถว</div>` : '') +
    '</section>').join('');

  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(doc.name)} — ${esc(doc.scope)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  @page{size:A4;margin:14mm 12mm}
  *{box-sizing:border-box}
  body{font-family:${FONT};color:${INK};margin:0;font-size:12px;line-height:1.75}
  .cover{border-bottom:3px solid ${NAVY};padding-bottom:14px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:flex-end;gap:16px}
  .org{font-size:17px;font-weight:800;color:${NAVY}}
  .sys{font-size:11.5px;color:${MUTED}}
  h1{font-size:21px;margin:10px 0 4px}
  .scope{font-size:12px;color:${MUTED}}
  .meta{font-size:11px;color:${MUTED};text-align:right;white-space:nowrap}
  .kpis{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 18px}
  .kpi{flex:1 1 150px;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px}
  .kl{font-size:10.5px;color:${MUTED};font-weight:600}
  .kv{font-size:22px;font-weight:800;line-height:1.25}
  .kn{font-size:10.5px;color:${MUTED}}
  .t-good{color:${SENT.pos}}.t-bad{color:${SENT.neg}}.t-warn{color:#b45309}.t-plain{color:${NAVY}}
  section{margin-bottom:16px;break-inside:avoid}
  h2{font-size:14px;margin:0 0 6px;padding-bottom:4px;border-bottom:1px solid #e2e8f0;color:${NAVY}}
  p{margin:0 0 6px;text-align:justify}
  ul{margin:4px 0 0;padding-left:18px}
  li{margin-bottom:5px}
  figure{margin:0 0 16px;break-inside:avoid}
  figcaption{font-size:13px;font-weight:700;margin-bottom:2px}
  .fnote{font-size:10.5px;color:${MUTED};margin-bottom:6px}
  table{width:100%;border-collapse:collapse;font-size:10px;table-layout:auto}
  th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:left;vertical-align:top;word-break:break-word}
  th{background:${NAVY};color:#fff;font-weight:600}
  tr:nth-child(even) td{background:#f8fafc}
  .tbl{break-before:auto}
  footer{margin-top:18px;padding-top:8px;border-top:1px solid #e2e8f0;font-size:10px;color:${MUTED}}
  @media print{ .noprint{display:none} }
</style></head><body>
<div class="cover">
  <div>
    <div class="org">${esc(org)}</div>
    <div class="sys">${esc(system)}</div>
    <h1>${esc(doc.icon)} ${esc(doc.name)}</h1>
    <div class="scope">${esc(doc.desc)}</div>
  </div>
  <div class="meta">ช่วงข้อมูล<br><b>${esc(doc.scope)}</b><br>${printedAt ? 'ออกรายงาน ' + esc(printedAt) : ''}</div>
</div>
<div class="kpis">${kpi}</div>
${secs}
${charts}
${tables}
<footer>เอกสารนี้จัดทำโดยระบบ VOC ของ${esc(org)} · ตัวเลขทุกตัวคำนวณจากข้อมูลจริงในระบบตามตัวกรองที่เลือก (${esc(doc.scope)} · ${doc.total.toLocaleString('en-US')} รายการ)</footer>
<script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script>
</body></html>`;
}
