'use client';
// DemoBlocked — ป้ายแทนหน้าที่ปิดไว้ในโหมดสาธิต
//
// ใช้กับหน้าที่ "เขียนข้อมูล" ได้ (นำเข้าข้อมูล · จัดการระบบ · คิวรอยืนยัน)
// ปกติ middleware เด้งออกไปก่อนแล้ว ตัวนี้เป็นชั้นสำรองกรณีเข้าถึงหน้าได้โดยไม่ผ่าน middleware
import Link from 'next/link';

export default function DemoBlocked({ title }: { title: string }) {
  return (
    <>
      <header className="top">
        <h1>{title}</h1>
        <div className="sub">เว็บสาธิต — ปิดทุกหน้าที่แก้ไขหรือนำเข้าข้อมูลได้</div>
      </header>
      <div className="content">
      <div className="card" style={{ maxWidth: 560 }}>
        <div style={{ fontSize: 34, marginBottom: 6 }}>🔒</div>
        <h2 style={{ marginBottom: 8 }}>{title} — ปิดในโหมดสาธิต</h2>
        <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.9 }}>
          เว็บนี้เป็น<b>เว็บสาธิต</b> แสดงชุดข้อมูลจำลอง 10,012 รายการแบบอ่านอย่างเดียว
          จึงปิดทุกหน้าที่แก้ไขหรือนำเข้าข้อมูลได้ เพื่อให้ชุดข้อมูลคงเดิมตรงกับที่อ้างอิงไว้ในเอกสาร
          <br />ฟังก์ชันเหล่านี้ใช้งานได้เต็มรูปแบบในระบบจริง ซึ่งต้องเข้าสู่ระบบและแบ่งสิทธิ์ตามบทบาท
        </div>
        <div style={{ marginTop: 18 }}>
          <Link href="/dashboard" className="btn">← กลับหน้าภาพรวม</Link>
        </div>
      </div>
      </div>
    </>
  );
}
