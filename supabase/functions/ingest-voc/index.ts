// Supabase Edge Function: ingest-voc — Webhook รับเสียงลูกค้าเรียลไทม์จากช่องทางภายนอก
// รองรับ 2 รูปแบบ:
//   1) Generic JSON:  POST { channel_id, source?, text, topic?, occurred_at? (YYYY-MM-DD), project?, ... }
//   2) LINE Messaging API webhook: POST { events: [{ type:'message', message:{ type:'text', text }, timestamp }] }
// ความปลอดภัย — มี 2 แบบ แยกตามที่มาของ payload
//   ก) ระบบทั่วไป (Google Forms ฯลฯ): ส่ง header  x-voc-secret  ให้ตรงกับ webhook_secret ของช่องทางนั้น
//   ข) LINE Messaging API: **LINE ส่ง header ที่เรากำหนดเองไม่ได้** จึงใช้ลายเซ็น `x-line-signature` แทน
//      = HMAC-SHA256 ของ "เนื้อ request ดิบ" โดยใช้ Channel Secret เป็นกุญแจ แล้วเข้ารหัส Base64
//      กุญแจอ่านจาก Secret ชื่อ LINE_CHANNEL_SECRET ถ้าไม่ได้ตั้ง จะใช้ webhook_secret ของช่องทางนั้นแทน
//      (ใส่ Channel Secret ในหน้า จัดการระบบ → ช่องทาง Social Media ก็ใช้งานได้เลย ไม่ต้อง deploy ใหม่)
//
// 🚨 ห้ามแปลง/parse เนื้อ request ก่อนตรวจลายเซ็น — ต้องใช้สตริงดิบเท่านั้น
//    ถ้า JSON.parse แล้ว stringify กลับ ตัวอักษรจะเปลี่ยน (ช่องว่าง/ลำดับคีย์/escape) ลายเซ็นจะไม่ตรงทุกครั้ง
//
// PDPA: **ไม่เก็บ LINE userId** (อยู่ใน events[].source.userId) เก็บเฉพาะข้อความที่ลูกค้าพิมพ์เข้ามา
//       ระบุตัวบุคคลไม่ได้ = ลดภาระการคุ้มครองข้อมูลส่วนบุคคลลงมาก
//
// กันบันทึกซ้ำ: LINE ส่งซ้ำเมื่อเราตอบไม่ใช่ 2xx (Webhook redelivery) จึงตั้ง ref_code = 'VOC-LINE-<message.id>'
//       ซึ่ง unique ในตาราง ถ้าซ้ำ Postgres จะปฏิเสธเอง แล้วเรานับเป็น duplicate ไม่ใช่ error
//
// สำคัญ: ตอน Deploy ให้ปิด "Enforce JWT" (เพราะระบบภายนอกเรียกเข้ามาโดยไม่มี token ของ Supabase)
// วิเคราะห์: เรียก LLM จริงก่อน (ผ่าน Edge Function analyze-voc) ถ้าใช้ไม่ได้จึงใช้ rule-based ทันที
//   → บันทึก engine='llm'|'rule' ลงตาราง analysis (ต้องรัน supabase_llm_engine.sql ก่อน)
//   ตั้ง Secret เพิ่ม (ไม่บังคับ): LLM_TIMEOUT_MS (ค่าเริ่มต้น 20000) — เว็บฮุกต้องตอบเร็ว จึงตั้งสั้นกว่า analyze-voc

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-voc-secret, x-line-signature',
};
const J = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ---------- กลบข้อมูลส่วนบุคคลก่อนบันทึก (PDPA) ----------
// สำเนาย่อของ lib/pii.ts — **แหล่งจริงคือ lib/pii.ts แก้ที่นั่นแล้วต้องมาแก้ที่นี่ด้วย**
// (Edge Function รันบน Deno คนละที่กับเว็บ จึง import ข้ามกันไม่ได้)
//
// ทำไมต้องกลบ "ก่อนบันทึก" ไม่ใช่กลบตอนแสดงผล
//   ถ้าบันทึกข้อความดิบไว้ก่อน ฐานข้อมูลก็มีข้อมูลส่วนบุคคลอยู่จริงแล้ว ต่อให้หน้าจอไม่แสดง
//   การกลบตั้งแต่ประตูทางเข้า = ข้อมูลส่วนบุคคลไม่เคยถูกเก็บลงระบบเลย
function isThaiId(d: string): boolean {
  if (!/^\d{13}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(d[12]);
}
const PII_RULES: { kind: string; re: RegExp; keep?: (m: string) => boolean }[] = [
  { kind: 'อีเมล', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { kind: 'ลิงก์โปรไฟล์', re: /https?:\/\/(?:www\.)?(?:facebook|fb|m\.facebook|line|instagram|x|twitter|tiktok)\.[^\s]+/gi },
  { kind: 'เลขบัตรประชาชน', re: /(?<![\d-])\d[\s-]?\d{4}[\s-]?\d{5}[\s-]?\d{2}[\s-]?\d(?![\d-])/g,
    keep: m => isThaiId(m.replace(/[\s-]/g, '')) },
  // เลขที่บัญชีธนาคารไทยแบบมีขีด 3-1-5-1 — ต้องมาก่อนกฎเบอร์โทร (ซิงก์กับ lib/pii.ts)
  { kind: 'เลขที่บัญชี', re: /(?<![\d-])\d{3}-\d-\d{5}-\d(?![\d-])/g },
  { kind: 'เบอร์โทร', re: /(?<![\d-])(?:\+66[\s-]?|0)\d(?:[\s-]?\d){7,8}(?![\d-])/g },
  { kind: 'ไอดีโซเชียล', re: /(?:ไลน์\s*(?:ไอ?ดี)?|line\s*id|ไอดีไลน์|ig|อินสตาแกรม)\s*[:：]?\s*@?[A-Za-z0-9._-]{3,}/gi },
  { kind: 'ชื่อ-สกุล', re: /(?:นาย|นางสาว|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.|คุณ)\s?[ก-๙]{2,}(?:\s+[ก-๙]{2,})?/g },
  { kind: 'ที่อยู่', re: /(?:บ้านเลขที่|เลขที่บ้าน|ที่อยู่|อาศัยอยู่ที่)\s*[:：]?\s*[\d/\-]+(?:\s*(?:หมู่|ม\.)\s*\d+)?/g },
  { kind: 'เลขที่บัญชี', re: /(?:เลขที่บัญชี|บัญชีเลขที่|เลขบัญชี|บัญชีธนาคาร|เลขบช\.?|บช\.?|โอนเข้าบัญชี|เข้าบัญชี|บัญชี)\s*[:：]?\s*[\d-]{9,}/g },
  { kind: 'ทะเบียนรถ', re: /(?:ทะเบียนรถ|ทะเบียน)\s*[:：]?\s*\d?[ก-ฮ]{1,2}\s?\d{1,4}/g },
];
function maskPII(text: string): { masked: string; kinds: string[] } {
  const s = text || '';
  const taken: [number, number][] = [];
  const hits: { kind: string; a: number; b: number }[] = [];
  for (const r of PII_RULES) {
    r.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = r.re.exec(s)) !== null) {
      const a = m.index, b = a + m[0].length;
      if (taken.some(([x, y]) => a < y && b > x)) continue;
      if (r.keep && !r.keep(m[0])) continue;
      taken.push([a, b]); hits.push({ kind: r.kind, a, b });
    }
  }
  hits.sort((x, y) => x.a - y.a);
  let out = s;
  for (let i = hits.length - 1; i >= 0; i--) out = out.slice(0, hits[i].a) + '[' + hits[i].kind + ']' + out.slice(hits[i].b);
  return { masked: out, kinds: hits.map(h => h.kind) };
}

