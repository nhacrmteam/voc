'use client';
// ReviewQueueView — หน้าจัดการคิวยืนยันเสียงลูกค้า (human-in-the-loop)
//
// เดิมคิวนี้เป็นรายการลอย ๆ 20 รายการแปะกลางหน้า AI วิเคราะห์ ไม่รู้ว่าเหลืออีกเท่าไร
// ทำต่อไม่ได้ ไม่มีตัวกรอง ไม่มีความคืบหน้า — ไม่รู้สึกเป็น "ระบบจัดการงาน"
//
// หน้านี้จึงทำเป็นคิวงานเต็มรูปแบบ: ตัวกรอง · แบ่งหน้า · เลือกหลายรายการ · ความคืบหน้ารอบนี้
//
// หมายเหตุการ query: ยิงจากฝั่งตาราง analysis เป็นหลัก (ไม่ใช่ voc_record)
// เพราะเงื่อนไขคัดกรองและการเรียงลำดับอยู่ที่ analysis ทั้งคู่
// ถ้ายิงจาก voc_record จะต้องเรียงด้วยคอลัมน์ของตารางที่ฝังมา ซึ่งเปราะกว่ามาก
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { CHANNELS } from '../../lib/data';
import EmptyState from '../components/EmptyState';

type Sent = 'Positive' | 'Neutral' | 'Negative';
interface Item {
  id: string; ref: string; voice: string; topic: string; occurredAt: string;
  channel: string; project: string; sentiment: Sent; conf: number; reason: string;
}

const SENT_TH: Record<string, string> = { Positive: 'เชิงบวก', Neutral: 'เป็นกลาง', Negative: 'เชิงลบ' };
const SENT_CLS: Record<string, string> = { Positive: 'p-pos', Neutral: 'p-neu', Negative: 'p-neg' };
const CH_IDS: { id: string; name: string }[] = [
  { id: 'social', name: 'Social Media' }, { id: 'web', name: 'Website / Email / DB' },
  { id: 'sales', name: 'ทีมรณรงค์ขาย' }, { id: 'hq', name: 'ฝ่ายงานสำนักงานใหญ่' },
  { id: 'branch', name: 'สำนักงานสาขาทั่วประเทศ' }, { id: 'call', name: 'Call Center' },
  { id: 'complain', name: 'ระบบร้องเรียน/ข้อเสนอแนะ' }, { id: 'survey', name: 'แบบประเมินความพึงพอใจ' },
];
const PER = 20;
const one = <T,>(x: T | T[] | null | undefined): T | undefined => (Array.isArray(x) ? x[0] : (x ?? undefined));
const sel: React.CSSProperties = { padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 9, fontSize: 13, fontFamily: 'inherit', background: 'var(--card,#fff)', color: 'inherit' };

