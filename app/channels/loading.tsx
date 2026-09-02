import PageSkeleton from '../components/Skeleton';

// แสดงระหว่างที่ page.tsx (server component) กำลังดึงข้อมูล — Next.js สลับให้อัตโนมัติ
export default function Loading() {
  return <PageSkeleton title="8 ช่องทางรับฟังเสียงลูกค้า" sub="กำลังโหลดข้อมูลจากฐานข้อมูล…" filters={4} blocks={2} />;
}
