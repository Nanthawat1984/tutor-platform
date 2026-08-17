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
};

module.exports = nextConfig;
