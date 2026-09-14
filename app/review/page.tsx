import ReviewQueueView from './ReviewQueueView';
import { requireUser } from '../../lib/dataServer';

export const dynamic = 'force-dynamic';

// หน้าคิวยืนยันเสียงลูกค้า — ดึงข้อมูลฝั่งเบราว์เซอร์เอง (แบ่งหน้า + กรอง)
// จึงไม่ส่งข้อมูลหลายร้อยแถวผ่าน server component โดยไม่จำเป็น
export default async function Review() {
  await requireUser();   // ด่านตรวจสิทธิ์ — ถึงจะดึงข้อมูลฝั่งเบราว์เซอร์ ก็ไม่ให้คนไม่ล็อกอินเปิดหน้าได้
  return <ReviewQueueView />;
}
