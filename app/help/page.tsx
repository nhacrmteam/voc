import HelpView from './HelpView';
import { requireUser } from '../../lib/dataServer';

export const dynamic = 'force-dynamic';

// คู่มือการใช้งาน — เนื้อหาเป็นข้อความคงที่ ไม่ต้องดึงข้อมูลเสียงลูกค้า
// แต่ยังต้องผ่านด่านตรวจสิทธิ์ เพราะคู่มืออธิบายขั้นตอนภายในของระบบ ไม่ควรเปิดให้คนนอกอ่าน
export default async function Help() {
  await requireUser();
  return <HelpView />;
}
