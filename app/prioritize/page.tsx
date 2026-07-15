import { listVOC } from '../../lib/data';

export const dynamic = 'force-dynamic';

const W = { freq: 0.30, sev: 0.40, urg: 0.30 }; // น้ำหนัก (แอดมินปรับได้ในระบบจริง)

export default async function Prioritize() {
  const rows = await listVOC();
  const g: Record<string, { c: number; neg: number; high: number }> = {};
  rows.forEach(r => { const t = r.topic; g[t] ||= { c: 0, neg: 0, high: 0 }; g[t].c++; if (r.sentiment === 'Negative') g[t].neg++; if (r.priority === 'High') g[t].high++; });
  const maxc = Math.max(...Object.values(g).map(o => o.c), 1);
  const arr = Object.entries(g).map(([t, o]) => {
    const fl = Math.max(1, Math.min(5, Math.ceil(o.c / maxc * 5)));
    const np = o.c ? o.neg / o.c * 100 : 0; const sl = np >= 50 ? 5 : np >= 35 ? 4 : np >= 20 ? 3 : np >= 10 ? 2 : 1;
    const hp = o.c ? o.high / o.c * 100 : 0; const ul = hp >= 40 ? 5 : hp >= 25 ? 4 : hp >= 15 ? 3 : hp >= 5 ? 2 : 1;
    return { t, c: o.c, fl, sl, ul, score: fl * W.freq + sl * W.sev + ul * W.urg };
  }).sort((a, b) => b.score - a.score);

  return (
    <>
      <header className="top"><h1>จัดลำดับความสำคัญ (5 ระดับ × 3 ปัจจัย)</h1><div className="sub">น้ำหนัก: ความถี่ 30% · ความรุนแรง 40% · ความเร่งด่วน 30%</div></header>
      <div className="content">
        <div className="card">
          <h3>📊 ผลการจัดลำดับความสำคัญของประเด็น</h3>
          <table>
            <thead><tr><th>อันดับ</th><th>ประเด็น</th><th>ความถี่</th><th>ความรุนแรง</th><th>ความเร่งด่วน</th><th>คะแนน</th><th>ระดับ</th></tr></thead>
            <tbody>{arr.map((x, i) => {
              const band = x.score >= 4 ? ['สูงมาก','p-hi'] : x.score >= 3 ? ['สูง','p-md'] : x.score >= 2 ? ['ปานกลาง','p-lo'] : ['ต่ำ','p-neu'];
              return <tr key={x.t}><td>{i+1}</td><td>{x.t}</td><td>{x.fl}</td><td>{x.sl}</td><td>{x.ul}</td><td><b>{x.score.toFixed(2)}</b></td><td><span className={'pill '+band[1]}>{band[0]}</span></td></tr>;
            })}</tbody>
          </table>
        </div>
      </div>
    </>
  );
}
