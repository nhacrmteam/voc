import PageSkeleton from '../components/Skeleton';

// แสดงระหว่างที่ page.tsx (server component) กำลังดึงข้อมูล — Next.js สลับให้อัตโนมัติ
export default function Loading() {
  return <PageSkeleton title="นำเข้าข้อมูลเสียงลูกค้า" sub="กำลังเตรียมตัวช่วยนำเข้า…" blocks={2} />;
}
