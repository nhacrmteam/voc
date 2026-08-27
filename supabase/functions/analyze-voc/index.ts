// Supabase Edge Function: analyze-voc — วิเคราะห์เสียงลูกค้าด้วย LLM จริง
// รองรับทุก API ที่เข้ากับ OpenAI (Typhoon / OpenThaiGPT / OpenAI / OpenRouter)
// Secrets ที่ต้องตั้ง (Dashboard → Edge Functions → Secrets):
//   LLM_API_KEY  = คีย์ API (จำเป็น)
//   LLM_BASE_URL = ค่าเริ่มต้น https://api.opentyphoon.ai/v1 (Typhoon)
//   LLM_MODEL    = ค่าเริ่มต้น typhoon-v2.1-12b-instruct
//
// Input (3 โหมด):
//   1) ทดสอบการเชื่อมต่อ : { ping: true }
//        → { ok:true, model, base, latencyMs, sample }
//   2) ข้อความเดียว      : { text: string, channel?: string }
//        → { sentiment, confidence, uncertain, reason, journey, catProduct, catSales, priority, owner, model }
//   3) หลายข้อความ (เร็ว) : { items: [{ text, channel? }, ...] }  หรือ  { texts: string[], channel? }
//        → { results: [ ...ผลแบบข้อ 2... ], model, count }
//
// ทนทาน: timeout 45 วิ + retry 2 ครั้ง (exponential backoff) เมื่อเจอ 429/5xx
// ถ้าล้มเหลว ฝั่งเว็บ (lib/ai.ts) จะสลับไปใช้ rule-based ให้อัตโนมัติ

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const J = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const PROD_CATS = ['ทำเลที่ตั้งโครงการ', 'คุณภาพโครงการและการก่อสร้าง', 'การซื้อ/เช่าซื้อ', 'สินเชื่อบ้าน', 'การผ่อนชำระที่อยู่อาศัย', 'ระบบจองบ้านออนไลน์', 'การจองบ้านและข้อมูลโครงการ', 'ข้อมูลอื่นๆ'];
const SALES_CATS = ['โปรโมชั่น/ส่งเสริมการขาย', 'สื่อ/ประชาสัมพันธ์โครงการ', 'ข้อมูลโครงการบนเว็บไซต์', 'การให้ข้อมูลโครงการ', 'ข้อมูลสินเชื่อและเงื่อนไข', 'ความสะดวกในการเข้าถึงบริการ', 'ข้อมูลอื่นๆ'];
const DEPTS = ['ฝ่ายปรับปรุงและบำรุงรักษาชุมชน', 'ฝ่ายการตลาด', 'ฝ่ายบริหารงานขาย', 'ฝ่ายบริหารสินเชื่อและหนี้', 'ฝ่ายเทคโนโลยีสารสนเทศ', 'ฝ่ายสื่อสารองค์กร', 'ฝ่ายกฎหมาย'];
const JOURNEYS = ['Awareness', 'Consideration', 'Purchase', 'Service', 'Loyalty', 'Win Back'];

const SCHEMA_TEXT = `{
 "sentiment": "Positive" | "Neutral" | "Negative",
 "confidence": 0-100,
 "uncertain": true เมื่อข้อความมีสัญญาณผสมหรือกำกวมจนควรให้เจ้าหน้าที่ยืนยัน,
 "reason": "เหตุผลสั้น ๆ ภาษาไทย (ไม่เกิน 1 ประโยค)",
 "journey": หนึ่งใน ${JSON.stringify(JOURNEYS)},
 "catProduct": หนึ่งใน ${JSON.stringify(PROD_CATS)},
 "catSales": หนึ่งใน ${JSON.stringify(SALES_CATS)},
 "priority": "High" | "Medium" | "Low" (High = เชิงลบ + เร่งด่วน/กระทบความปลอดภัย/การเงิน/กฎหมาย),
 "owner": ฝ่ายที่ควรรับผิดชอบ หนึ่งใน ${JSON.stringify(DEPTS)}
}`;

