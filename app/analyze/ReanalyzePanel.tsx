'use client';
// ReanalyzePanel — แสดงสัดส่วน "วิเคราะห์ด้วย LLM จริง" vs "rule-based"
// และให้แอดมินสั่ง "วิเคราะห์ใหม่ด้วย LLM" กับรายการที่ยังเป็น rule-based (ที่เจ้าหน้าที่ยังไม่ยืนยัน)
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { analyzeSmartBatch } from '../../lib/ai';

const BATCH = 50;   // จำนวนสูงสุดต่อการกดหนึ่งครั้ง (กัน timeout/โควตา)

const btn: React.CSSProperties = {
  fontSize: 13, border: '1px solid #dfe6f0', background: '#fff', borderRadius: 8,
  padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
};

export default function ReanalyzePanel() {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [llm, setLlm] = useState(0);
  const [rule, setRule] = useState(0);
  const [needSql, setNeedSql] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadStats = useCallback(async () => {
    if (!supabase) return;
    const q = (engine: string) =>
      supabase!.from('analysis').select('voc_id', { count: 'exact', head: true }).eq('engine', engine);
    const [a, b] = await Promise.all([q('llm'), q('rule')]);
    if (a.error || b.error) { setNeedSql(true); return; }
    setNeedSql(false);
    setLlm(a.count ?? 0);
    setRule(b.count ?? 0);
  }, []);

  useEffect(() => {
    if (!supabase) { setRole('mock'); return; }
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setRole('none'); return; }
      const { data: p } = await supabase!.from('profiles').select('role').eq('id', data.user.id).single();
      setRole(p?.role ?? 'operator');
    });
    loadStats();
  }, [loadStats]);

  async function reanalyze() {
    if (!supabase) return;
    setBusy(true); setErr(''); setMsg(''); setProg('กำลังดึงรายการที่ยังเป็น rule-based…');
    try {
      const { data: pending, error } = await supabase.rpc('rule_based_pending', { lim: BATCH });
      if (error) throw new Error('เรียก rule_based_pending ไม่สำเร็จ — รัน supabase_llm_engine.sql แล้วหรือยัง? (' + error.message + ')');
      const list = (pending ?? []) as { voc_id: string; raw_text: string; channel_id: string }[];
      if (!list.length) { setMsg('ไม่มีรายการ rule-based ที่ต้องวิเคราะห์ใหม่แล้ว'); setBusy(false); setProg(''); return; }

      const results = await analyzeSmartBatch(
        list.map(r => r.raw_text || ''),
        list[0]?.channel_id,
        (done, total) => setProg('วิเคราะห์ด้วย LLM แล้ว ' + done + '/' + total + ' รายการ…'),
      );

      let updated = 0, stillRule = 0;
      for (let i = 0; i < list.length; i++) {
        const r = results[i];
        if (r.via !== 'llm') { stillRule++; continue; }   // LLM ล้มเหลว → ไม่ทับของเดิม
        const { error: e2 } = await supabase.from('analysis').update({
          sentiment: r.sentiment,
          sentiment_confidence: r.conf,
          sentiment_reason: r.reason,
          journey_stage: r.journey,
          cat_product: r.catProduct,
          cat_sales: r.catSales,
          priority: r.priority,
          engine: 'llm',
          model: r.model ?? null,
          analyzed_by: 'reanalyze',
        }).eq('voc_id', list[i].voc_id);
        if (!e2) {
          updated++;
          await supabase.from('voc_record').update({ owner_dept: r.owner }).eq('id', list[i].voc_id);
        }
        setProg('บันทึกผลแล้ว ' + (i + 1) + '/' + list.length + ' รายการ…');
      }

      setMsg('วิเคราะห์ใหม่ด้วย LLM สำเร็จ ' + updated + ' รายการ' +
        (stillRule ? ' · อีก ' + stillRule + ' รายการ LLM ใช้ไม่ได้ (คงผล rule-based ไว้)' : '') +
        (list.length === BATCH ? ' — ยังมีเหลือ กดซ้ำได้อีก' : ''));
      await loadStats();
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setProg(''); setBusy(false);
  }

  const total = llm + rule;
  const pct = total ? Math.round(llm / total * 100) : 0;
  const canRun = role === 'admin' || role === 'operator';

  return (
    <div className="card">
      <h3>🧠 เครื่องมือวิเคราะห์ที่ใช้จริง (LLM vs rule-based)</h3>

      {role === 'mock' ? (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>* โหมดข้อมูลจำลอง — ใช้ได้เมื่อเชื่อม Supabase แล้ว</div>
      ) : needSql ? (
        <div style={{ fontSize: 13, color: '#9a3412' }}>
          ⚠ ยังไม่มีคอลัมน์ <code>engine</code> ในตาราง analysis — รันไฟล์ <b>supabase_llm_engine.sql</b> ใน SQL Editor ก่อน
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
            <span>วิเคราะห์ด้วย LLM จริง</span>
            <span style={{ fontWeight: 600 }}>{llm.toLocaleString()} / {total.toLocaleString()} ({pct}%)</span>
          </div>
          <div style={{ height: 10, background: '#eef2f7', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ width: pct + '%', height: '100%', background: '#2e6cf0' }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 12px' }}>
            เหลือ rule-based (keyword) อีก <b>{rule.toLocaleString()}</b> รายการ — วิเคราะห์ใหม่ได้ครั้งละ {BATCH} รายการ
            · รายการที่เจ้าหน้าที่ยืนยันแล้วจะไม่ถูกทับ
          </div>

          {!canRun ? (
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>🔒 ต้องเป็นแอดมิน/ผู้ปฏิบัติงานจึงสั่งวิเคราะห์ใหม่ได้</span>
          ) : (
            <button style={{ ...btn, color: '#1f3a93' }} onClick={reanalyze} disabled={busy || rule === 0}>
              {busy ? (prog || 'กำลังทำงาน…') : '⟳ วิเคราะห์ใหม่ด้วย LLM (' + Math.min(rule, BATCH) + ' รายการ)'}
            </button>
          )}

          {msg && <div style={{ color: '#15803d', fontSize: 12.5, marginTop: 10 }}>✓ {msg}</div>}
          {err && <div style={{ color: '#b91c1c', fontSize: 12.5, marginTop: 10 }}>{err}</div>}
        </>
      )}
    </div>
  );
}
