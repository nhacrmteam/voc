// lib/data.ts — ชนิดข้อมูล + ค่าคงที่ที่ใช้ร่วมกันทั้ง "ฝั่งเบราว์เซอร์" และ "ฝั่งเซิร์ฟเวอร์"
//
// ⚠️ ไฟล์นี้ต้องไม่แตะ Supabase เลย
//    เพราะ client component (หน้าจอต่าง ๆ) import ค่าคงที่จากไฟล์นี้
//    ถ้าไฟล์นี้ import ตัวเชื่อมฐานข้อมูลฝั่งเซิร์ฟเวอร์เข้ามา จะถูกรวมเข้าไฟล์ JS ที่ส่งให้เบราว์เซอร์ด้วย
//    ฟังก์ชันที่อ่าน/เขียนฐานข้อมูลจริงอยู่ที่ lib/dataServer.ts (server-only) แทน
import { aiSentiment } from './ai';

export type Sentiment = 'Positive' | 'Neutral' | 'Negative';
export type Priority = 'High' | 'Medium' | 'Low';

export interface Voc {
  id: string; ref: string;
  channel: string; source: string;
  project: string; projectType: string;
  journey: string; topic: string; voice: string;
  sentiment: Sentiment; priority: Priority;
  owner: string;
  occurredAt: string; importedAt: string; imported: boolean;
  catProduct: string; catSales: string;
  sentConf: number; sentUncertain: boolean; sentManual: boolean; sentReason: string;
}

export const CHANNELS = [
  'Social Media', 'Website / Email / DB', 'ทีมรณรงค์ขาย', 'ฝ่ายงานสำนักงานใหญ่',
  'สำนักงานสาขาทั่วประเทศ', 'Call Center', 'ระบบร้องเรียน/ข้อเสนอแนะ', 'แบบประเมินความพึงพอใจ'
];
export const PROJECT_TYPES = ['บ้านเอื้ออาทร', 'เคหะชุมชน', 'เคหะชุมชนและบริการชุมชน'];

// ---------- แหล่งที่มาย่อยของแต่ละช่องทาง ----------
// เก็บ "ลำดับที่ต้องการให้แสดง" ไว้ที่นี่จุดเดียว — ห้ามเรียงตามลำดับที่เจอในข้อมูล
// เพราะลำดับจะสลับไปมาตามชุดข้อมูลที่ถูกกรองอยู่ ผู้ใช้จะงงว่าแท็บย้ายที่
// ช่องทางที่ไม่อยู่ในนี้ = ไม่แยกแหล่งที่มา (source เท่ากับชื่อช่องทาง แท็บจึงไม่ขึ้น)
export const CHANNEL_SOURCES: Record<string, string[]> = {
  'Social Media': ['Facebook', 'Line OA'],
  'Website / Email / DB': ['Website', 'Email', 'Data อื่นๆ'],
};

/** เรียงรายชื่อแหล่งที่มาตามลำดับที่กำหนดไว้ · ชื่อที่ไม่รู้จักไปต่อท้ายแบบเรียงอักษร */
export function sortSources(channel: string, list: string[]): string[] {
  const order = CHANNEL_SOURCES[channel] || [];
  const rank = (s: string) => { const i = order.indexOf(s); return i < 0 ? order.length : i; };
  return [...list].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'th'));
}

