import PageSkeleton from '../components/Skeleton';

export default function Loading() {
  return <PageSkeleton title="✋ คิวยืนยันเสียงลูกค้า" sub="กำลังโหลดคิวงาน…" filters={3} blocks={1} table={6} />;
}
