import { Download, Chrome, Mail, ExternalLink, CheckCircle2 } from 'lucide-react'

const MANIFEST_URL = 'https://wheb-crm.vercel.app/outlook-manifest.xml'
const APP_URL = 'https://wheb-crm.vercel.app'

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center mt-0.5">
        {n}
      </span>
      <span className="text-sm text-slate-700 leading-relaxed">{children}</span>
    </li>
  )
}

function Section({
  icon,
  title,
  subtitle,
  accent,
  children,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  accent: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className={`px-6 py-4 border-b border-slate-100 flex items-center gap-3 ${accent}`}>
        {icon}
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}

export default function AddInsPage() {
  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Add-in Installation</h1>
        <p className="text-sm text-slate-500 mt-1">
          Set up the WHEB CRM add-in in Outlook and Edge — no IT admin required.
        </p>
      </div>

      <div className="space-y-6">

        {/* Manifest link card */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 flex items-start gap-3">
          <Download size={18} className="text-blue-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-blue-900">Outlook manifest file</p>
            <p className="text-xs text-blue-700 mt-0.5 break-all">{MANIFEST_URL}</p>
            <a
              href={MANIFEST_URL}
              download="wheb-crm-manifest.xml"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 text-xs font-medium text-blue-700 hover:text-blue-900 underline underline-offset-2"
            >
              <Download size={11} />
              Download manifest XML
            </a>
          </div>
        </div>

        {/* Outlook Desktop */}
        <Section
          icon={<Mail size={20} className="text-blue-600" />}
          title="Outlook Desktop (Windows)"
          subtitle="Sideload the add-in from a local manifest file — works without M365 admin access"
          accent="bg-slate-50"
        >
          <ol className="space-y-3">
            <Step n={1}>
              Download the manifest XML using the link above and save it somewhere easy to find
              (e.g. your Desktop or Documents folder).
            </Step>
            <Step n={2}>
              Open <strong>Outlook</strong> and click the <strong>Home</strong> tab in the ribbon.
            </Step>
            <Step n={3}>
              Click <strong>Get Add-ins</strong> (or <strong>Store</strong> in older versions).
              A dialog will open.
            </Step>
            <Step n={4}>
              In the left sidebar choose <strong>My add-ins</strong>, then scroll to the bottom
              and click <strong>Add a custom add-in</strong> → <strong>Add from File…</strong>
            </Step>
            <Step n={5}>
              Browse to and select the <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">wheb-crm-manifest.xml</code> file
              you downloaded. Click <strong>Open</strong>, then confirm the warning by clicking <strong>Install</strong>.
            </Step>
            <Step n={6}>
              Close the dialog. Open any email and you should now see a <strong>WHEB CRM</strong> button
              in the ribbon. Click it to open the task pane.
            </Step>
          </ol>
          <div className="mt-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <CheckCircle2 size={15} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              If you later update the add-in, simply remove and re-add it using the same steps.
              The manifest URL at <span className="font-mono">{MANIFEST_URL}</span> always points
              to the latest version.
            </p>
          </div>
        </Section>

        {/* Outlook on the Web */}
        <Section
          icon={<Mail size={20} className="text-indigo-600" />}
          title="Outlook on the Web (OWA)"
          subtitle="Install directly in your browser — no file download needed"
          accent="bg-slate-50"
        >
          <ol className="space-y-3">
            <Step n={1}>
              Go to{' '}
              <a href="https://outlook.office.com" target="_blank" rel="noopener noreferrer"
                className="text-blue-600 underline underline-offset-2 inline-flex items-center gap-0.5">
                outlook.office.com <ExternalLink size={10} />
              </a>{' '}
              and open any email.
            </Step>
            <Step n={2}>
              Click the <strong>…</strong> (More actions) button in the email toolbar and choose
              <strong> Get Add-ins</strong>.
            </Step>
            <Step n={3}>
              Select <strong>My add-ins</strong> in the left panel, scroll to the bottom and click
              <strong> Add a custom add-in</strong> → <strong>Add from URL</strong>.
            </Step>
            <Step n={4}>
              Paste the manifest URL:{' '}
              <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs break-all">{MANIFEST_URL}</code>
              {' '}and click <strong>OK</strong>, then <strong>Install</strong>.
            </Step>
            <Step n={5}>
              Reload the page. Open any email and click the <strong>WHEB CRM</strong> button
              that appears in the message toolbar.
            </Step>
          </ol>
        </Section>

        {/* Edge PWA */}
        <Section
          icon={<Chrome size={20} className="text-green-600" />}
          title="Edge — Install as an App (PWA)"
          subtitle="Pin the CRM to your taskbar and open it like a desktop app with no browser chrome"
          accent="bg-slate-50"
        >
          <ol className="space-y-3">
            <Step n={1}>
              Open <strong>Microsoft Edge</strong> and navigate to{' '}
              <a href={APP_URL} target="_blank" rel="noopener noreferrer"
                className="text-blue-600 underline underline-offset-2 inline-flex items-center gap-0.5">
                {APP_URL} <ExternalLink size={10} />
              </a>{' '}
              and sign in.
            </Step>
            <Step n={2}>
              Click the <strong>…</strong> menu (top-right) → <strong>Apps</strong> →
              <strong> Install this site as an app</strong>.
            </Step>
            <Step n={3}>
              In the dialog that appears, confirm the name (<em>WHEB CRM</em>) and click
              <strong> Install</strong>.
            </Step>
            <Step n={4}>
              Edge will open the app in its own window and pin it to your taskbar.
              You can also find it in <strong>Start → All Apps</strong>.
            </Step>
          </ol>
          <div className="mt-4 flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
            <CheckCircle2 size={15} className="text-slate-500 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600">
              The install icon (⊕) also appears directly in the Edge address bar when you visit
              the app — click it for a one-step install.
            </p>
          </div>
        </Section>

        {/* Troubleshooting */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Troubleshooting</h3>
          <ul className="space-y-1.5 text-xs text-slate-600 list-disc list-inside">
            <li>The add-in panel is blank — make sure you are signed in at <span className="font-mono">{APP_URL}</span> in the same browser first.</li>
            <li>No WHEB CRM button visible in the ribbon — close and reopen Outlook after installing.</li>
            <li>Corporate firewall blocking the manifest — ask IT to whitelist <span className="font-mono">wheb-crm.vercel.app</span>.</li>
            <li>Add-in not available in OWA — your M365 admin may have restricted custom add-ins; contact them to enable user-sideloading.</li>
          </ul>
        </div>

      </div>
    </div>
  )
}
