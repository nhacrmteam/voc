import PageSkeleton from '../components/Skeleton';

// แสดงระหว่างที่ page.tsx (server component) กำลังดึงข้อมูล — Next.js สลับให้อัตโนมัติ
export default function Loading() {
  return <PageSkeleton title="จัดลำดับความสำคัญของประเด็น" sub="กำลังคำนวณคะแนนถ่วงน้ำหนัก…" blocks={1} table={10} />;
}
