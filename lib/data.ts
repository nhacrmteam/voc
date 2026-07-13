// lib/data.ts — ชั้นข้อมูล: ใช้ Supabase ถ้าตั้งค่า ENV แล้ว, ไม่งั้น fallback เป็น mock
import { supabase, hasSupabase } from './supabaseClient';

export type Sentiment = 'Positive' | 'Neutral' | 'Negative';
export type Priority = 'High' | 'Medium' | 'Low';
export type CaseStatus =
  | 'รับเรื่อง' | 'ส่งต่อหน่วยงานที่รับผิดชอบ' | 'กำลังดำเนินการ'
  | 'รอข้อมูลเพิ่มเติม' | 'ติดตามผล' | 'ดำเนินการเสร็จ/ปิดเรื่อง';

export interface Voc {
  id: string; ref: string;
  channel: string; source: string;
  product: string; project: string;
  journey: string; topic: string; voice: string;
  sentiment: Sentiment; priority: Priority;
  owner: string; status: CaseStatus;
  occurredAt: string; importedAt: string; imported: boolean;
  catProduct: string; catSales: string;
}

export const CHANNELS = [
  'Social Media', 'Website / Email / DB', 'ทีมรณรงค์ขาย', 'ฝ่ายงานสำนักงานใหญ่',
  'สำนักงานสาขาทั่วประเทศ', 'Call Center', 'ระบบร้องเรียน/ข้อเสนอแนะ', 'แบบประเมินความพึงพอใจ'
];
export const PROJECT_TYPES = ['บ้านเอื้ออาทร', 'เคหะชุมชน', 'เคหะชุมชนและบริการชุมชน'];
export const DEPTS = [
  'ฝ่ายปรับปรุงและบำรุงรักษาชุมชน', 'ฝ่ายการตลาด', 'ฝ่ายบริหารงานขาย',
  'ฝ่ายบริหารสินเชื่อและหนี้', 'ฝ่ายเทคโนโลยีสารสนเทศ', 'ฝ่ายสื่อสารองค์กร', 'ฝ่ายกฎหมาย'
];
export const CASE_STATUS: CaseStatus[] = [
  'รับเรื่อง', 'ส่งต่อหน่วยงานที่รับผิดชอบ', 'กำลังดำเนินการ',
  'รอข้อมูลเพิ่มเติม', 'ติดตามผล', 'ดำเนินการเสร็จ/ปิดเรื่อง'
];

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
const MOCK: Voc[] = Array.from({ length: 60 }, (_, i) => {
  const v = VOICES[i % VOICES.length];
  const ch = pick(CHANNELS, i * 3);
  const prio: Priority = v.sent === 'Negative' ? (i % 3 === 0 ? 'High' : 'Medium') : (i % 4 === 0 ? 'Medium' : 'Low');
  const imported = ['ฝ่ายงานสำนักงานใหญ่', 'สำนักงานสาขาทั่วประเทศ', 'ทีมรณรงค์ขาย', 'แบบประเมินความพึงพอใจ'].includes(ch);
  const day = 10 + (i % 16);
  return {
    id: String(i + 1), ref: 'VOC-' + (2569000 + i),
    channel: ch, source: ch === 'Social Media' ? (i % 2 ? 'Line OA' : 'Facebook') : ch,
    product: pick(['อาคารเพื่อขาย/เช่าซื้อ', 'อาคารเช่า', 'เช่าจัดประโยชน์'], i),
    project: pick(['บ้านเอื้ออาทร รังสิต คลอง 1', 'เคหะชุมชนดินแดง', 'บ้านเอื้ออาทร บางบัวทอง 1', 'เคหะชุมชนห้วยขวาง'], i),
    journey: pick(['Awareness', 'Consideration', 'Purchase', 'Service', 'Loyalty', 'Win Back'], i),
    topic: v.topic, voice: v.voice, sentiment: v.sent, priority: prio,
    owner: v.owner, status: pick(CASE_STATUS, i),
    occurredAt: `2026-06-${String(day).padStart(2, '0')}`,
    importedAt: imported ? '2026-06-26' : `2026-06-${String(day).padStart(2, '0')}`,
    imported, catProduct: v.cat, catSales: 'การให้ข้อมูลโครงการ',
  };
});

// ---------- แปลงแถวจาก Supabase → รูป Voc ----------
function one<T>(x: T | T[] | null | undefined): T | undefined { return Array.isArray(x) ? x[0] : (x ?? undefined); }
function mapRow(r: any): Voc {
  const a = one<any>(r.analysis) || {};
  const proj = one<any>(r.project);
  const chan = one<any>(r.channel);
  return {
    id: String(r.id), ref: r.ref_code ?? String(r.id),
    channel: chan?.name ?? r.channel_id ?? '', source: r.source ?? '',
    product: r.product_group ?? '', project: proj?.name ?? '',
    journey: r.journey_stage ?? '', topic: r.topic ?? '', voice: r.raw_text ?? '',
    sentiment: (a.sentiment ?? 'Neutral') as Sentiment, priority: (a.priority ?? 'Low') as Priority,
    owner: r.owner_dept ?? '', status: (r.status ?? 'รับเรื่อง') as CaseStatus,
    occurredAt: r.occurred_at ?? '', importedAt: r.imported_at ?? r.occurred_at ?? '',
    imported: !!r.is_imported, catProduct: a.cat_product ?? '', catSales: a.cat_sales ?? '',
  };
}

// ---------- ดึงข้อมูลทั้งหมด (Supabase หรือ mock) ----------
async function fetchAll(): Promise<Voc[]> {
  if (hasSupabase && supabase) {
    const { data, error } = await supabase
      .from('voc_record')
      .select('*, analysis(*), project(name,project_type), channel(name)')
      .order('occurred_at', { ascending: false });
    if (error) { console.error('Supabase error:', error.message); return MOCK; }
    return (data ?? []).map(mapRow);
  }
  return MOCK;
}

// ---------- API ที่หน้าเว็บเรียกใช้ ----------
export async function listVOC(opts: { q?: string; channel?: string; limit?: number } = {}): Promise<Voc[]> {
  let r = await fetchAll();
  if (opts.channel) r = r.filter(x => x.channel === opts.channel);
  if (opts.q) { const q = opts.q.toLowerCase(); r = r.filter(x => (x.voice + x.topic + x.ref + x.owner + x.project).toLowerCase().includes(q)); }
  return r.slice(0, opts.limit ?? r.length);
}
export async function getVOC(id: string): Promise<Voc | undefined> {
  return (await fetchAll()).find(x => x.id === id);
}
export async function pipelineStats(): Promise<Record<string, number>> {
  const all = await fetchAll();
  const st: Record<string, number> = {}; CASE_STATUS.forEach(s => (st[s] = 0));
  all.forEach(x => (st[x.status] = (st[x.status] || 0) + 1));
  return st;
}
export async function sentimentStats() {
  const all = await fetchAll(); const t = all.length || 1;
  const c = { Positive: 0, Neutral: 0, Negative: 0 };
  all.forEach(x => c[x.sentiment]++);
  return { total: all.length, ...c, posPct: Math.round(c.Positive / t * 100), negPct: Math.round(c.Negative / t * 100), neuPct: Math.round(c.Neutral / t * 100) };
}
export async function channelStats() {
  const all = await fetchAll();
  return CHANNELS.map(name => {
    const rows = all.filter(x => x.channel === name);
    const neg = rows.filter(x => x.sentiment === 'Negative').length;
    return { name, count: rows.length, negPct: rows.length ? Math.round(neg / rows.length * 100) : 0 };
  });
}
