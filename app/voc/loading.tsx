import PageSkeleton from '../components/Skeleton';

// แสดงระหว่างที่ page.tsx (server component) กำลังดึงข้อมูล — Next.js สลับให้อัตโนมัติ
export default function Loading() {
  return <PageSkeleton title="รายการเสียงลูกค้า (VOC)" sub="กำลังโหลดข้อมูลจากฐานข้อมูล…" filters={5} blocks={1} table={8} />;
}
