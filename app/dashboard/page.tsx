import { listVOC } from '../../lib/data';
import DashboardView from './DashboardView';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const rows = await listVOC({});
  return <DashboardView rows={rows} />;
}
