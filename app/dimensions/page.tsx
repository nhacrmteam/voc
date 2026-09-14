import { listVOC, requireUser } from '../../lib/dataServer';
import DimensionsView from './DimensionsView';

export const dynamic = 'force-dynamic';

export default async function Dimensions() {
  await requireUser();   // ด่านตรวจสิทธิ์ — ต้องมาก่อนดึงข้อมูลเสมอ
  const rows = await listVOC({});
  return <DimensionsView rows={rows} />;
}
