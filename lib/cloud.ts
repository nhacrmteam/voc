// lib/cloud.ts — Word Cloud: นับคำเด่นจากเสียงลูกค้า (พอร์ตจาก computeCloud ใน prototype)
import type { Voc } from './data';

export const VOC_VOCAB = [
  'จอง', 'ระบบจอง', 'จองออนไลน์', 'คิว', 'ซ่อม', 'ประปา', 'ไฟ', 'ส่วนกลาง', 'สะอาด', 'สกปรก',
  'เจ้าหน้าที่', 'บริการ', 'ประทับใจ', 'สุภาพ', 'เช่าซื้อ', 'โอนกรรมสิทธิ์', 'สัญญา', 'เอกสาร',
  'ผ่อน', 'ค่าเช่า', 'ชำระ', 'สินเชื่อ', 'ดอกเบี้ย', 'วงเงิน', 'ทำเล', 'เดินทาง', 'รถไฟฟ้า',
  'โปรโมชั่น', 'ส่วนลด', 'แคมเปญ', 'ราคา', 'เว็บไซต์', 'อัปเดต', 'ขัดข้อง', 'ล่าช้า', 'ติดตาม',
  'จอดรถ', 'มืด', 'ปลอดภัย',
];

export function computeCloud(rows: Voc[]): [string, number][] {
  return VOC_VOCAB
    .map(w => [w, rows.filter(r => (r.voice || '').includes(w)).length] as [string, number])
    .filter(p => p[1] > 0)
    .sort((a, b) => b[1] - a[1]);
}
