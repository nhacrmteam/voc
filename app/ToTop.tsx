'use client';
// ToTop — ปุ่มกลับขึ้นบนสุด โผล่เมื่อเลื่อนลงมาพอสมควร (ช่วยตารางยาว ๆ)
import { useEffect, useState } from 'react';

export default function ToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 400);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!show) return null;
  return (
    <button className="totop" title="กลับขึ้นบนสุด" aria-label="กลับขึ้นบนสุด"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>↑</button>
  );
}
