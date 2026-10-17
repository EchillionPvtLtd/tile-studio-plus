/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ...(process.env.NODE_ENV === 'production' ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
];

const nextConfig = {
  serverExternalPackages: ['sharp', '@prisma/client', 'bcrypt', '@libsql/client'],
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Uploaded files are images only; never let a browser treat one as a page or script
      { source: '/uploads/:path*', headers: [{ key: 'Content-Security-Policy', value: "default-src 'none'; sandbox" }, { key: 'X-Content-Type-Options', value: 'nosniff' }] },
    ];
  },
  images: {
    remotePatterns: [],
  },
};

module.exports = nextConfig;
