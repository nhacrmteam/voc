import { listVOC, requireUser } from '../../lib/dataServer';
import ChannelsView from './ChannelsView';

export const dynamic = 'force-dynamic';

export default async function Channels() {
  await requireUser();   // ด่านตรวจสิทธิ์ — ต้องมาก่อนดึงข้อมูลเสมอ
  const rows = await listVOC({});
  return <ChannelsView rows={rows} />;
}
