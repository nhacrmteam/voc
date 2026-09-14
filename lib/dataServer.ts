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
const SELECT_COLS =
  'id,ref_code,channel_id,source,project_id,journey_stage,raw_text,topic,occurred_at,imported_at,is_imported,owner_dept,' +
  'analysis(sentiment,sentiment_confidence,sentiment_manual,sentiment_reason,cat_product,cat_sales,priority),' +
  'project(name,project_type),channel(name)';

function page(sb: SupabaseClient, from: number) {
  return sb
    .from('voc_record')
    .select(SELECT_COLS)
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: true })   // ตัวตัดสินลำดับ กันแถวซ้ำ/หายเวลาแบ่งหน้า
    .range(from, from + PAGE - 1);
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

  if (!cErr && count != null) {
    const pages = Math.min(Math.max(1, Math.ceil(count / PAGE)), MAX_PAGES);
    const res = await Promise.all(Array.from({ length: pages }, (_, i) => page(sb, i * PAGE)));
    const out: Voc[] = [];
    for (const { data, error } of res) {
      if (error) { console.error('Supabase error:', error.message); return out.length ? out : MOCK; }
      out.push(...(data ?? []).map(mapRow));
    }
    return out;
  }

  // สำรอง: นับไม่ได้ (เช่น policy ไม่ให้ count) → ไล่ทีละหน้าจนหมด
  console.error('Supabase count error:', cErr?.message);
  const out: Voc[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await page(sb, i * PAGE);
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
