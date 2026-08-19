// Firebase Auth sign-in helper page (route handler)
// ------------------------------------------------------------------
// รองรับ signInWithRedirect flow เมื่อแอปไม่ได้ถูก serve จาก Firebase Hosting
// (เช่น local dev ที่ Next.js dev server อยู่ที่ localhost:3000)
//
// ตามเอกสาร Firebase "Best practices for signInWithRedirect":
// https://firebase.google.com/docs/auth/web/redirect-best-practices
// เมื่อ OAuth เสร็จสิ้น auth domain จะ redirect กลับมาที่
// `<appOrigin>/__/auth/handler` — route นี้จำเป็นใน local dev
//
// หมายเหตุ: Next.js ไม่ route โฟลเดอร์ที่ขึ้นต้นด้วย "_" (รวมถึง "__")
// จึงต้อง serve ผ่าน path ปกติ (/auth-handler) แล้วใช้ rewrite
// ใน next.config.js แมป /__/auth/handler → /auth-handler
//
// ใน production (Firebase Hosting) route นี้จะถูกแทนที่ด้วย handler
// ของ Firebase Hosting เอง (served อัตโนมัติที่ /__/auth/handler)

import { NextResponse } from 'next/server';

const AUTH_DOMAIN =
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
  'tutor-platform-4e38f.firebaseapp.com';

export function GET() {
  const html = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<script type="text/javascript" src="https://${AUTH_DOMAIN}/__/auth/experiments.js"></script>
<script type="text/javascript" src="https://${AUTH_DOMAIN}/__/auth/handler.js"></script>
<script type="text/javascript">
var POST_BODY = 'null';
fireauth.oauthhelper.widget.initialize();
</script>
</head>
<body>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}