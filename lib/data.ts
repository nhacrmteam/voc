// lib/data.ts — ชั้นข้อมูล: ใช้ Supabase ถ้าตั้งค่า ENV แล้ว, ไม่งั้น fallback เป็น mock
import { supabase, hasSupabase } from './supabaseClient';
import { aiSentiment } from './ai';

export type Sentiment = 'Positive' | 'Neutral' | 'Negative';
export type Priority = 'High' | 'Medium' | 'Low';
export type CaseStatus =
  | 'รับเรื่อง' | 'ส่งต่อหน่วยงานที่รับผิดชอบ' | 'กำลังดำเนินการ'
  | 'รอข้อมูลเพิ่มเติม' | 'ติดตามผล' | 'ดำเนินการเสร็จ/ปิดเรื่อง';

export interface Voc {
  id: string; ref: string;
  channel: string; source: string;
  project: string; projectType: string;
  journey: string; topic: string; voice: string;
  sentiment: Sentiment; priority: Priority;
  owner: string; status: CaseStatus;
  occurredAt: string; importedAt: string; imported: boolean;
  catProduct: string; catSales: string;
  sentConf: number; sentUncertain: boolean; sentManual: boolean; sentReason: string;
}

export const CHANNELS = [
  'Social Media', 'Website / Email / DB', 'ทีมรณรงค์ขาย', 'ฝ่ายงานสำนักงานใหญ่',
  'สำนักงานสาขาทั่วประเทศ', 'Call Center', 'ระบบร้องเรียน/ข้อเสนอแนะ', 'แบบประเมินความพึงพอใจ'
];
export const PROJECT_TYPES = ['บ้านเอื้ออาทร', 'เคหะชุมชน', 'เคหะชุมชนและบริการชุมชน'];
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
// เดาประเภทโครงการจากชื่อ (สำหรับ mock; ของจริงอ่านจากคอลัมน์ project_type)
export function projectTypeOf(name: string): string {
  if (name.startsWith('เคหะชุมชนและบริการชุมชน')) return 'เคหะชุมชนและบริการชุมชน';
  if (name.startsWith('บ้านเอื้ออาทร')) return 'บ้านเอื้ออาทร';
  return 'เคหะชุมชน';
}
const MOCK_PROJECTS = ['บ้านเอื้ออาทร รังสิต คลอง 1', 'เคหะชุมชนดินแดง', 'บ้านเอื้ออาทร บางบัวทอง 1', 'เคหะชุมชนห้วยขวาง', 'เคหะชุมชนและบริการชุมชน ร่มเกล้า'];
const MOCK: Voc[] = Array.from({ length: 60 }, (_, i) => {
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
    owner: v.owner, status: pick(CASE_STATUS, i),
    occurredAt: `${mm}-${String(day).padStart(2, '0')}`,
    importedAt: imported ? '2026-06-26' : `${mm}-${String(day).padStart(2, '0')}`,
    imported, catProduct: v.cat, catSales: 'การให้ข้อมูลโครงการ',
    ...(az => ({ sentConf: az.conf, sentUncertain: az.uncertain, sentManual: false, sentReason: az.reason }))(aiSentiment(v.voice)),
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
    project: proj?.name ?? '', projectType: proj?.project_type ?? '',
    journey: r.journey_stage ?? '', topic: r.topic ?? '', voice: r.raw_text ?? '',
    sentiment: (a.sentiment ?? 'Neutral') as Sentiment, priority: (a.priority ?? 'Low') as Priority,
    owner: r.owner_dept ?? '', status: (r.status ?? 'รับเรื่อง') as CaseStatus,
    occurredAt: r.occurred_at ?? '', importedAt: r.imported_at ?? r.occurred_at ?? '',
    imported: !!r.is_imported, catProduct: a.cat_product ?? '', catSales: a.cat_sales ?? '',
    sentConf: a.sentiment_confidence ?? 0, sentUncertain: (a.sentiment_confidence ?? 100) <= 50 && !a.sentiment_manual,
    sentManual: !!a.sentiment_manual, sentReason: a.sentiment_reason ?? '',
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
export async function listVOC(opts: { q?: string; channel?: string; ptype?: string; proj?: string; limit?: number } = {}): Promise<Voc[]> {
  let r = await fetchAll();
  if (opts.channel) r = r.filter(x => x.channel === opts.channel);
  if (opts.ptype) r = r.filter(x => x.projectType === opts.ptype);
  if (opts.proj) r = r.filter(x => x.project === opts.proj);
  if (opts.q) { const q = opts.q.toLowerCase(); r = r.filter(x => (x.voice + x.topic + x.ref + x.owner + x.project).toLowerCase().includes(q)); }
  return r.slice(0, opts.limit ?? r.length);
}
// รายชื่อโครงการ (distinct) พร้อมประเภท — ใช้ทำ cascade filter
export async function listProjects(): Promise<{ name: string; type: string }[]> {
  const all = await fetchAll();
  const m = new Map<string, string>();
  all.forEach(x => { if (x.project && !m.has(x.project)) m.set(x.project, x.projectType || projectTypeOf(x.project)); });
  return Array.from(m, ([name, type]) => ({ name, type })).sort((a, b) => a.name.localeCompare(b.name, 'th'));
}
export async function getVOC(id: string): Promise<Voc | undefined> {
  return (await fetchAll()).find(x => x.id === id);
}

// ---------- Timeline การดำเนินการ (action_log) ----------
export interface ActionItem { text: string; status: string; by: string; at: string }
export async function getTimeline(voc: Voc): Promise<ActionItem[]> {
  if (hasSupabase && supabase) {
    const { data, error } = await supabase
      .from('action_log')
      .select('action_text, status, acted_at, profiles(full_name)')
      .eq('voc_id', voc.id)
      .order('acted_at', { ascending: true });
    if (!error && data && data.length) {
      return data.map((r: any) => ({
        text: r.action_text, status: r.status ?? '',
        by: (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles)?.full_name ?? 'เจ้าหน้าที่',
        at: (r.acted_at ?? '').slice(0, 16).replace('T', ' '),
      }));
    }
  }
  // mock: สร้าง timeline ตามลำดับสถานะจนถึงสถานะปัจจุบัน
  const idx = CASE_STATUS.indexOf(voc.status);
  const TEXT: Record<CaseStatus, string> = {
    'รับเรื่อง': 'ระบบรับเรื่องจากช่องทาง ' + voc.channel,
    'ส่งต่อหน่วยงานที่รับผิดชอบ': 'แอดมินส่งต่อเรื่องไปยัง ' + (voc.owner || 'หน่วยงานที่รับผิดชอบ'),
    'กำลังดำเนินการ': 'หน่วยงานรับเรื่องและเริ่มดำเนินการ',
    'รอข้อมูลเพิ่มเติม': 'ขอข้อมูลเพิ่มเติมจากลูกค้า/หน่วยงาน',
    'ติดตามผล': 'แอดมินติดตามความคืบหน้าจากหน่วยงาน',
    'ดำเนินการเสร็จ/ปิดเรื่อง': 'ดำเนินการแล้วเสร็จ แจ้งผลและปิดเรื่อง',
  };
  return CASE_STATUS.slice(0, idx + 1).map((s, i) => ({
    text: TEXT[s], status: s, by: i === 0 ? 'ระบบ' : 'แอดมิน VOC',
    at: voc.occurredAt + (i ? ` (+${i} วัน)` : ''),
  }));
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
    const t = rows.length || 1;
    const pos = rows.filter(x => x.sentiment === 'Positive').length;
    const neu = rows.filter(x => x.sentiment === 'Neutral').length;
    const neg = rows.filter(x => x.sentiment === 'Negative').length;
    return {
      name, count: rows.length,
      posPct: Math.round(pos / t * 100), neuPct: Math.round(neu / t * 100), negPct: Math.round(neg / t * 100),
    };
  });
}