export default function ReviewQueueView() {
  const [role, setRole] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [ch, setCh] = useState('all');
  const [sort, setSort] = useState<'conf' | 'new'>('conf');
  const [q, setQ] = useState('');
  const [qLive, setQLive] = useState('');       // คำค้นที่ยิงจริง (หน่วงจากช่องพิมพ์)
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string>('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [doneNow, setDoneNow] = useState(0);    // ยืนยันไปกี่รายการในรอบการทำงานนี้

  const canEdit = role === 'admin' || role === 'operator';

  useEffect(() => {
    if (!supabase) { setRole('mock'); return; }
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setRole('none'); return; }
      const { data: p } = await supabase!.from('profiles').select('role').eq('id', data.user.id).single();
      setRole(p?.role ?? 'operator');
    });
  }, []);

  // หน่วงคำค้น 350ms — ไม่ยิง query ทุกตัวอักษรที่พิมพ์
  useEffect(() => { const t = setTimeout(() => setQLive(q.trim()), 350); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setPage(1); }, [ch, sort, qLive]);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true); setErr('');
    let sq = supabase.from('analysis')
      .select('voc_id,sentiment,sentiment_confidence,sentiment_reason,' +
        'voc_record!inner(id,ref_code,raw_text,topic,occurred_at,channel_id,channel(name),project(name))',
        { count: 'exact' })
      .lte('sentiment_confidence', 50)
      .eq('sentiment_manual', false);
    if (ch !== 'all') sq = sq.eq('voc_record.channel_id', ch);
    if (qLive) sq = sq.ilike('voc_record.raw_text', `%${qLive}%`);
    sq = sort === 'conf'
      ? sq.order('sentiment_confidence', { ascending: true })   // ไม่มั่นใจที่สุดขึ้นก่อน
      : sq.order('analyzed_at', { ascending: false });
    const { data, count, error } = await sq.range((page - 1) * PER, page * PER - 1);
    if (error) { setErr('โหลดข้อมูลไม่สำเร็จ: ' + error.message); setLoading(false); return; }
    setTotal(count ?? 0);
    // supabase-js เดาชนิดจาก select string ที่มี !inner ไม่ออก → cast เองแล้วอ่านผ่าน one()
    const raw = (data ?? []) as unknown as Record<string, unknown>[];
    setItems(raw.map(r => {
      const v = one<Record<string, unknown>>(r.voc_record as never) || {};
      return {
        id: String(r.voc_id), ref: String(v.ref_code ?? ''), voice: String(v.raw_text ?? ''),
        topic: String(v.topic ?? ''), occurredAt: String(v.occurred_at ?? ''),
        channel: String(one<{ name: string }>(v.channel as never)?.name ?? ''),
        project: String(one<{ name: string }>(v.project as never)?.name ?? ''),
        sentiment: (r.sentiment ?? 'Neutral') as Sent,
        conf: Number(r.sentiment_confidence ?? 0), reason: String(r.sentiment_reason ?? ''),
      };
    }));
    setPicked(new Set());
    setLoading(false);
  }, [ch, sort, qLive, page]);

  useEffect(() => { load(); }, [load]);

  /** ยืนยัน 1 รายการ — เอาออกจากรายการทันที ไม่ต้องรอโหลดใหม่ทั้งหน้า */
  async function confirmOne(id: string, sentiment: Sent) {
    if (!supabase || !canEdit) return;
    setBusy(id); setErr('');
    const { error } = await supabase.from('analysis')
      .update({ sentiment, sentiment_manual: true, sentiment_confidence: 100, sentiment_reason: 'ยืนยันโดยเจ้าหน้าที่' })
      .eq('voc_id', id);
    setBusy('');
    if (error) { setErr('บันทึกไม่สำเร็จ: ' + error.message); return; }
    setItems(v => v.filter(x => x.id !== id));
    setTotal(t => Math.max(0, t - 1));
    setDoneNow(n => n + 1);
  }

  /** ยืนยันหลายรายการตามที่ AI เดาไว้ — จัดกลุ่มตามอารมณ์แล้วยิงกลุ่มละครั้ง ไม่ยิงทีละแถว */
  async function confirmPickedAsIs() {
    if (!supabase || !canEdit || picked.size === 0) return;
    setBusy('bulk'); setErr('');
    const chosen = items.filter(x => picked.has(x.id));
    const groups: Record<string, string[]> = {};
    chosen.forEach(x => { (groups[x.sentiment] ||= []).push(x.id); });
    for (const [sentiment, ids] of Object.entries(groups)) {
      const { error } = await supabase.from('analysis')
        .update({ sentiment, sentiment_manual: true, sentiment_confidence: 100, sentiment_reason: 'ยืนยันตามที่ AI แนะนำ' })
        .in('voc_id', ids);
      if (error) { setErr('บันทึกไม่สำเร็จ: ' + error.message); setBusy(''); return; }
    }
    setBusy('');
    setItems(v => v.filter(x => !picked.has(x.id)));
    setTotal(t => Math.max(0, t - chosen.length));
    setDoneNow(n => n + chosen.length);
    setPicked(new Set());
  }

  function toggle(id: string) {
    setPicked(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  const allPicked = items.length > 0 && picked.size === items.length;
  const pageCount = Math.max(1, Math.ceil(total / PER));
  const hasFilter = ch !== 'all' || !!qLive;

  return (
    <>
      <header className="top">
        <h1>✋ คิวยืนยันเสียงลูกค้า</h1>
        <div className="sub">
          รายการที่ AI ไม่มั่นใจ (ความเชื่อมั่น ≤ 50%) — เจ้าหน้าที่ตรวจและยืนยันก่อนนำไปใช้คิดสถิติ
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <select style={sel} value={ch} onChange={e => setCh(e.target.value)}>
            <option value="all">ทุกช่องทาง</option>
            {CH_IDS.filter(c => CHANNELS.includes(c.name)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select style={sel} value={sort} onChange={e => setSort(e.target.value as 'conf' | 'new')}>
            <option value="conf">เรียง: ไม่มั่นใจที่สุดก่อน</option>
            <option value="new">เรียง: วิเคราะห์ล่าสุดก่อน</option>
          </select>
          <input style={{ ...sel, flex: '1 1 240px', maxWidth: 380 }} value={q} onChange={e => setQ(e.target.value)}
            placeholder="🔎 ค้นหาข้อความในเสียงลูกค้า" />
        </div>
      </header>

      <div className="content">
        {/* แถบสรุปงาน */}
        <div className="rq-head">
          <div className="rq-stat">
            <div className="l">รอยืนยันทั้งหมด</div>
            <div className="v">{total.toLocaleString()}</div>
            <div className="s">{hasFilter ? 'ตามตัวกรองที่เลือก' : 'ทั้งระบบ'}</div>
          </div>
          <div className="rq-stat">
            <div className="l">ยืนยันแล้วในรอบนี้</div>
            <div className="v ok">{doneNow.toLocaleString()}</div>
            <div className="s">นับตั้งแต่เปิดหน้านี้</div>
          </div>
          <div className="rq-note">
            รายการที่ยืนยันแล้วจะถูกล็อกเป็น <b>ยืนยันโดยเจ้าหน้าที่</b> และ
            <b> ไม่ถูกทับ</b> เมื่อสั่งวิเคราะห์ใหม่ด้วย LLM ในภายหลัง
            <div style={{ marginTop: 8 }}>
              <Link href="/analyze" className="rq-link">← กลับหน้า AI วิเคราะห์</Link>
            </div>
          </div>
        </div>

        {err && <div className="rq-err">{err}</div>}

        {role === 'mock' && <div className="imp-alert warn" style={{ marginBottom: 14 }}>* โหมดสาธิต — ปุ่มยืนยันใช้ได้เมื่อเชื่อม Supabase</div>}
        {role && role !== 'mock' && !canEdit && <div className="imp-alert warn" style={{ marginBottom: 14 }}>🔒 บทบาทของคุณดูได้อย่างเดียว — ต้องเป็นแอดมินหรือผู้ปฏิบัติงานจึงยืนยันได้</div>}

        {/* แถบเครื่องมือ: เลือกหลายรายการ */}
        {canEdit && items.length > 0 && (
          <div className="rq-bar">
            <label className="rq-pickall">
              <input type="checkbox" checked={allPicked}
                onChange={e => setPicked(e.target.checked ? new Set(items.map(i => i.id)) : new Set())} />
              เลือกทั้งหน้า ({items.length})
            </label>
            <span className="rq-picked">{picked.size > 0 ? `เลือกไว้ ${picked.size} รายการ` : ''}</span>
            <button className="btn" disabled={picked.size === 0 || busy === 'bulk'} onClick={confirmPickedAsIs}
              title="ยืนยันตามอารมณ์ที่ AI เดาไว้ สำหรับรายการที่ตรวจแล้วเห็นว่าถูกต้อง">
              {busy === 'bulk' ? 'กำลังบันทึก…' : `✓ ยืนยันตามที่ AI แนะนำ${picked.size ? ` (${picked.size})` : ''}`}
            </button>
          </div>
        )}

        {loading ? (
          <div className="card">
            {Array.from({ length: 5 }, (_, i) => <div key={i} className="sk" style={{ height: 92, marginBottom: 10, borderRadius: 12 }} />)}
          </div>
        ) : items.length === 0 ? (
          <div className="card">
            {total === 0 && !hasFilter
              ? <EmptyState icon="🎉" title="เคลียร์คิวหมดแล้ว"
                  detail={<>ไม่มีรายการที่ AI ไม่มั่นใจรอยืนยันในขณะนี้ — เมื่อมีข้อมูลใหม่เข้ามาและ AI ตัดสินไม่ได้ รายการจะมาโผล่ที่นี่</>}
                  actions={<Link className="btn" href="/analyze">ไปหน้า AI วิเคราะห์</Link>} />
              : <EmptyState title="ไม่พบรายการตามตัวกรองนี้"
                  detail={<>ลองเลือก &ldquo;ทุกช่องทาง&rdquo; หรือลบคำค้นออก</>}
                  actions={<button className="btn" onClick={() => { setCh('all'); setQ(''); }}>ล้างตัวกรอง</button>} />}
          </div>
        ) : (
          <>
            {items.map(it => (
              <div key={it.id} className={'rq-card' + (picked.has(it.id) ? ' on' : '')}>
                <div className="rq-top">
                  {canEdit && (
                    <input type="checkbox" checked={picked.has(it.id)} onChange={() => toggle(it.id)}
                      aria-label={'เลือก ' + it.ref} />
                  )}
                  <div className="rq-meta">
                    <Link href={'/voc/' + it.id} className="tag">{it.ref}</Link>
                    <span>{it.channel}</span>
                    {it.project && <><i>·</i><span>{it.project}</span></>}
                    {it.occurredAt && <><i>·</i><span>{it.occurredAt}</span></>}
                  </div>
                  <div className="rq-guess">
                    <span className="rq-lab">AI เดาว่า</span>
                    <span className={'pill ' + SENT_CLS[it.sentiment]}>{SENT_TH[it.sentiment]}</span>
                    <span className="rq-conf" title="ความเชื่อมั่นของ AI">
                      <i style={{ width: Math.max(4, it.conf) + '%' }} />
                    </span>
                    <b>{it.conf}%</b>
                  </div>
                </div>
                {it.topic && <div className="rq-topic">{it.topic}</div>}
                <div className="rq-voice">&ldquo;{it.voice}&rdquo;</div>
                {it.reason && <div className="rq-reason">⚠ {it.reason}</div>}
                {canEdit && (
                  <div className="rq-acts">
                    <span className="rq-lab">ยืนยันเป็น</span>
                    <button className="rq-btn pos" disabled={busy === it.id} onClick={() => confirmOne(it.id, 'Positive')}>เชิงบวก</button>
                    <button className="rq-btn neu" disabled={busy === it.id} onClick={() => confirmOne(it.id, 'Neutral')}>เป็นกลาง</button>
                    <button className="rq-btn neg" disabled={busy === it.id} onClick={() => confirmOne(it.id, 'Negative')}>เชิงลบ</button>
                    <Link href={'/voc/' + it.id} className="rq-more">ดูรายละเอียด →</Link>
                  </div>
                )}
              </div>
            ))}

            {pageCount > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <button style={{ ...sel, cursor: 'pointer' }} disabled={page === 1} onClick={() => setPage(1)}>« แรก</button>
                <button style={{ ...sel, cursor: 'pointer' }} disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹ ก่อนหน้า</button>
                <span style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 6px' }}>หน้า {page} / {pageCount}</span>
                <button style={{ ...sel, cursor: 'pointer' }} disabled={page === pageCount} onClick={() => setPage(p => p + 1)}>ถัดไป ›</button>
                <button style={{ ...sel, cursor: 'pointer' }} disabled={page === pageCount} onClick={() => setPage(pageCount)}>ท้าย »</button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
