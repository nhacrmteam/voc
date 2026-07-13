// lib/supabaseClient.ts — ตัวเชื่อม Supabase
// ถ้ายังไม่ตั้งค่า ENV จะ export เป็น null แล้ว data.ts จะ fallback ไปใช้ mock อัตโนมัติ
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const hasSupabase = Boolean(url && key);

export const supabase: SupabaseClient | null = hasSupabase
  ? createClient(url as string, key as string)
  : null;
