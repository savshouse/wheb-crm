import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  async headers() {
    return [
      {
        // Core security headers — all routes
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options',  value: 'nosniff' },
          { key: 'X-Frame-Options',          value: 'DENY' },
          { key: 'X-DNS-Prefetch-Control',   value: 'off' },
          { key: 'X-XSS-Protection',         value: '0' },
          { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',       value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          // 2-year HSTS with preload — only set this once you're confident the site is HTTPS-only
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
      {
        // Global CSP — all routes. Outlook rule below overrides this for /outlook paths.
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self';" },
        ],
      },
      {
        // Outlook add-in task pane — override CSP + X-Frame-Options so Outlook can embed it.
        // Next.js applies rules in order; later rules override earlier ones for the same key.
        source: '/outlook(.*)',
        headers: [
          { key: 'X-Frame-Options',         value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: 'frame-ancestors https://outlook.office365.com https://outlook.office.com https://outlook.live.com;' },
        ],
      },
    ]
  },
};

export default nextConfig;
