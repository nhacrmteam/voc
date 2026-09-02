'use client';
// FontSize — เลือกขนาดตัวอักษร/การแสดงผล 4 ระดับ (จำค่าไว้ใน localStorage)
// รองรับผู้สูงอายุและผู้มีปัญหาทางสายตา ตามแนวทางการเข้าถึงเว็บภาครัฐ
// ใช้ CSS zoom กับพื้นที่เนื้อหา (.main) เพื่อให้ทั้งตัวอักษร ตาราง และการ์ดขยายพร้อมกัน
// (สไตล์ในระบบใช้หน่วย px เป็นหลัก การปรับ font-size อย่างเดียวจึงไม่มีผลกับหลายส่วน)
import { useEffect, useState } from 'react';

export const FONT_STEPS = [
  { k: 'sm', label: 'เล็ก', short: 'ก', size: 12 },
  { k: 'md', label: 'ปกติ', short: 'ก', size: 14 },
  { k: 'lg', label: 'ใหญ่', short: 'ก', size: 16 },
  { k: 'xl', label: 'ใหญ่พิเศษ', short: 'ก', size: 19 },
] as const;
type Step = typeof FONT_STEPS[number]['k'];

export default function FontSize() {
  const [step, setStep] = useState<Step>('md');

  useEffect(() => {
    const cur = (document.documentElement.getAttribute('data-font') as Step) || 'md';
    setStep(cur);
  }, []);

  function apply(k: Step) {
    setStep(k);
    const el = document.documentElement;
    if (k === 'md') el.removeAttribute('data-font');
    else el.setAttribute('data-font', k);
    try { localStorage.setItem('voc-font', k); } catch { /* โหมดส่วนตัว — ข้าม */ }
  }

  const idx = FONT_STEPS.findIndex(f => f.k === step);
  const dec = () => apply(FONT_STEPS[Math.max(0, idx - 1)].k);
  const inc = () => apply(FONT_STEPS[Math.min(FONT_STEPS.length - 1, idx + 1)].k);

  return (
    <div className="fontsize" role="group" aria-label="ปรับขนาดตัวอักษร">
      <span className="fs-lab">ขนาดตัวอักษร</span>
      <div className="fs-row">
        <button type="button" className="fs-btn" onClick={dec} disabled={idx === 0}
          aria-label="ลดขนาดตัวอักษร" title="ลดขนาดตัวอักษร">ก−</button>
        {/* จุดบอกระดับปัจจุบัน — กดเลือกระดับตรง ๆ ได้ */}
        <span className="fs-dots">
          {FONT_STEPS.map((f, i) => (
            <button key={f.k} type="button" onClick={() => apply(f.k)}
              className={'fs-dot' + (i === idx ? ' on' : '')}
              aria-label={'ขนาด' + f.label} aria-pressed={i === idx} title={'ขนาด' + f.label} />
          ))}
        </span>
        <button type="button" className="fs-btn big" onClick={inc} disabled={idx === FONT_STEPS.length - 1}
          aria-label="เพิ่มขนาดตัวอักษร" title="เพิ่มขนาดตัวอักษร">ก+</button>
      </div>
      <span className="fs-cur">{FONT_STEPS[idx].label}</span>
    </div>
  );
}
