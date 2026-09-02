import PageSkeleton from '../components/Skeleton';

// แสดงระหว่างที่ page.tsx (server component) กำลังดึงข้อมูล — Next.js สลับให้อัตโนมัติ
export default function Loading() {
  return <PageSkeleton title="ภาพรวมเสียงลูกค้า (VOC Dashboard)" sub="กำลังโหลดข้อมูลจากฐานข้อมูล…" filters={4} kpis={4} blocks={3} />;
}