const RULES = `เกณฑ์จับคู่ฝ่าย: ซ่อม/สาธารณูปโภค/ความสะอาด→ฝ่ายปรับปรุงและบำรุงรักษาชุมชน, สินเชื่อ/ผ่อน/ค่างวด/หนี้→ฝ่ายบริหารสินเชื่อและหนี้, ระบบออนไลน์/เว็บ/แอป→ฝ่ายเทคโนโลยีสารสนเทศ, ฟ้อง/กฎหมาย/ทุจริต→ฝ่ายกฎหมาย, ร้องเรียน/ข้อเสนอแนะทั่วไป→ฝ่ายสื่อสารองค์กร, สอบถาม/จอง/ติชม→ฝ่ายการตลาด, โอนกรรมสิทธิ์/ทำสัญญา/เช่าซื้อ→ฝ่ายบริหารงานขาย
เกณฑ์ความรุนแรง: กระทบความปลอดภัย (ไฟดับ/มืด/ทรุด/รั่ว/อันตราย) หรือ กฎหมาย/การเงิน = High; เชิงลบทั่วไป = Medium; เป็นกลาง/เชิงบวก = Low

เกณฑ์ Customer Journey — ตัดสินว่า "ลูกค้าคนนี้กำลังอยู่ขั้นไหนของการเดินทาง" จากเนื้อหาที่เขาพูด:
- Awareness (การรับรู้) = เพิ่งรู้จัก กคช. จากสื่อ/โฆษณา/เพจ/ป้าย/คนบอกต่อ ยังไม่เจาะจงโครงการหรือเงื่อนไข
- Consideration (การพิจารณา) = กำลังหาข้อมูลก่อนตัดสินใจ — สอบถามราคา ทำเล คุณสมบัติผู้มีสิทธิ์ เงื่อนไขสินเชื่อ เปรียบเทียบโครงการ
- Purchase (การซื้อ/ทำสัญญา) = อยู่ในกระบวนการซื้อ — จองสิทธิ์ ยื่นกู้ วางเงินดาวน์ ทำสัญญา นัดโอนกรรมสิทธิ์ ปัญหาระบบจอง
- Service (การใช้บริการ) = เข้าอยู่อาศัยแล้ว — แจ้งซ่อม สาธารณูปโภค ความสะอาด ส่วนกลาง ที่จอดรถ ชำระค่างวด/ค่าเช่า ร้องเรียนการบริการ
- Loyalty (ความผูกพัน) = พอใจจนชื่นชม แนะนำต่อ บอกต่อ อยากซื้อเพิ่ม หรืออยู่มานานแล้วยังพอใจ
- Win Back (การดึงกลับ) = กำลังจะเลิก — ขอยกเลิกสัญญา/ใบจอง ขอคืนเงิน ย้ายออก เลิกใช้บริการ หรือเคยเลิกแล้วติดต่อกลับมาใหม่

สำคัญ: ให้ตัดสิน journey จาก "เนื้อหาข้อความ" เป็นหลัก
ใช้ช่องทางต้นทางช่วยเฉพาะเมื่อข้อความสั้นหรือกำกวมจนแยกไม่ออกเท่านั้น
(แนวโน้มตามช่องทาง: social=Awareness · web/sales=Consideration · call/complain/hq/branch=Service · survey=Loyalty)
การร้องเรียนเรื่องที่อยู่อาศัยที่ครอบครองแล้ว = Service ไม่ใช่ Win Back เว้นแต่พูดถึงการยกเลิก/ย้ายออกจริง ๆ`;

const SYSTEM_ONE = `คุณคือ AI วิเคราะห์เสียงลูกค้า (Voice of Customer) ของการเคหะแห่งชาติ (กคช.)
วิเคราะห์ข้อความลูกค้าแล้วตอบเป็น JSON เท่านั้น (ห้ามมีข้อความอื่น) ตามโครงนี้:
${SCHEMA_TEXT}
${RULES}`;

const SYSTEM_MANY = `คุณคือ AI วิเคราะห์เสียงลูกค้า (Voice of Customer) ของการเคหะแห่งชาติ (กคช.)
ผู้ใช้จะส่งรายการข้อความหลายรายการ แต่ละรายการมีเลขกำกับ
ตอบเป็น JSON array เท่านั้น (ห้ามมีข้อความอื่น) เรียงตามลำดับเลขกำกับ และมีจำนวนสมาชิกเท่ากับจำนวนรายการที่ส่งมา
สมาชิกแต่ละตัวมีโครงนี้:
${SCHEMA_TEXT}
${RULES}`;

const MAX_BATCH = 10;              // จำกัดจำนวนต่อคำขอ กัน token ล้น
const TIMEOUT_MS = 45_000;
const RETRIES = 2;

interface Out {
  sentiment: string; confidence: number; uncertain: boolean; reason: string;
  journey: string; catProduct: string; catSales: string; priority: string; owner: string;
}

// ---------- เรียก LLM (มี timeout + retry) ----------
async function callLLM(base: string, key: string, model: string, system: string, user: string, maxTokens: number): Promise<string> {
  let lastErr = '';
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(base + '/chat/completions', {
        method: 'POST',
        signal: ac.signal,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      clearTimeout(timer);
      if (r.ok) {
        const data = await r.json();
        return String(data.choices?.[0]?.message?.content ?? '');
      }
      const body = (await r.text()).slice(0, 300);
      lastErr = 'LLM API error ' + r.status + ': ' + body;
      // 429 / 5xx = ลองใหม่ได้ · 4xx อื่น = เลิก
      if (r.status !== 429 && r.status < 500) break;
    } catch (e) {
      clearTimeout(timer);
      lastErr = String(e);
    }
    if (attempt < RETRIES) await new Promise(res => setTimeout(res, 800 * Math.pow(2, attempt)));
  }
  throw new Error(lastErr || 'เรียก LLM ไม่สำเร็จ');
}

