// lib/dataServer.ts — ชั้นข้อมูล "ฝั่งเซิร์ฟเวอร์" + ด่านตรวจสิทธิ์
//
// ====== ทำไมต้องมีไฟล์นี้ (อ่านก่อนแก้) ======
// เดิม server component ดึงข้อมูลด้วย anon key ตัวเดียวกับเบราว์เซอร์ ซึ่งมีปัญหาใหญ่ 2 ข้อ
//   1) เซิร์ฟเวอร์ไม่รู้ว่าใครล็อกอินอยู่ → ต้องเปิดสิทธิ์อ่านให้ role `anon`
//      anon key ฝังอยู่ในไฟล์ JS ของเว็บ ใครก็หยิบไปยิง API ตรงแล้วอ่านเสียงลูกค้าได้ทั้งหมด
//   2) AuthGate เป็น client component — มันแค่ "วางฟอร์มล็อกอินทับ" หน้าจอ
//      แต่ข้อมูลถูกดึงและฝังลง HTML ไปแล้วตั้งแต่ฝั่งเซิร์ฟเวอร์
//      คนที่ยังไม่ล็อกอินจึงเห็นข้อมูลได้จากซอร์สของหน้าเว็บ (ทดสอบแล้วว่าเห็นจริง)
//
// ไฟล์นี้แก้ทั้งสองข้อ: อ่าน session ของผู้ใช้จาก cookie แล้วคุยกับ Supabase ในนามผู้ใช้คนนั้น
// RLS จึงคุมได้จริง และ requireUser() ต้องถูกเรียก **ก่อน** ดึงข้อมูลทุกครั้ง
//
// ⚠️ กติกาที่ห้ามพลาด
//   - ทุกหน้าที่เป็น server component ต้องเรียก `await requireUser()` ก่อนดึงข้อมูลเสมอ
//     middleware ช่วยกรองชั้นแรกก็จริง แต่ห้ามพึ่ง middleware อย่างเดียว (เคยมีช่องโหว่ข้าม middleware ของ Next.js มาแล้ว)
//   - ห้าม import ไฟล์นี้เข้า client component (มี 'server-only' กันไว้ — จะ build ไม่ผ่านทันทีถ้าเผลอ)
//   - ห้ามใช้ lib/supabaseClient.ts ในโค้ดฝั่งเซิร์ฟเวอร์ (ตัวนั้นสำหรับเบราว์เซอร์เท่านั้น)
import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MOCK, CHANNELS, projectTypeOf, type Voc, type Sentiment, type Priority } from './data';
import { IS_DEMO } from './demo';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const hasSupabase = Boolean(url && key);

/** ตัวเชื่อม Supabase ที่ผูกกับ session ของผู้ใช้คนที่กำลังเปิดหน้าอยู่ (อ่านจาก cookie) */
export function getServerSupabase(): SupabaseClient | null {
  if (!hasSupabase) return null;
  const store = cookies();
  return createServerClient(url as string, key as string, {
    cookies: {
      get: (name: string) => store.get(name)?.value,
      // server component เขียน cookie ไม่ได้ — การต่ออายุ token ทำที่ middleware.ts แทน
      set: () => { /* ไม่ทำอะไร */ },
      remove: () => { /* ไม่ทำอะไร */ },
    },
  });
}

export interface SessionUser { id: string; email: string; role: string; fullName: string }

/**
 * ด่านตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์ — ต้องเรียกก่อนดึงข้อมูลทุกหน้า
 * ไม่ได้ล็อกอิน / ยังรออนุมัติ → เด้งไป /login **ก่อน** ที่ข้อมูลจะถูกดึงและฝังลงหน้าเว็บ
 * โหมดสาธิต (ยังไม่ตั้งค่า ENV) → ปล่อยผ่าน เพราะไม่มีข้อมูลจริงให้รั่ว
 */
export async function requireUser(): Promise<SessionUser | null> {
  // ---------- เว็บสาธิต ----------
  // ปล่อยผ่านโดยไม่ต้องล็อกอิน (ผู้ประเมิน/บุคคลทั่วไปเปิดดูได้) — ปลอดภัยเพราะ
  //   ฐานข้อมูลที่เว็บสาธิตชี้ไป เป็นฐานคนละชุดกับระบบจริง มีแต่ข้อมูลจำลอง และล็อกเป็นอ่านอย่างเดียว
  //   ถ้า ENV ชุดนี้ถูกเผลอใส่บนระบบจริง การอ่านจะถูก RLS ปฏิเสธ (ฐานจริงไม่เปิดสิทธิ์ให้ anon)
  //   หน้าเว็บจะว่าง ไม่ใช่ข้อมูลประชาชนรั่ว — ดู lib/demo.ts หัวข้อ "กุญแจสองดอก"
  if (IS_DEMO) return null;

  const sb = getServerSupabase();
  if (!sb) return null;                       // โหมดสาธิต — ใช้ข้อมูลจำลองเท่านั้น

  // ต้องใช้ getUser() ไม่ใช่ getSession() — getUser ยิงไปตรวจกับเซิร์ฟเวอร์ Supabase จริง
  // ส่วน getSession อ่านจาก cookie ดิบ ๆ ซึ่งผู้ใช้ปลอมขึ้นมาเองได้
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) redirect('/login');

  const { data: p } = await sb.from('profiles').select('role, full_name').eq('id', data.user.id).single();
  const role = p?.role ?? '';
  if (!role || role === 'pending') redirect('/login');   // สมัครแล้วแต่แอดมินยังไม่อนุมัติ

  return { id: data.user.id, email: data.user.email ?? '', role, fullName: p?.full_name ?? '' };
}

