import { listVOC, requireUser } from '../../lib/dataServer';
import DashboardView from './DashboardView';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  await requireUser();   // ด่านตรวจสิทธิ์ — ต้องมาก่อนดึงข้อมูลเสมอ
  const rows = await listVOC({});
  return <DashboardView rows={rows} />;
}
