// components/TrendChart.tsx — กราฟแนวโน้มรายวัน (SVG, Server Component)
export default function TrendChart({ points, color = '#1f3a93' }: { points: { label: string; value: number }[]; color?: string }) {
  if (points.length < 2) return <span style={{ color: 'var(--muted)', fontSize: 12 }}>ข้อมูลไม่พอสำหรับแสดงแนวโน้ม</span>;
  const w = 560, h = 140, padX = 6, padY = 12;
  const vals = points.map(p => p.value);
  const mx = Math.max(...vals), mn = Math.min(...vals);
  const X = (i: number) => padX + i / (points.length - 1) * (w - padX * 2);
  const Y = (v: number) => h - padY - (v - mn) / ((mx - mn) || 1) * (h - padY * 2);
  const line = points.map((p, i) => `${X(i).toFixed(1)},${Y(p.value).toFixed(1)}`).join(' ');
  const area = `${padX},${h - padY} ${line} ${w - padX},${h - padY}`;
  const step = Math.max(1, Math.ceil(points.length / 8));
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        <polyline points={area} fill={color + '18'} stroke="none" />
        <polyline points={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={X(i)} cy={Y(p.value)} r={2.6} fill={color}>
            <title>{p.label}: {p.value} รายการ</title>
          </circle>
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>
        {points.filter((_, i) => i % step === 0).map(p => <span key={p.label}>{p.label}</span>)}
      </div>
    </div>
  );
}
