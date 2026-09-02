import PageSkeleton from '../components/Skeleton';

// แสดงระหว่างที่ page.tsx (server component) กำลังดึงข้อมูล — Next.js สลับให้อัตโนมัติ
export default function Loading() {
  return <PageSkeleton title="จัดการระบบ" sub="กำลังโหลดผู้ใช้และการตั้งค่า…" blocks={2} table={6} />;
}
