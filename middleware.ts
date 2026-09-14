// middleware.ts — ด่านกรองชั้นแรก + ต่ออายุ session ให้ฝั่งเซิร์ฟเวอร์
//
// ทำ 2 อย่าง
//   1) ต่ออายุ access token ที่หมดอายุ แล้วเขียน cookie ใหม่กลับไป
//      (server component เขียน cookie ไม่ได้ ถ้าไม่มีขั้นนี้ผู้ใช้จะถูกเด้งออกทุก ๆ ชั่วโมง)
//   2) ยังไม่ล็อกอิน → เด้งไป /login ตั้งแต่ก่อนถึงหน้าเว็บ
//
// ⚠️ ห้ามถือว่า middleware คือด่านเดียว
//    Next.js เคยมีช่องโหว่ที่ข้าม middleware ได้ด้วย header ปลอม (CVE-2025-29927)
//    ด่านจริงคือ requireUser() ในทุกหน้า + RLS policy ฝั่ง Postgres — middleware เป็นแค่ชั้นเสริม
//    (โปรเจกต์นี้อัปเป็น Next 14.2.35 ซึ่งปิดช่องโหว่นั้นแล้ว แต่กติกา "อย่าพึ่งด่านเดียว" ยังใช้เหมือนเดิม)
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// หน้าที่เข้าได้โดยไม่ต้องล็อกอิน
const PUBLIC = ['/login', '/welcome'];

export async function middleware(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // ยังไม่ตั้งค่า ENV = โหมดสาธิต ไม่มีข้อมูลจริงให้รั่ว ปล่อยผ่าน
  if (!url || !key) return NextResponse.next();

  let res = NextResponse.next({ request: { headers: req.headers } });

  const supabase = createServerClient(url, key, {
    cookies: {
      get: (name: string) => req.cookies.get(name)?.value,
      set: (name: string, value: string, options: Record<string, unknown>) => {
        req.cookies.set({ name, value, ...options });
        res = NextResponse.next({ request: { headers: req.headers } });
        res.cookies.set({ name, value, ...options });
      },
      remove: (name: string, options: Record<string, unknown>) => {
        req.cookies.set({ name, value: '', ...options });
        res = NextResponse.next({ request: { headers: req.headers } });
        res.cookies.set({ name, value: '', ...options });
      },
    },
  });

  // การเรียก getUser() ตรงนี้คือสิ่งที่ทำให้ token ถูกต่ออายุ — ห้ามลบออก
  const { data } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  const isPublic = PUBLIC.some(p => path === p || path.startsWith(p + '/'));
  if (!data.user && !isPublic) {
    const to = req.nextUrl.clone();
    to.pathname = '/login';
    return NextResponse.redirect(to);
  }
  return res;
}

export const config = {
  // ข้ามไฟล์คงที่และรูปภาพ — ให้ทำงานเฉพาะคำขอที่เป็นหน้าเว็บจริง
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)'],
};
