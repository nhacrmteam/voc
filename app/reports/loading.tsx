import PageSkeleton from '../components/Skeleton';

// แสดงระหว่างที่ page.tsx (server component) กำลังดึงข้อมูล — Next.js สลับให้อัตโนมัติ
export default function Loading() {
  return <PageSkeleton title="รายงาน" sub="กำลังเตรียมรายงาน…" filters={3} blocks={1} table={8} />;
}