// ---------- ตรวจลายเซ็นของ LINE ----------
/** HMAC-SHA256(rawBody, channelSecret) → Base64 — ต้องได้สตริงเดียวกับที่ LINE ใส่มาใน x-line-signature */
async function lineSignature(rawBody: string, channelSecret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(channelSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/** เทียบแบบใช้เวลาคงที่ — เทียบด้วย === จะรั่วข้อมูลว่า "ตรงไปกี่ตัว" ให้คนเดาลายเซ็นทีละตัวอักษรได้ */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------- rule-based วิเคราะห์ (ย่อจาก lib/ai.ts ให้รันใน Deno) ----------
const POS = ['ประทับใจ', 'ชื่นชม', 'ขอบคุณ', 'ดีมาก', 'พอใจ', 'สุภาพ', 'ชัดเจน', 'รวดเร็ว', 'สะดวก', 'ยอดเยี่ยม', 'แนะนำ'];
const NEG = ['ไม่เพียงพอ', 'ไม่สะดวก', 'ไม่', 'สกปรก', 'ดับ', 'ล่าช้า', 'ช้า', 'ค้าง', 'ขัดข้อง', 'รั่ว', 'อ่อน', 'มืด', 'ชำรุด', 'เด้งออก', 'แย่', 'เสีย', 'ปัญหา', 'ผิดหวัง', 'ร้องเรียน', 'ยกเลิก'];
interface Analyzed {
  sentiment: string; conf: number; uncertain: boolean; owner: string; priority: string; reason: string;
  journey: string | null; catProduct: string | null; catSales: string | null;
  engine: 'rule' | 'llm'; model: string | null;
}
function mini(text: string, channel: string): Analyzed {
  const t = (text || '').toLowerCase();
  const pos = POS.filter(k => t.includes(k)).length, neg = NEG.filter(k => t.includes(k)).length;
  const total = pos + neg;
  const sentiment = total === 0 ? 'Neutral' : pos > neg ? 'Positive' : 'Negative';
  const uncertain = pos > 0 && neg > 0 && Math.abs(pos - neg) <= 1;
  const conf = total === 0 ? 70 : uncertain ? 50 : Math.min(96, 62 + Math.abs(pos - neg) * 14);
  const has = (ks: string[]) => ks.some(k => t.includes(k));
  // ต้องตรงกับ ownerFor() ใน lib/ai.ts — แก้ที่ไหนต้องแก้ทั้งสองที่
  // 'ฝ่ายบริหารงานชุมชน' = ชื่อกลาง ๆ ไม่ระบุภูมิภาค (เว็บฮุกไม่รู้จังหวัดของโครงการ)
  // 🚨 ห้ามใช้คำกว้าง: 'ไฟ' ติด 'รถไฟฟ้า' · 'ผ่อน' ติด 'ผ่อนผัน' · 'โครงสร้าง' ติด 'ปรับโครงสร้างหนี้'
  const owner =
    has(['ฟ้อง', 'ทุจริต', 'โกง']) ? 'ฝ่ายกฎหมาย'
    : has(['ผนังร้าว', 'พื้นทรุด', 'โครงสร้างอาคาร', 'คุณภาพการก่อสร้าง', 'หลังคารั่ว']) ? 'ฝ่ายปรับปรุงและบำรุงรักษาชุมชน'
    : has(['ระบบจอง', 'จองออนไลน์', 'เว็บไซต์', 'แอป', 'ระบบขัดข้อง', 'เด้งออก', 'ล็อกอิน']) ? 'ฝ่ายเทคโนโลยีสารสนเทศ'
    : has(['หนังสือรับรอง', 'รับรองการอยู่อาศัย', 'ทะเบียนบ้าน', 'สำเนาสัญญา', 'ขอเอกสาร',
           'เพื่อนบ้าน', 'เสียงดัง', 'สัตว์เลี้ยง', 'ต่อเติม', 'จอดรถขวาง',
           'ต่อสัญญาเช่า', 'ผ่อนผันค่าเช่า', 'ย้ายห้อง', 'คืนห้อง', 'ผู้เช่า',
           'ส่วนกลาง', 'ความสะอาด', 'สกปรก', 'ขยะ', 'แจ้งซ่อม', 'ซ่อม', 'ชำรุด', 'รั่ว', 'ประปา',
           'ไฟดับ', 'ไฟทางเดิน', 'ลิฟต์', 'สนามเด็กเล่น', 'จอดรถ', 'สาธารณูปโภค']) ? 'ฝ่ายบริหารงานชุมชน'
    : has(['สินเชื่อ', 'ผ่อนชำระ', 'ค่างวด', 'ค้างชำระ', 'หนี้', 'ดอกเบี้ย', 'เงินประกัน']) ? 'ฝ่ายบริหารสินเชื่อและหนี้'
    : has(['โอนกรรมสิทธิ์', 'ทำสัญญา', 'เช่าซื้อ']) ? 'ฝ่ายบริหารงานขาย'
    : (channel === 'complain' || has(['ร้องเรียน', 'ข้อเสนอแนะ'])) ? 'ฝ่ายสื่อสารองค์กร'
    : 'ฝ่ายการตลาด';
  const priority = sentiment === 'Negative' ? (has(['ด่วน', 'อันตราย', 'ไม่ปลอดภัย', 'หลายวัน']) ? 'High' : 'Medium') : 'Low';
  // Customer Journey — ดูประเด็นในข้อความก่อน ถ้ากำกวมใช้ช่องทางต้นทางช่วย
  const CH_JR: Record<string, string> = {
    social: 'Awareness', web: 'Consideration', sales: 'Consideration',
    hq: 'Service', branch: 'Service', call: 'Service', complain: 'Service', survey: 'Loyalty',
  };
  const journey =
    has(['ยกเลิกสัญญา', 'ขอคืนเงิน', 'ย้ายออก', 'เลิกใช้']) ? 'Win Back'
    : has(['แนะนำต่อ', 'บอกต่อ', 'ซื้อเพิ่ม', 'ประทับใจ', 'ชื่นชม']) ? 'Loyalty'
    // คำถาม ("อยากทราบเงื่อนไขเช่าซื้อ") ต้องมาก่อน Purchase ไม่งั้นถูกจัดเป็นการซื้อผิด ๆ
    : has(['สอบถาม', 'เงื่อนไข', 'อยากทราบ', 'อยากรู้', 'เปรียบเทียบ', 'สนใจ']) ? 'Consideration'
    : has(['โอนกรรมสิทธิ์', 'ทำสัญญา', 'ยื่นกู้', 'วางดาวน์', 'ระบบจอง', 'จองสิทธิ์', 'ใบจอง', 'นัดโอน']) ? 'Purchase'
    : has(['แจ้งซ่อม', 'ร้องเรียน', 'ส่วนกลาง', 'ชำรุด', 'ซ่อม', 'ประปา', 'ค่างวด', 'ค่าเช่า', 'ลิฟต์']) ? 'Service'
    : has(['เช่าซื้อ', 'ดาวน์', 'จอง', 'ราคา']) ? 'Purchase'
    : has(['โฆษณา', 'ประชาสัมพันธ์', 'เพจ', 'รู้จัก']) ? 'Awareness'
    : (CH_JR[channel] ?? 'Service');
  return {
    sentiment, conf, uncertain, owner, priority,
    reason: total === 0 ? 'ไม่พบคำบ่งชี้อารมณ์ชัดเจน (รับจาก API)' : uncertain ? 'สัญญาณผสม — ควรให้เจ้าหน้าที่ยืนยัน (รับจาก API)' : 'วิเคราะห์อัตโนมัติตอนรับจาก API',
    journey, catProduct: null, catSales: null,
    engine: 'rule', model: null,
  };
}

// ---------- วิเคราะห์ด้วย LLM จริง (เรียก Edge Function analyze-voc ในโปรเจกต์เดียวกัน) ----------
// ส่งได้ครั้งละไม่เกิน 10 รายการ (ตาม MAX_BATCH ของ analyze-voc)
async function llmBatch(texts: string[], channel: string): Promise<Analyzed[] | null> {
  const url = Deno.env.get('SUPABASE_URL');
  const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !svc || !Deno.env.get('LLM_API_KEY')) return null;   // ยังไม่ตั้งค่า LLM → ใช้ rule
  const ms = Number(Deno.env.get('LLM_TIMEOUT_MS') ?? '20000');
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url.replace(/\/$/, '') + '/functions/v1/analyze-voc', {
      method: 'POST',
      signal: ac.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + svc, apikey: svc },
      body: JSON.stringify({ texts, channel }),
    });
    clearTimeout(timer);
    if (!r.ok) return null;
    const d = await r.json();
    const rs = d?.results;
    if (!Array.isArray(rs) || rs.length !== texts.length) return null;
    return rs.map((o: Record<string, unknown>) => ({
      sentiment: String(o.sentiment ?? 'Neutral'),
      conf: Number(o.confidence ?? 70),
      uncertain: !!o.uncertain,
      owner: String(o.owner ?? 'ฝ่ายการตลาด'),
      priority: String(o.priority ?? 'Low'),
      reason: String(o.reason ?? 'วิเคราะห์โดย LLM (รับจาก API)'),
      journey: (o.journey as string) ?? null,
      catProduct: (o.catProduct as string) ?? null,
      catSales: (o.catSales as string) ?? null,
      engine: 'llm' as const,
      model: (d.model as string) ?? null,
    })) as Analyzed[];
  } catch {
    clearTimeout(timer);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return J({ error: 'ใช้ POST เท่านั้น' }, 405);
  try {
    // อ่านเนื้อ request เป็น "สตริงดิบ" ก่อน แล้วค่อย parse — ลายเซ็นของ LINE คำนวณจากสตริงนี้
    const raw = await req.text();
    let body: any;
    try { body = JSON.parse(raw); } catch { return J({ error: 'body ไม่ใช่ JSON' }, 400); }
    const secret = req.headers.get('x-voc-secret') ?? '';
    const lineSig = req.headers.get('x-line-signature') ?? '';
    const isLine = !!lineSig || Array.isArray(body.events);

    // แปลง payload → รายการข้อความ
    let channelId = String(body.channel_id ?? '');
    let items: { text: string; topic?: string; source?: string; occurred_at?: string; refCode?: string }[] = [];
    if (isLine) {
      // LINE Messaging API webhook
      channelId = channelId || 'social';
      items = (Array.isArray(body.events) ? body.events : [])
        .filter((e: any) => e.type === 'message' && e.message?.type === 'text' && e.message.text)
        .map((e: any) => ({
          text: String(e.message.text),
          source: 'Line OA',
          occurred_at: e.timestamp ? new Date(e.timestamp).toISOString().slice(0, 10) : undefined,
          // message.id ไม่ซ้ำกันทั้งระบบของ LINE → ใช้กันบันทึกซ้ำตอน LINE ส่งมาใหม่
          refCode: e.message?.id ? 'VOC-LINE-' + String(e.message.id) : undefined,
        }));
      // LINE ยิง "ตรวจสอบ URL" ด้วย events ว่าง — ต้องตอบ 200 ไม่งั้นกดปุ่ม Verify ไม่ผ่าน
      // (ยังไม่ตรวจลายเซ็นตรงนี้ เพราะต้องรู้ channel ก่อนถึงจะหากุญแจเจอ — ตรวจในขั้นถัดไป)
    } else if (body.text) {
      items = [{ text: String(body.text), topic: body.topic, source: body.source, occurred_at: body.occurred_at }];
    } else {
      return J({ error: 'payload ไม่ถูกต้อง — ต้องมี text หรือ events' }, 400);
    }
    if (!channelId) return J({ error: 'ต้องระบุ channel_id (social/web/sales/hq/branch/call/complain/survey)' }, 400);

    // เช็ก secret กับตาราง channel (ใช้ service role — ไม่ผ่าน RLS)
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: ch, error: chErr } = await db.from('channel')
      .select('id, api_enabled, webhook_secret').eq('id', channelId).single();
    if (chErr || !ch) return J({ error: 'ไม่พบช่องทาง ' + channelId }, 404);
    if (!ch.api_enabled) return J({ error: 'ช่องทางนี้ยังไม่เปิดรับ API — เปิดได้ที่เมนูจัดการระบบ' }, 403);

    if (isLine) {
      // ตรวจลายเซ็น LINE — กุญแจคือ Channel Secret
      const key = Deno.env.get('LINE_CHANNEL_SECRET') || ch.webhook_secret || '';
      if (!key) return J({ error: 'ยังไม่ได้ตั้ง Channel Secret ของ LINE (ตั้งที่ จัดการระบบ หรือ Secret LINE_CHANNEL_SECRET)' }, 500);
      if (!lineSig) return J({ error: 'ไม่พบ x-line-signature' }, 401);
      if (!safeEqual(lineSig, await lineSignature(raw, key))) return J({ error: 'ลายเซ็น LINE ไม่ถูกต้อง' }, 401);
      // ลายเซ็นผ่านแล้วแต่ไม่มีข้อความ (เช่น ปุ่ม Verify, สติกเกอร์, รูป, เหตุการณ์ follow/unfollow)
      if (!items.length) return J({ ok: true, saved: 0, note: 'ไม่มีข้อความ text ใน events' });
    } else {
      if (!ch.webhook_secret || secret !== ch.webhook_secret) return J({ error: 'x-voc-secret ไม่ถูกต้อง' }, 401);
    }

    // บันทึก voc_record + analysis
    const today = new Date().toISOString().slice(0, 10);
    const stamp = Date.now();
    const results: string[] = [];
    const maskedCount: Record<string, number> = {};   // กลบข้อมูลส่วนบุคคลอะไรไปบ้าง
    let duplicate = 0;   // LINE ส่งซ้ำ (redelivery) — ไม่ใช่ข้อผิดพลาด

    // วิเคราะห์ล่วงหน้าทั้งชุด: LLM ก่อน (ครั้งละ 10) → ชุดไหนไม่สำเร็จใช้ rule-based
    // ส่งข้อความที่กลบแล้วให้ AI ด้วย — ไม่ส่งข้อมูลส่วนบุคคลออกไปนอกระบบ
    const fullTexts = items.map(it => (it.topic ? it.topic + ' ' : '') + maskPII(it.text).masked);
    const analyzed: Analyzed[] = [];
    for (let i = 0; i < fullTexts.length; i += 10) {
      const chunk = fullTexts.slice(i, i + 10);
      const viaLLM = await llmBatch(chunk, channelId);
      analyzed.push(...(viaLLM ?? chunk.map(t => mini(t, channelId))));
    }
    let llmCount = 0;
    analyzed.forEach(a => { if (a.engine === 'llm') llmCount++; });

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const a = analyzed[i];
      // 🔒 กลบข้อมูลส่วนบุคคลก่อนบันทึกเสมอ — ข้อความดิบต้องไม่ถูกเก็บลงฐานข้อมูล
      const pii = maskPII(it.text);
      pii.kinds.forEach(k => { maskedCount[k] = (maskedCount[k] ?? 0) + 1; });
      const row: Record<string, unknown> = {
        ref_code: it.refCode ?? ('VOC-API-' + stamp + '-' + (i + 1)),
        channel_id: channelId,
        source: it.source ?? null,
        raw_text: pii.masked,
        topic: it.topic ?? null,
        occurred_at: it.occurred_at ?? today,   // เรียลไทม์: วันที่เกิดเรื่อง = วันนี้ (ถ้าไม่ส่งมา)
        is_imported: false,                      // มาจาก API ไม่ใช่ไฟล์
        journey_stage: a.journey,                // LLM จำแนกให้ (rule-based = null)
        owner_dept: a.owner,
        // ฝ่ายที่ระบบเสนอ — เก็บแยกไว้ถาวร เจ้าหน้าที่แก้ owner_dept ได้ แต่ค่านี้ต้องไม่เปลี่ยน
        // ใช้วัด "ส่งถึงฝ่ายถูกต้องตั้งแต่ครั้งแรก" (ดู supabase_owner_dept_tracking.sql)
        owner_dept_ai: a.owner,
      };
      let { data: rec, error: e1 } = await db.from('voc_record').insert(row)
        .select('id, ref_code').single();
      // ยังไม่ได้รัน supabase_owner_dept_tracking.sql → ไม่มีคอลัมน์ owner_dept_ai
      // ลองใหม่โดยตัดคอลัมน์นั้นออก ดีกว่าปล่อยให้เสียงลูกค้าหายไปทั้งรายการ
      if (e1 && /owner_dept_ai|column/i.test(e1.message || '')) {
        const { owner_dept_ai: _drop, ...legacy } = row;
        ({ data: rec, error: e1 } = await db.from('voc_record').insert(legacy)
          .select('id, ref_code').single());
      }
      // 23505 = ref_code ซ้ำ → เป็นข้อความเดิมที่ LINE ส่งมาใหม่ ข้ามไปเงียบ ๆ ห้ามตอบ error
      // (ถ้าตอบไม่ใช่ 2xx LINE จะส่งซ้ำอีกเรื่อย ๆ กลายเป็นวนไม่รู้จบ)
      if (e1 && (e1 as { code?: string }).code === '23505') { duplicate++; continue; }
      if (e1) return J({ error: 'บันทึกไม่สำเร็จ: ' + e1.message, saved: results }, 500);
      const arow = {
        voc_id: rec.id,
        sentiment: a.sentiment,
        sentiment_confidence: a.conf,
        sentiment_reason: a.reason,
        journey_stage: a.journey,
        cat_product: a.catProduct,
        cat_sales: a.catSales,
        priority: a.priority,
        engine: a.engine,
        model: a.model,
        analyzed_by: 'api',
      };
      const { error: e2 } = await db.from('analysis').insert(arow);
      // ยังไม่ได้รัน supabase_llm_engine.sql → ไม่มีคอลัมน์ engine/model/analyzed_by
      if (e2 && /engine|model|analyzed_by|column/i.test(e2.message ?? '')) {
        const { engine: _e, model: _m, analyzed_by: _a, ...legacy } = arow;
        await db.from('analysis').insert(legacy);
      }
      results.push(rec.ref_code);
    }
    return J({
      ok: true, saved: results.length, duplicate, ref_codes: results, masked: maskedCount,
      analyzed_by: llmCount === results.length ? 'llm' : llmCount === 0 ? 'rule' : 'mixed',
      llm: llmCount, rule: results.length - llmCount,
    });
  } catch (e) {
    return J({ error: String(e) }, 500);
  }
});