/** เฉพาะหน้าที่แอดมินเท่านั้นที่เข้าได้ */
export async function requireAdmin(): Promise<SessionUser | null> {
  if (IS_DEMO) redirect('/dashboard');   // เว็บสาธิตไม่มีแอดมิน และไม่ให้แก้ไขอะไรได้
  const u = await requireUser();
  if (u && u.role !== 'admin') redirect('/dashboard');
  return u;
}

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
    owner: r.owner_dept ?? '',
    ownerAi: r.owner_dept_ai ?? '',
    ownerFixed: !!r.owner_dept_by,
    sourceRef: r.source_ref ?? '',
    occurredAt: r.occurred_at ?? '', importedAt: r.imported_at ?? r.occurred_at ?? '',
    imported: !!r.is_imported, catProduct: a.cat_product ?? '', catSales: a.cat_sales ?? '',
    sentConf: a.sentiment_confidence ?? 0, sentUncertain: (a.sentiment_confidence ?? 100) <= 50 && !a.sentiment_manual,
    sentManual: !!a.sentiment_manual, sentReason: a.sentiment_reason ?? '',
  };
}

// ---------- ดึงข้อมูลทั้งหมด (Supabase หรือ mock) ----------
const PAGE = 1000;   // Supabase/PostgREST จำกัดผลลัพธ์ต่อคำขอ (ค่าเริ่มต้น 1000 แถว)
const MAX_PAGES = 30;  // กันวนไม่รู้จบ (สูงสุด 30,000 แถว)

// เลือกเฉพาะคอลัมน์ที่หน้าเว็บใช้จริง — ไม่ใช้ '*' เพราะจะลากคอลัมน์ที่ไม่ได้ใช้
// (product_group / status / created_by / created_at) มาด้วย ทำให้ payload ใหญ่ขึ้นฟรี ๆ
const BASE_COLS =
  'id,ref_code,channel_id,source,project_id,journey_stage,raw_text,topic,occurred_at,imported_at,is_imported,owner_dept,' +
  'analysis(sentiment,sentiment_confidence,sentiment_manual,sentiment_reason,cat_product,cat_sales,priority),' +
  'project(name,project_type),channel(name)';

// คอลัมน์ที่เพิ่มเข้ามาทีหลังด้วยสคริปต์ SQL แยก
//   owner_dept_ai / owner_dept_by → supabase_owner_dept_tracking.sql
//   source_ref                    → supabase_source_ref.sql
const LATER_COLS = 'owner_dept_ai,owner_dept_by,source_ref,';
const SELECT_COLS = BASE_COLS.replace('owner_dept,', 'owner_dept,' + LATER_COLS);

// 🚨 ถ้า select คอลัมน์ที่ยังไม่มีในฐาน PostgREST จะตอบ error ทั้งคำขอ
//    ผลคือ **ทั้งเว็บขึ้น 0 รายการ** ทั้งที่ข้อมูลอยู่ครบ — เคยเป็นกับดักเดียวกับตอนรัน
//    supabase_lock_read_policy.sql สลับลำดับ
//    จึงถามฐานครั้งเดียวว่ารองรับคอลัมน์ชุดใหม่ไหม แล้วจำไว้ตลอดอายุเซิร์ฟเวอร์
//    = อัปโค้ดก่อนรัน SQL ได้ โดยเว็บยังทำงานปกติ แค่ยังไม่มีข้อมูลคอลัมน์ใหม่
let colsCache: string | null = null;
async function cols(sb: SupabaseClient): Promise<string> {
  if (colsCache) return colsCache;
  const { error } = await sb.from('voc_record').select(LATER_COLS.slice(0, -1)).limit(1);
  if (error) console.warn('ยังไม่ได้รัน SQL คอลัมน์เพิ่มเติม — ใช้คอลัมน์พื้นฐานไปก่อน:', error.message);
  colsCache = error ? BASE_COLS : SELECT_COLS;
  return colsCache;
}