// ---------- ทำความสะอาด/กันค่าหลุดนอกลิสต์ ----------
function sanitize(raw: Record<string, unknown>): Out {
  const o = raw ?? {};
  const pick = (v: unknown, list: string[], fb: string) => (typeof v === 'string' && list.includes(v) ? v : fb);
  return {
    sentiment: pick(o.sentiment, ['Positive', 'Neutral', 'Negative'], 'Neutral'),
    confidence: Math.max(0, Math.min(100, Number(o.confidence) || 70)),
    uncertain: !!o.uncertain,
    reason: String(o.reason ?? '').slice(0, 300),
    journey: pick(o.journey, JOURNEYS, 'Service'),
    catProduct: pick(o.catProduct, PROD_CATS, 'ข้อมูลอื่นๆ'),
    catSales: pick(o.catSales, SALES_CATS, 'ข้อมูลอื่นๆ'),
    priority: pick(o.priority, ['High', 'Medium', 'Low'], 'Low'),
    owner: pick(o.owner, DEPTS, 'ฝ่ายการตลาด'),
  };
}

function stripFence(s: string): string {
  return s.replace(/```json/gi, '').replace(/```/g, '').trim();
}
function parseObject(content: string): Record<string, unknown> {
  const m = stripFence(content).match(/\{[\s\S]*\}/);
  if (!m) throw new Error('LLM ไม่ตอบเป็น JSON: ' + content.slice(0, 200));
  return JSON.parse(m[0]);
}
function parseArray(content: string): Record<string, unknown>[] {
  const s = stripFence(content);
  const m = s.match(/\[[\s\S]*\]/);
  if (m) {
    const arr = JSON.parse(m[0]);
    if (Array.isArray(arr)) return arr;
  }
  // เผื่อโมเดลตอบเป็น object เดียวทั้งที่ขอ array
  return [parseObject(s)];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));

    const key = Deno.env.get('LLM_API_KEY');
    if (!key) return J({ error: 'ยังไม่ได้ตั้งค่า LLM_API_KEY ใน Edge Function Secrets' }, 500);
    const base = (Deno.env.get('LLM_BASE_URL') ?? 'https://api.opentyphoon.ai/v1').replace(/\/$/, '');
    const model = Deno.env.get('LLM_MODEL') ?? 'typhoon-v2.1-12b-instruct';

    // ---------- โหมด 1: ทดสอบการเชื่อมต่อ ----------
    if (body.ping) {
      const t0 = Date.now();
      const content = await callLLM(base, key, model, SYSTEM_ONE,
        'ช่องทาง: call\nข้อความลูกค้า: "น้ำประปาไม่ไหลมาสามวันแล้ว รบกวนส่งช่างด่วน"', 400);
      const sample = sanitize(parseObject(content));
      return J({ ok: true, model, base, latencyMs: Date.now() - t0, sample });
    }

    // ---------- รวบรวมรายการที่จะวิเคราะห์ ----------
    let items: { text: string; channel?: string }[] = [];
    if (Array.isArray(body.items)) {
      items = body.items
        .filter((x: unknown) => x && typeof (x as { text?: unknown }).text === 'string')
        .map((x: { text: string; channel?: string }) => ({ text: x.text, channel: x.channel }));
    } else if (Array.isArray(body.texts)) {
      items = body.texts
        .filter((t: unknown) => typeof t === 'string' && t.trim())
        .map((t: string) => ({ text: t, channel: body.channel }));
    } else if (typeof body.text === 'string' && body.text.trim()) {
      items = [{ text: body.text, channel: body.channel }];
    }
    if (!items.length) return J({ error: 'ต้องส่ง text, texts[] หรือ items[]' }, 400);
    if (items.length > MAX_BATCH) return J({ error: 'ส่งได้ครั้งละไม่เกิน ' + MAX_BATCH + ' รายการ' }, 400);

    const isBatch = Array.isArray(body.items) || Array.isArray(body.texts);

    // ---------- โหมด 2: ข้อความเดียว ----------
    if (!isBatch) {
      const it = items[0];
      const content = await callLLM(base, key, model, SYSTEM_ONE,
        'ช่องทาง: ' + (it.channel ?? 'ไม่ระบุ') + '\nข้อความลูกค้า: "' + it.text + '"', 400);
      return J({ ...sanitize(parseObject(content)), model });
    }

    // ---------- โหมด 3: หลายข้อความในคำขอเดียว ----------
    const user = items
      .map((it, i) => (i + 1) + ') ช่องทาง: ' + (it.channel ?? 'ไม่ระบุ') + ' | ข้อความลูกค้า: "' + it.text.replace(/"/g, "'") + '"')
      .join('\n');
    const content = await callLLM(base, key, model, SYSTEM_MANY,
      'วิเคราะห์ ' + items.length + ' รายการต่อไปนี้ แล้วตอบเป็น JSON array ' + items.length + ' สมาชิก:\n' + user,
      Math.min(4000, 380 * items.length + 200));

    const arr = parseArray(content);
    if (arr.length !== items.length) {
      return J({ error: 'LLM ตอบจำนวนไม่ตรง (ส่ง ' + items.length + ' ได้ ' + arr.length + ')' }, 502);
    }
    return J({ results: arr.map(sanitize), model, count: arr.length });
  } catch (e) {
    return J({ error: String(e instanceof Error ? e.message : e) }, 502);
  }
});
