import PageSkeleton from '../components/Skeleton';

// แสดงระหว่างที่ page.tsx (server component) กำลังดึงข้อมูล — Next.js สลับให้อัตโนมัติ
export default function Loading() {
  return <PageSkeleton title="AI วิเคราะห์เสียงลูกค้า" sub="กำลังโหลดคิวและสถิติการวิเคราะห์…" kpis={3} blocks={2} />;
}
