import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'WHEB CRM',
    short_name: 'WHEB CRM',
    description: 'Client relationship and task management',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#2563eb',
    icons: [
      { src: '/icons/icon.svg',     sizes: 'any',         type: 'image/svg+xml', purpose: 'maskable'    },
      { src: '/icons/icon-192.png', sizes: '192x192',     type: 'image/png'     },
      { src: '/icons/icon-512.png', sizes: '512x512',     type: 'image/png'     },
    ],
  }
}
