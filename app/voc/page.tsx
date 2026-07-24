import { listVOC } from '../../lib/data';
import VocListView from './VocListView';

export const dynamic = 'force-dynamic';

export default async function VocList({ searchParams }: { searchParams: { q?: string } }) {
  const rows = await listVOC({});
  const q = searchParams?.q || '';
  return <VocListView rows={rows} initialQ={q} key={q} />;
}
