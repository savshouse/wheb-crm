import type { Metadata } from 'next'
import Script from 'next/script'

export const metadata: Metadata = {
  title: 'WHEB CRM',
}

export default function OutlookLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Office.js must load before the task pane component mounts */}
      <Script
        id="office-js"
        src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js"
        strategy="beforeInteractive"
      />
      {children}
    </>
  )
}
