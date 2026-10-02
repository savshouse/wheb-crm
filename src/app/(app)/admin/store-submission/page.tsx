import { Copy, Download, ExternalLink, CheckCircle2, Package } from 'lucide-react'

const APP_URL     = 'https://wheb-crm.vercel.app'
const PRIVACY_URL = 'https://wheb-crm.vercel.app/privacy'
const ZIP_URL     = 'https://wheb-crm.vercel.app/wheb-crm-extension.zip'

const EDGE_STORE_URL   = 'https://partner.microsoft.com/dashboard/microsoftedge/overview'
const CHROME_STORE_URL = 'https://chrome.google.com/webstore/devconsole'

function CopyBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-800 whitespace-pre-wrap font-mono leading-relaxed">
        {value}
      </div>
    </div>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center mt-0.5">{n}</span>
      <span className="text-sm text-slate-700 leading-relaxed">{children}</span>
    </li>
  )
}

export default function StoreSubmissionPage() {
  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Store Submission</h1>
        <p className="text-sm text-slate-500 mt-1">
          Everything needed to publish the WHEB CRM extension to the Edge Add-ons Store or Chrome Web Store.
        </p>
      </div>

      <div className="space-y-6">

        {/* Download */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 flex items-start gap-3">
          <Package size={18} className="text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-900">Extension package</p>
            <p className="text-xs text-blue-700 mt-0.5 mb-2">
              This ZIP is rebuilt automatically on every Vercel deploy — always up to date.
            </p>
            <a href={ZIP_URL} download className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900">
              <Download size={11} />Download wheb-crm-extension.zip
            </a>
          </div>
        </div>

        {/* Listing copy */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
            <h2 className="text-base font-semibold text-slate-900">Store listing copy</h2>
            <p className="text-xs text-slate-500 mt-0.5">Paste these directly into the store dashboard</p>
          </div>
          <div className="p-6">
            <CopyBox
              label="Extension name (max 45 chars)"
              value="WHEB CRM"
            />
            <CopyBox
              label="Short description (max 132 chars)"
              value="Quick access to your WHEB CRM tasks, clients and meetings — with a live overdue badge and task side panel."
            />
            <CopyBox
              label="Detailed description"
              value={`WHEB CRM is an internal client relationship and task management tool for the Warren House Employee Benefits team.

The browser extension adds a WH icon to your toolbar showing a live count of your overdue tasks. Click it to:

• See your overdue, due today, and total open task counts at a glance
• Browse your open tasks with priority and due date
• Click any task to open a full side panel and update status, priority, notes and due date
• Browse clients, recent meetings and reports

This extension is for authorised Warren House Employee Benefits employees only. You must have an active WHEB CRM account at wheb-crm.vercel.app to sign in.`}
            />
            <CopyBox
              label="Privacy policy URL"
              value={PRIVACY_URL}
            />
            <CopyBox
              label="Website / homepage URL"
              value={APP_URL}
            />
            <CopyBox
              label="Category"
              value="Productivity"
            />
            <CopyBox
              label="Language"
              value="English (United Kingdom)"
            />
          </div>
        </div>

        {/* Icons */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
            <h2 className="text-base font-semibold text-slate-900">Icons</h2>
            <p className="text-xs text-slate-500 mt-0.5">Already in the extension folder — use these for the store listing too</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              {[
                { size: '128×128', file: 'chrome-extension/icons/icon-128.png', use: 'Store icon (required)' },
                { size: '48×48',   file: 'chrome-extension/icons/icon-48.png',  use: 'Extension management page' },
                { size: '32×32',   file: 'chrome-extension/icons/icon-32.png',  use: 'Toolbar icon (Windows)' },
                { size: '16×16',   file: 'chrome-extension/icons/icon-16.png',  use: 'Favicon / small icon' },
              ].map(({ size, file, use }) => (
                <div key={size} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="font-semibold text-slate-800">{size}</p>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">{file}</p>
                  <p className="text-xs text-slate-600 mt-1">{use}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-4">
              Note: both stores prefer a <strong>440×280 promotional tile</strong> and at least one
              <strong> 1280×800 screenshot</strong>. These should be created from the live extension
              — take a screenshot of the popup and side panel in action.
            </p>
          </div>
        </div>

        {/* Edge submission steps */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
            <h2 className="text-base font-semibold text-slate-900">Submit to Edge Add-ons Store</h2>
            <p className="text-xs text-slate-500 mt-0.5">Free · Recommended · Review usually within 1–2 business days</p>
          </div>
          <div className="p-6">
            <ol className="space-y-3">
              <Step n={1}>
                Go to the{' '}
                <a href={EDGE_STORE_URL} target="_blank" rel="noopener noreferrer"
                  className="text-blue-600 underline underline-offset-2 inline-flex items-center gap-0.5">
                  Microsoft Edge Partner Center <ExternalLink size={10} />
                </a>{' '}
                and sign in with a Microsoft account. Registration is free.
              </Step>
              <Step n={2}>
                Click <strong>Create new extension</strong> and upload the ZIP file downloaded above.
              </Step>
              <Step n={3}>
                Fill in the listing using the copy above. Set <strong>Visibility</strong> to{' '}
                <strong>Unlisted</strong> — this means only people with your direct link can install it;
                it won&apos;t appear in public search results.
              </Step>
              <Step n={4}>
                Upload the 128×128 icon and at least one screenshot, then submit for review.
              </Step>
              <Step n={5}>
                Once approved, copy the store link and share it with the team — they click{' '}
                <strong>Get</strong> and it installs with no ZIP, no developer mode, no local folder.
              </Step>
            </ol>
            <div className="mt-4 flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              <CheckCircle2 size={15} className="text-green-600 shrink-0 mt-0.5" />
              <p className="text-xs text-green-800">
                For future updates: bump the version in <code className="bg-green-100 px-1 rounded">manifest.json</code>,
                deploy to Vercel (the ZIP auto-rebuilds), download the new ZIP, and upload it to the
                Partner Center dashboard. The store will push the update to all users automatically
                once approved.
              </p>
            </div>
          </div>
        </div>

        {/* Chrome submission steps */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
            <h2 className="text-base font-semibold text-slate-900">Submit to Chrome Web Store</h2>
            <p className="text-xs text-slate-500 mt-0.5">$5 one-time developer fee · Review can take up to 7 days</p>
          </div>
          <div className="p-6">
            <ol className="space-y-3">
              <Step n={1}>
                Go to the{' '}
                <a href={CHROME_STORE_URL} target="_blank" rel="noopener noreferrer"
                  className="text-blue-600 underline underline-offset-2 inline-flex items-center gap-0.5">
                  Chrome Web Store Developer Console <ExternalLink size={10} />
                </a>{' '}
                and pay the one-time $5 registration fee with a Google account.
              </Step>
              <Step n={2}>
                Click <strong>New item</strong>, upload the ZIP, then fill in the listing using the
                copy above. Set <strong>Visibility</strong> to <strong>Unlisted</strong>.
              </Step>
              <Step n={3}>
                Upload screenshots and submit for review. Once approved, share the store link
                with any Chrome users on the team.
              </Step>
            </ol>
          </div>
        </div>

      </div>
    </div>
  )
}
