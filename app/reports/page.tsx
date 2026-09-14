import { listVOC, requireUser } from '../../lib/dataServer';
import ReportClient from './ReportClient';

export const dynamic = 'force-dynamic';

export default async function Reports() {
  await requireUser();   // ด่านตรวจสิทธิ์ — ต้องมาก่อนดึงข้อมูลเสมอ
  const rows = await listVOC({});
  return <ReportClient rows={rows} />;
}
