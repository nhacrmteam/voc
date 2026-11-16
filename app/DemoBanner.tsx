'use client';
// DemoBanner — แถบกำกับบนทุกหน้าของ "เว็บสาธิต"
//
// หลักการ: ต้องบอกตรง ๆ ตั้งแต่ก่อนผู้ชมเริ่มอ่านตัวเลข ว่านี่เป็นข้อมูลจำลอง
// การให้ผู้ประเมินถามก่อนแล้วค่อยตอบ เสียเปรียบกว่าการติดป้ายบอกเองตั้งแต่ต้น
//
// วางเป็น position:fixed มุมขวาบน = ตำแหน่งเดียวกับแถบผู้ใช้ของระบบจริง
// (บนเว็บสาธิตไม่มีแถบผู้ใช้ จึงไม่ทับกัน และไม่ดันเลย์เอาต์ทุกหน้าให้เพี้ยน)
import { DEMO_NOTE, PROD_URL } from '../lib/demo';

export default function DemoBanner() {
  return (
    <div
      role="status"
      style={{
        position: 'fixed', top: 10, right: 16, zIndex: 60,
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end',
        maxWidth: 'calc(100vw - 32px)',
        background: '#fff7e6', border: '1px solid #f0c674', borderRadius: 30,
        padding: '6px 10px 6px 14px', fontFamily: 'Sarabun,sans-serif',
        boxShadow: '0 4px 14px rgba(0,0,0,.10)',
      }}
    >
      <span style={{ fontSize: 12.5, color: '#7c4a03', fontWeight: 700, lineHeight: 1.5 }}>
        ⚠️ โหมดสาธิต — {DEMO_NOTE}
      </span>
      {PROD_URL && (
        <a
          href={PROD_URL}
          style={{
            fontSize: 12, color: '#1f3a93', background: '#fff', border: '1px solid #dfe6f0',
            borderRadius: 20, padding: '5px 11px', textDecoration: 'none', fontWeight: 600, whiteSpace: 'nowrap',
          }}
        >
          ไปยังระบบจริง →
        </a>
      )}
    </div>
  );
}
