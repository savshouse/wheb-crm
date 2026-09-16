import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import PwaRegistration from '@/components/PwaRegistration'

const geist = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

export const viewport: Viewport = {
  themeColor: '#2563eb',
}

export const metadata: Metadata = {
  title: 'WHEB CRM',
  description: 'Client relationship and task management',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'WHEB CRM',
  },
  icons: {
    apple: '/icons/icon-192.png',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="h-full">
        {children}
        <PwaRegistration />
      </body>
    </html>
  )
}
