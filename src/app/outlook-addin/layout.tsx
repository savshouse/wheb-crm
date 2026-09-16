import type { ReactNode } from 'react'
import { Geist } from 'next/font/google'
import '../globals.css'

const geist = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })

export const metadata = { title: 'WHEB CRM' }

export default function OutlookAddinLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <head>
        <script
          type="text/javascript"
          src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js"
          async
        />
      </head>
      <body style={{ margin: 0, background: '#fff' }}>{children}</body>
    </html>
  )
}