function page(sb: SupabaseClient, from: number, select: string) {
  return sb
    .from('voc_record')
    .select(select)
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: true })   // ตัวตัดสินลำดับ กันแถวซ้ำ/หายเวลาแบ่งหน้า
    .range(from, from + PAGE - 1);
}

/** ยิงหน้าหนึ่ง พร้อมลองซ้ำเมื่อล้ม
 *
 *  ทำไมต้องมี: ที่ 10,012 แถว โค้ดยิง 11 คำขอพร้อมกัน แต่ละคำขอเชื่อม 4 ตาราง
 *  ถ้ามีคำขอใดคำขอหนึ่งล้ม (เครือข่ายสะดุด · ฐานตอบช้าช่วง deploy · ชนลิมิตชั่วคราว)
 *  โค้ดเดิมจะคืนเท่าที่ได้มาแล้วเงียบ ๆ หน้าเว็บยังสวยทุกอย่าง แต่ตัวเลขสรุปต่ำกว่าความจริง
 *  ซึ่งอันตรายกว่าเว็บล่ม เพราะไม่มีใครรู้ว่าตัวเลขที่อ่านอยู่ผิด
 *
 *  ลองซ้ำสูงสุด 3 ครั้ง เว้นระยะเพิ่มขึ้นทีละรอบ (0.3 → 0.9 วินาที) */
async function pageWithRetry(sb: SupabaseClient, from: number, select: string, tries = 3) {
  let last = await page(sb, from, select);
  for (let i = 1; i < tries && last.error; i++) {
    await new Promise(r => setTimeout(r, 300 * i));
    console.warn(`ดึงแถวที่ ${from}–${from + PAGE - 1} ไม่สำเร็จ (${last.error.message}) — ลองใหม่ครั้งที่ ${i + 1}`);
    last = await page(sb, from, select);
  }
  return last;
}

async function fetchAll(): Promise<Voc[]> {
  // ใช้ตัวเชื่อมที่ผูกกับ session ของผู้ใช้ — RLS ฝั่ง Postgres จึงเป็นด่านจริง ไม่ใช่แค่ด่านหน้าจอ
  const sb = getServerSupabase();
  if (!sb) return MOCK;

  // ต้องแบ่งหน้าเสมอ — ถ้ายิงครั้งเดียวจะได้แค่ 1000 แถวแรกเงียบ ๆ ไม่มี error
  // (ตอนข้อมูลยังน้อยจะไม่เห็นอาการ พอข้อมูลเกินพันแล้วตัวเลขทั้งระบบจะเพี้ยนทันที)
  //
  // นับก่อนแล้วยิงทุกหน้า "พร้อมกัน" — ที่ 10,000 แถวคือ 10 คำขอ
  // ถ้ายิงเรียงทีละหน้าจะกลายเป็นรอ 10 รอบต่อกัน หน้าเว็บหน่วงหลายวินาที
  const { count, error: cErr } = await sb
    .from('voc_record').select('id', { count: 'exact', head: true });

  const sel = await cols(sb);

  if (!cErr && count != null) {
    const pages = Math.min(Math.max(1, Math.ceil(count / PAGE)), MAX_PAGES);
    const res = await Promise.all(Array.from({ length: pages }, (_, i) => pageWithRetry(sb, i * PAGE, sel)));
    const out: Voc[] = [];
    for (const { data, error } of res) {
      if (error) { console.error('Supabase error:', error.message); return out.length ? out : MOCK; }
      out.push(...(data ?? []).map(mapRow));
    }
    // 🚨 ได้ไม่ครบ = ตัวเลขทุกตัวบนหน้าจอผิด โดยหน้าเว็บยังดูปกติทุกอย่าง
    //    เคยเกิดจริงตอน deploy ใหม่ ๆ หน้าภาพรวมขึ้น 3,000 แทน 10,012 (หน้าที่ 4 ล้มเงียบ ๆ)
    //    เขียน log ไว้ให้ตามย้อนได้ว่าหน้าที่เสิร์ฟไปตอนนั้นตัวเลขเชื่อไม่ได้
    if (out.length !== count) {
      console.error(`ดึงข้อมูลได้ไม่ครบ: ได้ ${out.length} จาก ${count} แถว — ตัวเลขสรุปบนหน้าจอจะต่ำกว่าความจริง`);
    }
    return out;
  }

  // สำรอง: นับไม่ได้ (เช่น policy ไม่ให้ count) → ไล่ทีละหน้าจนหมด
  console.error('Supabase count error:', cErr?.message);
  const out: Voc[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await pageWithRetry(sb, i * PAGE, sel);
    if (error) { console.error('Supabase error:', error.message); return out.length ? out : MOCK; }
    const batch = data ?? [];
    out.push(...batch.map(mapRow));
    if (batch.length < PAGE) break;
  }
  return out;
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
