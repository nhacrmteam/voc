import { listVOC } from '../../lib/data';
import DimensionsView from './DimensionsView';

export const dynamic = 'force-dynamic';

export default async function Dimensions() {
  const rows = await listVOC({});
  return <DimensionsView rows={rows} />;
}
