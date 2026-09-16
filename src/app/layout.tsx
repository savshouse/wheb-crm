import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import PwaRegistration from '@/components/PwaRegistration'

const geist = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'WHEB CRM',
  description: 'Client relationship and task management',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'WHEB CRM',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <head>
        <meta name="theme-color" content="#2563eb" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="h-full">
        {children}
        <PwaRegistration />
      </body>
    </html>
  )
}
