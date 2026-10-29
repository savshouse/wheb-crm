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
        // Base security headers for all routes
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        // Outlook add-in task pane — CSP frame-ancestors overrides X-Frame-Options
        // in Chromium-based Outlook (Edge WebView2). Narrowed from 'frame-ancestors *'.
        source: '/outlook',
        headers: [
          { key: 'Content-Security-Policy', value: 'frame-ancestors https://outlook.office365.com https://outlook.office.com https://outlook.live.com;' },
        ],
      },
    ]
  },
};

export default nextConfig;
