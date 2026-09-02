'use client';
// เรียงข้อมูลในตารางด้วยการคลิกหัวคอลัมน์ — คลิกวน: น้อย→มาก, มาก→น้อย, ยกเลิก (กลับลำดับเดิม)
// หมายเหตุ: ส่ง getters เป็นค่าคงที่ระดับโมดูล (ไม่ใช่ object literal ในคอมโพเนนต์)
// ไม่งั้น useMemo จะคิดใหม่ทุกครั้งที่ re-render
import React, { useCallback, useMemo, useState } from 'react';

export type SortDir = 'asc' | 'desc';
export interface SortState { key: string | null; dir: SortDir }
export type Getters<T> = Record<string, (r: T) => string | number>;

export function useSort<T>(rows: T[], getters: Getters<T>, initial?: SortState) {
  const [sort, setSort] = useState<SortState>(initial ?? { key: null, dir: 'asc' });

  const toggle = useCallback((key: string) => {
    setSort(s => s.key !== key ? { key, dir: 'asc' }
      : s.dir === 'asc' ? { key, dir: 'desc' }
      : { key: null, dir: 'asc' });
  }, []);

  const sorted = useMemo(() => {
    const g = sort.key ? getters[sort.key] : null;
    if (!g) return rows;
    const sign = sort.dir === 'asc' ? 1 : -1;
    // slice() ก่อนเสมอ — sort() เรียงในที่ตั้ง ถ้าเรียงทับ rows ตรง ๆ useMemo ก้อนอื่นที่ใช้ชุดเดียวกันจะเพี้ยน
    return rows.slice().sort((a, b) => {
      const x = g(a), y = g(b);
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * sign;
      // เรียงภาษาไทยด้วย localeCompare('th') — เรียงตามรหัสตัวอักษรจะได้ลำดับผิด (สระนำอย่าง เ- แ- )
      return String(x).localeCompare(String(y), 'th') * sign;
    });
  }, [rows, sort, getters]);

  return { sort, toggle, sorted };
}

export function SortTh({ sk, sort, toggle, children, title, style }: {
  sk: string; sort: SortState; toggle: (k: string) => void;
  children: React.ReactNode; title?: string; style?: React.CSSProperties;
}) {
  const on = sort.key === sk;
  return (
    <th className="sortable" style={style}
      aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => toggle(sk)}
        title={title ?? (on && sort.dir === 'asc' ? 'คลิกเพื่อเรียงมาก→น้อย' : on ? 'คลิกเพื่อยกเลิกการเรียง' : 'คลิกเพื่อเรียงน้อย→มาก')}>
        {children}<span className="ar" aria-hidden>{on ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
}
