// lib/vocLink.ts — สร้างลิงก์ไปหน้ารายการ VOC พร้อม "พก ช่วงเวลา" ไปด้วย
//
// ทำไมต้องมี: หน้ารายการ VOC ตั้งค่าเริ่มต้นเป็น "ไตรมาสปัจจุบัน" เสมอ
// ถ้าลิงก์ส่งไปแค่คำค้น ผู้ใช้ที่กำลังดู "ทั้งปี (สะสม)" อยู่จะถูกดีดกลับไปไตรมาสล่าสุด แล้วเจอ 0 รายการ
// กติกา: **ลิงก์ต้องพกช่วงเวลาที่ตัวเลขบนหน้านั้นถูกคำนวณมา**
//   - ตัวเลขคิดจากชุดที่กรองอยู่ (ภาพรวม/8 ช่องทาง) → ส่ง fy/qt ปัจจุบันไป
//   - ตัวเลขคิดจากข้อมูลทั้งหมด (จัดลำดับ/การ์ดประเด็นซ้ำ) → ส่ง ALL_TIME ไป
export const ALL_TIME = { fy: 0, qt: 'year' };

export function vocHref(q: string, period?: { fy?: number | string; qt?: string }): string {
  const p = new URLSearchParams();
  if (q) p.set('q', q);
  if (period?.fy !== undefined && period.fy !== null && period.fy !== '') p.set('fy', String(period.fy));
  if (period?.qt) p.set('qt', period.qt);
  const s = p.toString();
  return s ? '/voc?' + s : '/voc';
}
