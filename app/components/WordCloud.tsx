// components/WordCloud.tsx — คำที่พูดถึงมาก = ตัวใหญ่, คลิกคำเพื่อค้นหา
// 2 โหมด:
//   1) onPick — อยู่หน้ารายการ VOC อยู่แล้ว → ใส่คำลงช่องค้นหาตรง ๆ ไม่เปลี่ยนหน้า (ตัวกรองที่ตั้งไว้ไม่หาย)
//   2) ไม่มี onPick — อยู่หน้าอื่น → ลิงก์ไป /voc พร้อมพกช่วงเวลาปัจจุบันไปด้วย (fy/qt)
import Link from 'next/link';
import { vocHref } from '../../lib/vocLink';

const PAL = ['#1f3a93', '#2e6cf0', '#16a34a', '#0e7c86', '#475569', '#0ea5e9', '#8b5cf6', '#64748b', '#0369a1'];

export default function WordCloud({ freq, basePath, onPick, period }: {
  freq: [string, number][];
  basePath: string;
  onPick?: (w: string) => void;
  period?: { fy?: number | string; qt?: string };
}) {
  if (!freq.length) return <span style={{ color: 'var(--muted)', fontSize: 12 }}>ไม่มีคำเด่นในชุดข้อมูลนี้</span>;
  const vals = freq.map(p => p[1]);
  const mx = Math.max(...vals), mn = Math.min(...vals);
  // สลับลำดับแบบคงที่ (interleave) ให้คำใหญ่กระจายตัว ไม่กองซ้ายบน
  const mixed: [string, number][] = [];
  for (let i = 0, j = freq.length - 1; i <= j; i++, j--) {
    mixed.push(freq[i]); if (i !== j) mixed.push(freq[j]);
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 18px', alignItems: 'center', justifyContent: 'center', lineHeight: 1.6, padding: '10px 6px' }}>
      {mixed.map(([w, n], i) => {
        const sz = 15 + Math.round((n - mn) / ((mx - mn) || 1) * 33);
        const fw = sz > 32 ? 700 : sz > 24 ? 600 : 500;
        const st: React.CSSProperties = { fontSize: sz, color: PAL[i % PAL.length], fontWeight: fw, textDecoration: 'none' };
        const title = `${n} รายการ — คลิกเพื่อค้นหา`;
        return onPick
          ? <button key={w} type="button" className="wc-word" title={title} style={st} onClick={() => onPick(w)}>{w}</button>
          : <Link key={w} href={basePath === '/voc' ? vocHref(w, period) : `${basePath}?q=${encodeURIComponent(w)}`}
              className="wc-word" title={title} style={st}>{w}</Link>;
      })}
    </div>
  );
}
