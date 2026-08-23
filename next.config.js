/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  // Pin the workspace root to this project so Next.js doesn't pick up
  // lockfiles in parent directories (e.g. the user home folder).
  outputFileTracingRoot: path.join(__dirname),
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  async rewrites() {
    // Firebase Auth signInWithRedirect ต้องมีหน้า /__/auth/handler
    // แต่ Next.js ไม่ route โฟลเดอร์ที่ขึ้นต้นด้วย "_" จึง rewrite
    // ไปยัง route handler ที่ path ปกติ (/auth-handler)
    //
    // ⚠️ ใช้เฉพาะ local dev เท่านั้น — ใน production Firebase Hosting
    // serve /__/auth/handler ให้อัตโนมัติอยู่แล้ว และการมี rewrite นี้
    // จะทำให้ firebase deploy วิเคราะห์ล้มเหลว (backend spec timeout)
    if (process.env.NODE_ENV === 'development') {
      return [
        {
          source: '/__/auth/handler',
          destination: '/auth-handler',
        },
      ];
    }

    // App Hosting is not Firebase Hosting, so it does not serve the reserved
    // Firebase Auth helper namespace automatically. Proxy it transparently to
    // the project's Firebase domain while keeping the browser origin custom.
    const firebaseHelperOrigin = 'https://tutor-platform-4e38f.web.app';
    return [
      {
        source: '/__/auth/:path*',
        destination: `${firebaseHelperOrigin}/__/auth/:path*`,
      },
      {
        source: '/__/firebase/:path*',
        destination: `${firebaseHelperOrigin}/__/firebase/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
