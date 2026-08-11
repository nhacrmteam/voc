// Supabase Edge Function: ingest-voc — Webhook รับเสียงลูกค้าเรียลไทม์จากช่องทางภายนอก
// รองรับ 2 รูปแบบ:
//   1) Generic JSON:  POST { channel_id, source?, text, topic?, occurred_at? (YYYY-MM-DD), project?, ... }
//   2) LINE Messaging API webhook: POST { events: [{ type:'message', message:{ type:'text', text }, timestamp }] }
// ความปลอดภัย: ต้องส่ง header  x-voc-secret  ให้ตรงกับ webhook_secret ของช่องทางนั้น (ตั้งในหน้า จัดการระบบ)
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
  const owner =
    has(['ซ่อม', 'ชำรุด', 'รั่ว', 'ประปา', 'ไฟ', 'ส่วนกลาง', 'สกปรก', 'ขยะ', 'จอดรถ']) ? 'ฝ่ายปรับปรุงและบำรุงรักษาชุมชน'
    : has(['สินเชื่อ', 'ผ่อน', 'ค่างวด', 'ค้างชำระ', 'หนี้', 'ดอกเบี้ย']) ? 'ฝ่ายบริหารสินเชื่อและหนี้'
    : has(['ระบบจอง', 'จองออนไลน์', 'เว็บไซต์', 'แอป', 'ขัดข้อง', 'เด้งออก']) ? 'ฝ่ายเทคโนโลยีสารสนเทศ'
    : (channel === 'complain' || has(['ร้องเรียน', 'ข้อเสนอแนะ'])) ? 'ฝ่ายสื่อสารองค์กร'
    : 'ฝ่ายการตลาด';
  const priority = sentiment === 'Negative' ? (has(['ด่วน', 'อันตราย', 'ไม่ปลอดภัย', 'หลายวัน']) ? 'High' : 'Medium') : 'Low';
  return {
    sentiment, conf, uncertain, owner, priority,
    reason: total === 0 ? 'ไม่พบคำบ่งชี้อารมณ์ชัดเจน (รับจาก API)' : uncertain ? 'สัญญาณผสม — ควรให้เจ้าหน้าที่ยืนยัน (รับจาก API)' : 'วิเคราะห์อัตโนมัติตอนรับจาก API',
    journey: null, catProduct: null, catSales: null,
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
    const body = await req.json();
    const secret = req.headers.get('x-voc-secret') ?? '';

    // แปลง payload → รายการข้อความ
    let channelId = String(body.channel_id ?? '');
    let items: { text: string; topic?: string; source?: string; occurred_at?: string }[] = [];
    if (Array.isArray(body.events)) {
      // LINE Messaging API webhook
      channelId = channelId || 'social';
      items = body.events
        .filter((e: any) => e.type === 'message' && e.message?.type === 'text' && e.message.text)
        .map((e: any) => ({
          text: String(e.message.text),
          source: 'Line OA',
          occurred_at: e.timestamp ? new Date(e.timestamp).toISOString().slice(0, 10) : undefined,
        }));
      if (!items.length) return J({ ok: true, note: 'ไม่มีข้อความ text ใน events' });  // LINE ต้องได้ 200 เสมอ
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
    if (!ch.webhook_secret || secret !== ch.webhook_secret) return J({ error: 'x-voc-secret ไม่ถูกต้อง' }, 401);

    // บันทึก voc_record + analysis
    const today = new Date().toISOString().slice(0, 10);
    const stamp = Date.now();
    const results: string[] = [];

    // วิเคราะห์ล่วงหน้าทั้งชุด: LLM ก่อน (ครั้งละ 10) → ชุดไหนไม่สำเร็จใช้ rule-based
    const fullTexts = items.map(it => (it.topic ? it.topic + ' ' : '') + it.text);
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
      const { data: rec, error: e1 } = await db.from('voc_record').insert({
        ref_code: 'VOC-API-' + stamp + '-' + (i + 1),
        channel_id: channelId,
        source: it.source ?? null,
        raw_text: it.text,
        topic: it.topic ?? null,
        occurred_at: it.occurred_at ?? today,   // เรียลไทม์: วันที่เกิดเรื่อง = วันนี้ (ถ้าไม่ส่งมา)
        is_imported: false,                      // มาจาก API ไม่ใช่ไฟล์
        journey_stage: a.journey,                // LLM จำแนกให้ (rule-based = null)
        owner_dept: a.owner,
      }).select('id, ref_code').single();
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
      ok: true, saved: results.length, ref_codes: results,
      analyzed_by: llmCount === results.length ? 'llm' : llmCount === 0 ? 'rule' : 'mixed',
      llm: llmCount, rule: results.length - llmCount,
    });
  } catch (e) {
    return J({ error: String(e) }, 500);
  }
});
