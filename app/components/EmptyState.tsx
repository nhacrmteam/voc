// EmptyState — หน้าเปล่าที่บอก "ทำไมถึงว่าง" และ "ทำอะไรต่อได้"
// แทนข้อความสั้น ๆ อย่าง "ไม่พบรายการ" ซึ่งผู้ใช้แยกไม่ออกว่ากรองแคบไป หรือยังไม่มีข้อมูลในระบบ
import React from 'react';

export default function EmptyState({ icon = '🔎', title, detail, actions }: {
  icon?: string; title: string; detail?: React.ReactNode; actions?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="ic" aria-hidden>{icon}</div>
      <div className="t">{title}</div>
      {detail && <div className="d">{detail}</div>}
      {actions && <div className="acts">{actions}</div>}
    </div>
  );
}
