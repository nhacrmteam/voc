import ReviewQueueView from './ReviewQueueView';

export const dynamic = 'force-dynamic';

// หน้าคิวยืนยันเสียงลูกค้า — ดึงข้อมูลฝั่งเบราว์เซอร์เอง (แบ่งหน้า + กรอง)
// จึงไม่ส่งข้อมูลหลายร้อยแถวผ่าน server component โดยไม่จำเป็น
export default function Review() {
  return <ReviewQueueView />;
}
