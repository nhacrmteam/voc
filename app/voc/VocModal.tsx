'use client';
// VocModal — ป๊อปอัปรายละเอียดเสียงลูกค้า
// เหตุผลที่ใช้ป๊อปอัปแทนการเปลี่ยนหน้า: ผู้ใช้ไล่อ่านทีละรายการในตารางยาว ๆ
// ถ้าเปลี่ยนหน้าแล้วต้องกดย้อนกลับทุกครั้ง จะเสียตำแหน่งเลื่อน ตัวกรอง และหน้าที่เปิดค้างอยู่
// เปิด/ปิดอย่างไรก็ได้: กากบาท · Esc · คลิกพื้นหลัง — และเลื่อนดูรายการก่อนหน้า/ถัดไปได้ด้วย ‹ › หรือปุ่มลูกศร
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Voc } from '../../lib/data';
import VocDetailBody from './VocDetailBody';

export default function VocModal({ id, list, rows, period, onChange, onClose }: {
  id: string | null;
  list: Voc[];        // ลำดับที่ผู้ใช้เห็นอยู่บนตาราง (กรอง+เรียงแล้ว) — ใช้กำหนดว่าอะไรคือ "ถัดไป"
  rows: Voc[];        // ข้อมูลชุดเต็มของระบบ — ใช้คิดคะแนน/ประเด็นซ้ำ (ห้ามส่งชุดที่กรองแล้ว)
  period?: { fy?: number | string; qt?: string };   // ช่วงเวลาที่ลิงก์ในกล่องจะพาไป
  onChange: (id: string) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // จำปุ่มที่โฟกัสอยู่ก่อนเปิด เพื่อคืนโฟกัสกลับตอนปิด (คนใช้คีย์บอร์ดจะไม่หลงตำแหน่ง)
  const prevFocus = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const idx = id ? list.findIndex(x => x.id === id) : -1;
  // หาใน rows ด้วย เผื่อผู้ใช้เปลี่ยนตัวกรองจนรายการที่เปิดอยู่หลุดออกจาก list
  const r = id ? (idx >= 0 ? list[idx] : rows.find(x => x.id === id) || null) : null;
  const prev = idx > 0 ? list[idx - 1] : null;
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;

  const go = useCallback((t: Voc | null) => {
    if (!t) return;
    onChange(t.id);
    // เด้งกลับหัวกล่องทุกครั้งที่เปลี่ยนรายการ ไม่งั้นจะค้างอยู่กลางหน้าของรายการก่อน
    bodyRef.current?.scrollTo({ top: 0 });
  }, [onChange]);

  const open = !!r;
  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement as HTMLElement;
    closeRef.current?.focus();

    // ล็อกการเลื่อนพื้นหลัง — ชดเชยความกว้าง scrollbar ไม่ให้หน้ากระตุก
    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevPad = body.style.paddingRight;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (gap > 0) body.style.paddingRight = gap + 'px';

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      // ลูกศรซ้าย/ขวา = เลื่อนรายการ — แต่ต้องไม่แย่งลูกศรจากช่องกรอกข้อความ
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (!typing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        go(e.key === 'ArrowLeft' ? prev : next);
        return;
      }
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
  }, [open, onClose, go, prev, next]);

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
            {idx >= 0 && list.length > 1 && (
              <div className="vm-nav">
                <button type="button" onClick={() => go(prev)} disabled={!prev}
                  aria-label="รายการก่อนหน้า (ลูกศรซ้าย)" title="รายการก่อนหน้า (←)">‹</button>
                <span className="vm-count" aria-live="polite">{(idx + 1).toLocaleString()}<i>/</i>{list.length.toLocaleString()}</span>
                <button type="button" onClick={() => go(next)} disabled={!next}
                  aria-label="รายการถัดไป (ลูกศรขวา)" title="รายการถัดไป (→)">›</button>
              </div>
            )}
            <Link href={'/voc/' + r.id} className="vm-full" onClick={onClose} title="เปิดเป็นหน้าเต็ม (คัดลอกลิงก์ส่งต่อได้)">⤢ หน้าเต็ม</Link>
            <button ref={closeRef} type="button" className="vm-x" onClick={onClose} aria-label="ปิดหน้าต่าง (Esc)">✕</button>
          </div>
        </div>
        <div className="vm-body" ref={bodyRef}>
          <VocDetailBody r={r} rows={rows} period={period} onNavigate={onClose} />
          {idx >= 0 && list.length > 1 && (
            <div className="vm-foot">
              <button type="button" className="vm-fbtn" onClick={() => go(prev)} disabled={!prev}>
                ‹ ก่อนหน้า{prev && <span>{prev.ref}</span>}
              </button>
              <span className="vm-hint">ใช้ปุ่มลูกศร ← → เลื่อนดูรายการ · Esc เพื่อปิด</span>
              <button type="button" className="vm-fbtn" onClick={() => go(next)} disabled={!next}>
                ถัดไป ›{next && <span>{next.ref}</span>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
