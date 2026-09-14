// lib/supabaseClient.ts — ตัวเชื่อม Supabase "ฝั่งเบราว์เซอร์" เท่านั้น
//
// ⚠️ ห้ามใช้ไฟล์นี้ในโค้ดฝั่งเซิร์ฟเวอร์ (server component / middleware)
//    ฝั่งเซิร์ฟเวอร์ต้องใช้ getServerSupabase() ใน lib/dataServer.ts ซึ่งอ่าน session จาก cookie ของผู้ใช้
//
// ทำไมต้องเป็น createBrowserClient ของ @supabase/ssr ไม่ใช่ createClient ธรรมดา
//   createClient เก็บ session ไว้ใน localStorage ซึ่งฝั่งเซิร์ฟเวอร์มองไม่เห็น
//   เซิร์ฟเวอร์จึงไม่มีทางรู้ว่าใครล็อกอินอยู่ ต้องเปิดสิทธิ์อ่านให้ role `anon` แทน
//   = ใครก็ตามที่หยิบ anon key จากไฟล์ JS ของเว็บไปยิง API ตรง ก็อ่านเสียงลูกค้าได้ทั้งหมด
//   createBrowserClient เก็บ session ไว้ใน **cookie** เซิร์ฟเวอร์จึงอ่านได้ และปิดสิทธิ์ของ anon ได้
//
// ถ้ายังไม่ตั้งค่า ENV จะ export เป็น null แล้วโค้ดจะถอยไปใช้ข้อมูลจำลองอัตโนมัติ
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const hasSupabase = Boolean(url && key);

export const supabase: SupabaseClient | null = hasSupabase
  ? createBrowserClient(url as string, key as string)
  : null;
