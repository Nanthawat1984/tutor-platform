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
    return [
      // Firebase Auth signInWithRedirect ต้องมีหน้า /__/auth/handler
      // แต่ Next.js ไม่ route โฟลเดอร์ที่ขึ้นต้นด้วย "_" จึง rewrite
      // ไปยัง route handler ที่ path ปกติ (/auth-handler)
      {
        source: '/__/auth/handler',
        destination: '/auth-handler',
      },
    ];
  },
};

module.exports = nextConfig;
