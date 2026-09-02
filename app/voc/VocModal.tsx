'use client';
// VocModal — ป๊อปอัปรายละเอียดเสียงลูกค้า
// เหตุผลที่ใช้ป๊อปอัปแทนการเปลี่ยนหน้า: ผู้ใช้ไล่อ่านทีละรายการในตารางยาว ๆ
// ถ้าเปลี่ยนหน้าแล้วต้องกดย้อนกลับทุกครั้ง จะเสียตำแหน่งเลื่อน ตัวกรอง และหน้าที่เปิดค้างอยู่
// เปิด/ปิดอย่างไรก็ได้: กากบาท · ปุ่ม Esc · คลิกพื้นหลัง · ยังมีลิงก์ "เปิดเป็นหน้าเต็ม" ไว้ให้ก๊อบ URL ไปส่งต่อ
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Voc } from '../../lib/data';
import VocDetailBody from './VocDetailBody';

export default function VocModal({ r, rows, onClose }: { r: Voc | null; rows: Voc[]; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // จำปุ่มที่โฟกัสอยู่ก่อนเปิด เพื่อคืนโฟกัสกลับตอนปิด (คนใช้คีย์บอร์ดจะไม่หลงตำแหน่ง)
  const prevFocus = useRef<HTMLElement | null>(null);

  const open = !!r;
  // ต้องรอ mount ก่อนใช้ document (หน้าถูก render ฝั่งเซิร์ฟเวอร์ด้วย)
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement as HTMLElement;
    closeRef.current?.focus();

    // ล็อกการเลื่อนพื้นหลัง — ชดเชยความกว้าง scrollbar ไม่ให้หน้ากระตุกตอนเปิด
    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevPad = body.style.paddingRight;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (gap > 0) body.style.paddingRight = gap + 'px';

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      // กักโฟกัสไว้ในกล่อง — กด Tab วนอยู่ในป๊อปอัป ไม่หลุดไปแตะเมนูข้างหลัง
      if (e.key !== 'Tab') return;
      const box = panelRef.current; if (!box) return;
      const f = Array.from(box.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )).filter(el => el.offsetParent !== null);
      if (f.length === 0) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPad;
      prevFocus.current?.focus?.();
    };
  }, [open, onClose]);

  const onBackdrop = useCallback((e: React.MouseEvent) => {
    // ปิดเฉพาะตอนคลิกโดนพื้นหลังจริง ๆ ไม่ใช่ตอนลากเลือกข้อความในกล่องแล้วปล่อยเมาส์นอกกล่อง
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  if (!r || !mounted) return null;

  // ต่อไว้ที่ document.body โดยตรง ไม่ให้อยู่ใต้ .main
  // เพราะโหมดมืดใส่ filter:invert ที่ .main ซึ่งจะ (1) กลับสีป๊อปอัปซ้ำ (2) ทำให้ position:fixed
  // ยึดกับกล่อง .main แทนหน้าจอ — พื้นหลังทึบจะไม่คลุมแถบเมนูซ้าย
  return createPortal(
    <div className="vm-back" onMouseDown={onBackdrop} role="presentation">
      <div className="vm-panel" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="vm-title">
        <div className="vm-head">
          <div style={{ minWidth: 0 }}>
            <h2 id="vm-title">รายละเอียด {r.ref}</h2>
            <div className="vm-sub">{r.channel}{r.source !== r.channel ? ' › ' + r.source : ''} · {r.occurredAt}</div>
          </div>
          <div className="vm-acts">
            <Link href={'/voc/' + r.id} className="vm-full" onClick={onClose} title="เปิดเป็นหน้าเต็ม (คัดลอกลิงก์ส่งต่อได้)">⤢ หน้าเต็ม</Link>
            <button ref={closeRef} type="button" className="vm-x" onClick={onClose} aria-label="ปิดหน้าต่าง (Esc)">✕</button>
          </div>
        </div>
        <div className="vm-body">
          <VocDetailBody r={r} rows={rows} onNavigate={onClose} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
