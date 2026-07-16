import Link from 'next/link';
import { listVOC, listProjects, CHANNELS, PROJECT_TYPES } from '../../lib/data';
import { computeCloud } from '../../lib/cloud';
import WordCloud from '../components/WordCloud';
import FilterBar from './FilterBar';

export const dynamic = 'force-dynamic';

export default async function VocList({ searchParams }: { searchParams: { q?: string; ptype?: string; proj?: string; channel?: string } }) {
  const q = searchParams?.q || '';
  const ptype = searchParams?.ptype || '';
  const proj = searchParams?.proj || '';
  const channel = searchParams?.channel || '';
  const [rows, allRows, projects] = await Promise.all([
    listVOC({ q, ptype, proj, channel }), listVOC({}), listProjects(),
  ]);
  const cloud = computeCloud(allRows);
  const active = [q && ('ค้นหา "' + q + '"'), ptype, proj, channel].filter(Boolean).join(' · ');
  return (
    <>
      <header className="top"><h1>รายการเสียงลูกค้า (VOC)</h1><div className="sub">ค้นหา + ตัวกรองประเภทโครงการ→โครงการ + Word Cloud</div></header>
      <div className="content">
        <div className="card">
          <h3>☁️ Word Cloud — คำที่ลูกค้าพูดถึงมาก (คลิกคำเพื่อค้นหา)</h3>
          <WordCloud freq={cloud} basePath="/voc" />
        </div>
        <div className="card">
          <FilterBar q0={q} ptype0={ptype} proj0={proj} channel0={channel}
            channels={CHANNELS} projects={projects} types={PROJECT_TYPES} />
          {active && <div className="sub" style={{ marginBottom: 8 }}>ตัวกรอง: <b style={{ color: '#1f3a93' }}>{active}</b></div>}
          <div className="sub" style={{ marginBottom: 10 }}>พบ {rows.length} รายการ</div>
          <table>
            <thead><tr><th>รหัส</th><th>ช่องทาง</th><th>ประเภทโครงการ</th><th>โครงการ</th><th>หัวข้อ</th><th>เสียงลูกค้า</th><th>Sentiment</th><th>ฝ่าย</th><th>สถานะ</th></tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.id}>
                <td><Link href={'/voc/' + r.id} className="tag">{r.ref}</Link></td>
                <td>{r.channel}</td><td>{r.projectType}</td><td>{r.project}</td><td>{r.topic}</td>
                <td style={{ maxWidth: 240, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.voice}>{r.voice}</td>
                <td><span className={'pill ' + (r.sentiment === 'Positive' ? 'p-pos' : r.sentiment === 'Negative' ? 'p-neg' : 'p-neu')}>{r.sentiment}</span></td>
                <td>{r.owner}</td><td>{r.status}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
