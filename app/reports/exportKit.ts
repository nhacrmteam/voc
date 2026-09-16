'use client';
// exportKit.ts — ตัวส่งออกไฟล์ทั้งหมดของหน้ารายงาน (ทำงานฝั่งเบราว์เซอร์เท่านั้น)
//
// 4 รูปแบบ ตอบการใช้งานคนละแบบ
//   CSV          → เอาไปต่อในโปรแกรมอื่น/นำเข้าระบบอื่น
//   Excel (.xlsx) → เปิดทำงานต่อจริง หลายชีตในไฟล์เดียว
//   PDF เอกสารทางการ → แนบหนังสือราชการ มีปก บทสรุป กราฟ และตารางครบ
//   อินโฟกราฟิก PNG/PDF → แผ่นเดียวจบ สำหรับสไลด์/ผู้บริหาร/ติดบอร์ด
//
// ⚠️ ของเดิมเขียนไฟล์ .xls ที่จริง ๆ เป็น HTML เปลี่ยนนามสกุล
//    Excel จะขึ้นเตือนความปลอดภัยทุกครั้งที่เปิด ("รูปแบบไฟล์ไม่ตรงกับนามสกุล") และจัดคอลัมน์ไม่ได้
//    ไฟล์นี้จึงเขียน .xlsx จริงด้วย SheetJS ซึ่งมีอยู่ในโปรเจกต์อยู่แล้ว (หน้านำเข้าข้อมูลใช้อ่านไฟล์)

import type { ReportDoc, TableSpec } from '../../lib/report';
import { buildInfographicSvg, buildPrintHtml, type InfoMeta } from '../../lib/reportInfographic';

/** ชื่อไฟล์ที่ปลอดภัยกับ Windows (ห้ามมี \ / : * ? " < > |) */
function safeName(s: string): string {
  return String(s).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 90);
}
function saveBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---------------------------------------------------------------
// CSV
// ---------------------------------------------------------------
function csvCell(v: unknown) { return '"' + String(v ?? '').replace(/"/g, '""') + '"'; }
export function exportCSV(name: string, t: TableSpec) {
  const body = [t.cols.map(csvCell).join(','), ...t.rows.map(r => r.map(csvCell).join(','))].join('\r\n');
  // ต้องมี BOM (﻿) ไม่งั้น Excel บน Windows อ่านภาษาไทยเป็นตัวต่างดาว
  saveBlob(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8;' }), safeName(name) + '.csv');
}

// ---------------------------------------------------------------
// Excel (.xlsx จริง — หลายชีต + ความกว้างคอลัมน์)
// ---------------------------------------------------------------
export async function exportXLSX(name: string, tables: TableSpec[], head?: { doc: ReportDoc; meta: InfoMeta }) {
  const XLSX = await import('xlsx');   // โหลดตอนใช้จริงเท่านั้น ไม่ถ่วงขนาดหน้าเว็บ
  const wb = XLSX.utils.book_new();

  // ชีตแรก = บทสรุปเป็นข้อความ เพื่อให้คนเปิดไฟล์รู้ว่าอ่านอะไรอยู่ ไม่ใช่เจอตัวเลขเปล่า ๆ
  if (head) {
    const { doc } = head;
    const rows: (string | number)[][] = [
      [head.meta.org ?? 'การเคหะแห่งชาติ'], [head.meta.system ?? 'ระบบรับฟังเสียงลูกค้า (Voice of Customer)'], [],
      [doc.name], [doc.desc], ['ช่วงข้อมูล', doc.scope], ['จำนวนเสียงลูกค้า', doc.total],
      ...(head.meta.printedAt ? [['ออกรายงานเมื่อ', head.meta.printedAt] as (string | number)[]] : []), [],
      ['ตัวชี้วัดสำคัญ'], ...doc.kpis.map(k => [k.label, k.value, k.note ?? ''] as (string | number)[]), [],
    ];
    doc.sections.forEach(s => {
      rows.push([s.head]);
      s.paras.forEach(p => rows.push([p]));
      (s.bullets ?? []).forEach((b, i) => rows.push([`${i + 1}. ${b}`]));
      rows.push([]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 58 }, { wch: 22 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, ws, 'บทสรุป');
  }

  const used = new Set<string>();
  tables.forEach((t, i) => {
    const ws = XLSX.utils.aoa_to_sheet([t.cols, ...t.rows]);
    // ความกว้างคอลัมน์ตามเนื้อหาจริง — ไม่งั้นเปิดมาเจอ ##### ต้องลากขยายเองทุกคอลัมน์
    ws['!cols'] = t.cols.map((c, ci) => {
      const longest = Math.max(String(c).length, ...t.rows.slice(0, 300).map(r => String(r[ci] ?? '').length));
      return { wch: Math.min(60, Math.max(10, longest + 2)) };
    });
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: t.rows.length, c: Math.max(0, t.cols.length - 1) } }) };
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    // ชื่อชีตใน Excel ห้ามเกิน 31 ตัวอักษร ห้ามซ้ำ และห้ามมี : \ / ? * [ ]
    let nm = String(t.sheet || `ตาราง${i + 1}`).replace(/[:\\/?*[\]]/g, '-').slice(0, 31) || `ตาราง${i + 1}`;
    while (used.has(nm)) nm = nm.slice(0, 28) + '_' + (i + 1);
    used.add(nm);
    XLSX.utils.book_append_sheet(wb, ws, nm);
  });

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), safeName(name) + '.xlsx');
}

