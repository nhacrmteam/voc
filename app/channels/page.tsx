import { listVOC } from '../../lib/data';
import ChannelsView from './ChannelsView';

export const dynamic = 'force-dynamic';

export default async function Channels() {
  const rows = await listVOC({});
  return <ChannelsView rows={rows} />;
}
