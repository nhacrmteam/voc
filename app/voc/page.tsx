import { listVOC } from '../../lib/data';
import VocListView from './VocListView';

export const dynamic = 'force-dynamic';

// ?q= คำค้น · ?fy= ปีงบ (0 = ทั้งหมดตั้งแต่มีระบบ) · ?qt= ไตรมาส (year|q1..q4)
// fy/qt มีไว้ให้ลิงก์จากหน้าอื่น "พกช่วงเวลา" มาด้วย ไม่งั้นหน้านี้จะรีเซ็ตเป็นไตรมาสปัจจุบันเสมอ
export default async function VocList({ searchParams }: {
  searchParams: { q?: string; fy?: string; qt?: string };
}) {
  const rows = await listVOC({});
  const q = searchParams?.q || '';
  const fy = searchParams?.fy;
  const qt = searchParams?.qt;
  // key บังคับให้ component เริ่มใหม่เมื่อพารามิเตอร์เปลี่ยน (ผู้ใช้กดลิงก์ใหม่ซ้ำหน้าเดิม)
  return <VocListView rows={rows} initialQ={q} initialFy={fy} initialQuarter={qt} key={`${q}|${fy ?? ''}|${qt ?? ''}`} />;
}