// ---------- Customer Journey 6 ขั้น ----------
// เก็บใน DB เป็นภาษาอังกฤษ (ตาม check constraint) แต่แสดงผลเป็นไทยเสมอ
export const JOURNEYS = ['Awareness', 'Consideration', 'Purchase', 'Service', 'Loyalty', 'Win Back'] as const;
export const JOURNEY_TH: Record<string, string> = {
  Awareness: 'การรับรู้',
  Consideration: 'การพิจารณา',
  Purchase: 'การซื้อ/ทำสัญญา',
  Service: 'การใช้บริการ',
  Loyalty: 'ความผูกพัน',
  'Win Back': 'การดึงลูกค้าเก่ากลับมา',
};
// คำอธิบายสั้น ๆ ว่าแต่ละขั้นหมายถึงเสียงลูกค้าแบบไหน (ใช้เป็น tooltip/คำโปรย)
export const JOURNEY_DESC: Record<string, string> = {
  Awareness: 'เพิ่งรู้จัก กคช. จากสื่อ/โฆษณา/บอกต่อ — ยังไม่ระบุโครงการ',
  Consideration: 'กำลังหาข้อมูล เปรียบเทียบ สอบถามเงื่อนไข ราคา ทำเล',
  Purchase: 'จอง ทำสัญญา ยื่นกู้ วางดาวน์ โอนกรรมสิทธิ์',
  Service: 'อยู่อาศัยแล้ว — แจ้งซ่อม ชำระค่างวด ใช้บริการส่วนกลาง ร้องเรียน',
  Loyalty: 'พอใจ ชื่นชม แนะนำต่อ อยากซื้อเพิ่ม',
  'Win Back': 'จะยกเลิก ย้ายออก คืนเงิน หรือเคยเลิกใช้แล้วติดต่อกลับมา',
};
// สีป้ายประจำขั้น (ไล่จากต้นทางสู่ปลายทาง) — ใช้ให้ตรงกันทุกหน้า
export const JOURNEY_COLOR: Record<string, { bg: string; fg: string }> = {
  Awareness: { bg: '#e0f2fe', fg: '#0369a1' },
  Consideration: { bg: '#e0e7ff', fg: '#4338ca' },
  Purchase: { bg: '#ede9fe', fg: '#6d28d9' },
  Service: { bg: '#dcfce7', fg: '#15803d' },
  Loyalty: { bg: '#fef3c7', fg: '#b45309' },
  'Win Back': { bg: '#fee2e2', fg: '#b91c1c' },
};
/** แสดงชื่อขั้นเป็น "ไทย (English)" — ใช้ทุกหน้าให้ตรงกัน */
export function journeyLabel(en: string): string {
  const th = JOURNEY_TH[en];
  return th ? th + ' (' + en + ')' : (en || '-');
}
// โครงสร้างฝ่ายของการเคหะแห่งชาติ แยกตามสายงาน (มติคณะกรรมการฯ ก.พ. 2565)
// ใช้กับช่อง "หน่วยงานที่เกี่ยวข้อง"
export const DEPT_GROUPS: { group: string; depts: string[] }[] = [
  { group: 'ขึ้นตรงผู้ว่าการ / ตรวจสอบ', depts: ['ฝ่ายตรวจสอบภายใน', 'สำนักงานเลขานุการคณะกรรมการการเคหะแห่งชาติ'] },
  { group: 'สำนักผู้ว่าการ', depts: ['ฝ่ายพัฒนาคุณภาพชีวิตชุมชนและความรับผิดชอบต่อสังคม', 'สำนักงานกำกับติดตามบริษัทในเครือ'] },
  { group: 'สายงานบัญชี', depts: ['ฝ่ายบริหารการเงินและงบประมาณ', 'ฝ่ายการบัญชี', 'ฝ่ายบริหารสินเชื่อและหนี้', 'ฝ่ายบริหารความเสี่ยงองค์กร'] },
  { group: 'สายงานพัฒนาโครงการ', depts: ['ฝ่ายพัฒนาโครงการ 1', 'ฝ่ายพัฒนาโครงการ 2', 'ฝ่ายพัฒนาโครงการ 3', 'ฝ่ายปรับปรุงและบำรุงรักษาชุมชน', 'ฝ่ายสิ่งแวดล้อม วิศวกรรมสำรวจ และทดสอบวัสดุ'] },
  { group: 'สายงานพัฒนาธุรกิจและกลยุทธ์องค์กร', depts: ['ฝ่ายนโยบายและแผน', 'ฝ่ายกลยุทธ์พัฒนาโครงการ 1', 'ฝ่ายกลยุทธ์พัฒนาโครงการ 2', 'ฝ่ายกลยุทธ์พัฒนาโครงการ 3'] },
  { group: 'สายงานพัฒนาสินทรัพย์', depts: ['ฝ่ายการตลาด', 'ฝ่ายบริหารงานขาย', 'ฝ่ายจัดประโยชน์ทรัพย์สิน', 'ฝ่ายทรัพย์สินและอาคารเช่า', 'ฝ่ายที่ดิน'] },
  { group: 'สายงานบริหารชุมชน', depts: ['ฝ่ายบริหารงานชุมชนกรุงเทพมหานครและปริมณฑลตอนบน', 'ฝ่ายบริหารงานชุมชนกรุงเทพมหานครและปริมณฑลตอนล่าง', 'ฝ่ายบริหารงานชุมชนภาคกลางและภาคตะวันออก', 'ฝ่ายบริหารงานชุมชนภาคเหนือ', 'ฝ่ายบริหารงานชุมชนภาคตะวันออกเฉียงเหนือ', 'ฝ่ายบริหารงานชุมชนภาคใต้'] },
  { group: 'สายงานบริหารและสนับสนุนองค์กร', depts: ['ฝ่ายอำนวยการกลาง', 'ฝ่ายสื่อสารองค์กร', 'ฝ่ายพัฒนาศักยภาพโครงการก่อสร้าง', 'ฝ่ายเทคโนโลยีสารสนเทศ', 'ฝ่ายทรัพยากรบุคคล', 'ฝ่ายกฎหมาย', 'ฝ่ายวิชาการและพัฒนานวัตกรรมเพื่อที่อยู่อาศัย', 'ศูนย์ข้อมูลที่อยู่อาศัยแห่งชาติ'] },
];
// รายชื่อฝ่ายแบบเรียง (flat) — ใช้กับ dropdown / การจับคู่อัตโนมัติ
export const DEPTS = DEPT_GROUPS.flatMap(g => g.depts);