// ---------------------------------------------------------------
// PDF เอกสารทางการ — เปิดหน้าต่างพิมพ์ แล้วผู้ใช้เลือก "บันทึกเป็น PDF"
// ---------------------------------------------------------------
// ทำไมไม่สร้างไฟล์ PDF ตรง ๆ ด้วยไลบรารี: ไลบรารี PDF ฝั่งเบราว์เซอร์ต้องฝังฟอนต์ไทยเองทั้งชุด
// ถ้าไม่ฝัง สระ/วรรณยุกต์ไทยจะลอยผิดตำแหน่งหรือกลายเป็นช่องว่าง
// การพิมพ์ผ่านเบราว์เซอร์ใช้ตัวจัดวางตัวอักษรของระบบ ภาษาไทยจึงถูกต้องเสมอ และตัวอักษรใน PDF ยังคัดลอก/ค้นหาได้
export function openPrintable(html: string, onBlocked?: () => void) {
  const w = window.open('', '_blank');
  if (!w) { onBlocked?.(); return false; }
  w.document.open(); w.document.write(html); w.document.close();
  return true;
}
export function exportPDFDoc(doc: ReportDoc, meta: InfoMeta, onBlocked?: () => void) {
  return openPrintable(buildPrintHtml(doc, meta), onBlocked);
}

// ---------------------------------------------------------------
// อินโฟกราฟิก
// ---------------------------------------------------------------
/** แปลงสตริง SVG → PNG ความละเอียด 2 เท่า แล้วดาวน์โหลด */
export async function exportInfographicPNG(doc: ReportDoc, meta: InfoMeta, scale = 2): Promise<void> {
  const svg = buildInfographicSvg(doc, meta);
  // รอให้ฟอนต์ของหน้าเว็บโหลดเสร็จก่อน — ไม่ใช่เพื่อ SVG (SVG ใช้ฟอนต์ระบบ) แต่กันจังหวะที่เบราว์เซอร์ยังจัดหน้าไม่นิ่ง
  try { await (document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts?.ready; } catch { /* เบราว์เซอร์เก่า — ข้าม */ }

  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('เรนเดอร์ภาพไม่สำเร็จ'));
      im.src = url;
    });
    const cv = document.createElement('canvas');
    cv.width = 1600 * scale; cv.height = 900 * scale;
    const ctx = cv.getContext('2d');
    if (!ctx) throw new Error('เบราว์เซอร์นี้ไม่รองรับการสร้างภาพ');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    const blob = await new Promise<Blob | null>(res => cv.toBlob(res, 'image/png'));
    if (!blob) throw new Error('สร้างไฟล์ภาพไม่สำเร็จ');
    saveBlob(blob, safeName(`อินโฟกราฟิก_${doc.name}_${doc.scope}`) + '.png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** อินโฟกราฟิกเป็น PDF — พิมพ์แผ่นเดียวแนวนอน คมชัดทุกขนาด (เป็นเวกเตอร์ ไม่ใช่รูป) */
export function exportInfographicPDF(doc: ReportDoc, meta: InfoMeta, onBlocked?: () => void) {
  const svg = buildInfographicSvg(doc, meta);
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${doc.name} — ${doc.scope}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>@page{size:A4 landscape;margin:0}
 html,body{margin:0;padding:0;background:#fff}
 svg{display:block;width:100%;height:auto}
 @media print{svg{width:297mm;height:167mm}}</style></head>
<body>${svg}<script>window.onload=function(){setTimeout(function(){window.print()},500)}<\/script></body></html>`;
  return openPrintable(html, onBlocked);
}
