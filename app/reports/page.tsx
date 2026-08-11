import { listVOC } from '../../lib/data';
import ReportClient from './ReportClient';

export const dynamic = 'force-dynamic';

export default async function Reports() {
  const rows = await listVOC({});
  return <ReportClient rows={rows} />;
}