// ---------- MOCK (ใช้เมื่อยังไม่ตั้งค่า Supabase) ----------
const VOICES = [
  { topic: 'แจ้งซ่อมระบบประปา', voice: 'น้ำประปาในห้องไหลอ่อนมาก บางวันไม่ไหลเลย รบกวนส่งช่างมาตรวจสอบ', sent: 'Negative' as Sentiment, cat: 'คุณภาพโครงการและการก่อสร้าง', owner: 'ฝ่ายปรับปรุงและบำรุงรักษาชุมชน' },
  { topic: 'สอบถามเงื่อนไขเช่าซื้อ', voice: 'อยากทราบเงื่อนไขการเช่าซื้อ ต้องวางเงินดาวน์เท่าไหร่ ผ่อนกี่ปี', sent: 'Neutral' as Sentiment, cat: 'การซื้อ/เช่าซื้อ', owner: 'ฝ่ายการตลาด' },
  { topic: 'ร้องเรียนความสะอาดส่วนกลาง', voice: 'พื้นที่ส่วนกลางสกปรกมาก ขยะไม่ได้เก็บหลายวัน ช่วยดูแลด้วย', sent: 'Negative' as Sentiment, cat: 'คุณภาพโครงการและการก่อสร้าง', owner: 'ฝ่ายสื่อสารองค์กร' },
  { topic: 'ชื่นชมเจ้าหน้าที่สาขา', voice: 'เจ้าหน้าที่สาขาบริการดีมาก ให้คำแนะนำชัดเจนและสุภาพ ประทับใจมาก', sent: 'Positive' as Sentiment, cat: 'การให้ข้อมูลโครงการ', owner: 'ฝ่ายการตลาด' },
  { topic: 'ขอผ่อนผันค่าเช่า', voice: 'เดือนนี้รายได้ลดลง ขอผ่อนผันการชำระค่าเช่าออกไปก่อนได้ไหม', sent: 'Neutral' as Sentiment, cat: 'การผ่อนชำระที่อยู่อาศัย', owner: 'ฝ่ายบริหารสินเชื่อและหนี้' },
  { topic: 'ระบบจองออนไลน์ขัดข้อง', voice: 'จองคิวผ่านเว็บไซต์ไม่ได้ ระบบค้าง กดยืนยันแล้วเด้งออก', sent: 'Negative' as Sentiment, cat: 'ระบบจองบ้านออนไลน์', owner: 'ฝ่ายเทคโนโลยีสารสนเทศ' },
  { topic: 'สอบถามโอนกรรมสิทธิ์', voice: 'ผ่อนครบแล้ว ต้องเตรียมเอกสารอะไรบ้างสำหรับการโอนกรรมสิทธิ์', sent: 'Neutral' as Sentiment, cat: 'การซื้อ/เช่าซื้อ', owner: 'ฝ่ายบริหารงานขาย' },
  { topic: 'ไฟส่องสว่างชำรุด', voice: 'ไฟทางเดินและลานจอดรถดับหลายจุด กลางคืนมืดและไม่ปลอดภัย ช่วยซ่อมด่วน', sent: 'Negative' as Sentiment, cat: 'คุณภาพโครงการและการก่อสร้าง', owner: 'ฝ่ายปรับปรุงและบำรุงรักษาชุมชน' },
];
function pick<T>(a: T[], i: number) { return a[i % a.length]; }
// เดาประเภทโครงการจากชื่อ (สำหรับ mock; ของจริงอ่านจากคอลัมน์ project_type)
export function projectTypeOf(name: string): string {
  if (name.startsWith('เคหะชุมชนและบริการชุมชน')) return 'เคหะชุมชนและบริการชุมชน';
  if (name.startsWith('บ้านเอื้ออาทร')) return 'บ้านเอื้ออาทร';
  return 'เคหะชุมชน';
}
const MOCK_PROJECTS = ['บ้านเอื้ออาทร รังสิต คลอง 1', 'เคหะชุมชนดินแดง', 'บ้านเอื้ออาทร บางบัวทอง 1', 'เคหะชุมชนห้วยขวาง', 'เคหะชุมชนและบริการชุมชน ร่มเกล้า'];
export const MOCK: Voc[] = Array.from({ length: 60 }, (_, i) => {
  const v = VOICES[i % VOICES.length];
  const ch = pick(CHANNELS, i * 3);
  const prio: Priority = v.sent === 'Negative' ? (i % 3 === 0 ? 'High' : 'Medium') : (i % 4 === 0 ? 'Medium' : 'Low');
  const imported = ['ฝ่ายงานสำนักงานใหญ่', 'สำนักงานสาขาทั่วประเทศ', 'ทีมรณรงค์ขาย', 'แบบประเมินความพึงพอใจ'].includes(ch);
  const day = 10 + (i % 16);
  // กระจายวันที่ข้าม 3 ปีงบประมาณ (2567/2568/2569) เพื่อให้ตัวกรองปี+ไตรมาสเห็นผลในโหมดสาธิต
  const MONTHS = ['2023-11', '2024-02', '2024-05', '2024-08', '2024-11', '2025-02', '2025-05', '2025-08', '2025-11', '2026-02', '2026-05', '2026-06'];
  const mm = MONTHS[i % MONTHS.length];
  return {
    id: String(i + 1), ref: 'VOC-' + (2569000 + i),
    channel: ch,
    source: ch === 'Social Media' ? (Math.floor(i / 8) % 2 ? 'Line OA' : 'Facebook')
      : ch === 'Website / Email / DB' ? ['Website', 'Email', 'Data อื่นๆ'][i % 3]
      : ch,
    project: pick(MOCK_PROJECTS, i), projectType: projectTypeOf(pick(MOCK_PROJECTS, i)),
    journey: pick(['Awareness', 'Consideration', 'Purchase', 'Service', 'Loyalty', 'Win Back'], i),
    topic: v.topic, voice: v.voice, sentiment: v.sent, priority: prio,
    owner: v.owner,
    occurredAt: `${mm}-${String(day).padStart(2, '0')}`,
    importedAt: imported ? '2026-06-26' : `${mm}-${String(day).padStart(2, '0')}`,
    imported, catProduct: v.cat, catSales: 'การให้ข้อมูลโครงการ',
    ...(az => ({ sentConf: az.conf, sentUncertain: az.uncertain, sentManual: false, sentReason: az.reason }))(aiSentiment(v.voice)),
  };
});
