export const metadata = { title: 'Privacy Policy — WHEB CRM' }

export default function PrivacyPage() {
  const updated = '2 October 2026'
  const contact = 'Mike.Savage@warren-house.co.uk'

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px', fontFamily: 'system-ui, sans-serif', color: '#1e293b', lineHeight: 1.7 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#1e40af', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 16 }}>
          WH
        </div>
        <span style={{ fontWeight: 700, fontSize: 18, color: '#1e40af' }}>WHEB CRM</span>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>Privacy Policy</h1>
      <p style={{ fontSize: 14, color: '#64748b', marginBottom: 40 }}>Last updated: {updated}</p>

      <Section title="Overview">
        <p>
          WHEB CRM is an internal client relationship and task management system operated by
          Warren House Employee Benefits Ltd. This privacy policy covers the WHEB CRM web
          application and its associated browser extension for Microsoft Edge and Google Chrome.
        </p>
        <p>
          The extension and application are intended exclusively for authorised employees of
          Warren House Employee Benefits Ltd. They are not publicly available and are not
          designed to collect data from members of the public.
        </p>
      </Section>

      <Section title="What data is accessed">
        <p>The WHEB CRM browser extension and web application access the following data:</p>
        <ul>
          <li><strong>Authentication credentials</strong> — email address and session token used to verify your identity. Stored in browser cookies and local storage.</li>
          <li><strong>CRM data</strong> — client records, tasks, meetings, and advice log entries stored in the WHEB CRM database (hosted on Supabase). This data belongs to Warren House Employee Benefits Ltd.</li>
          <li><strong>Task and notification counts</strong> — the extension reads your open and overdue task count to display a badge on the toolbar icon. This data is fetched directly from the WHEB CRM database.</li>
        </ul>
        <p>
          The extension does not read the content of emails, browser history, or any data from
          websites other than <strong>wheb-crm.vercel.app</strong> and the associated Supabase database.
        </p>
      </Section>

      <Section title="How data is used">
        <p>Data accessed by the extension and application is used solely to:</p>
        <ul>
          <li>Display your tasks, clients, meetings and advice log within the extension popup and side panel</li>
          <li>Allow you to update task status and details</li>
          <li>Show notification badges for overdue tasks</li>
        </ul>
        <p>Data is never sold, shared with third parties, or used for advertising or analytics purposes.</p>
      </Section>

      <Section title="Data storage and security">
        <p>
          All CRM data is stored in a Supabase PostgreSQL database with row-level security
          enabled. Only authenticated users with an active WHEB CRM account can access the data.
          Session credentials are stored in browser cookies and local storage on your device only.
        </p>
        <p>
          No data is stored locally by the extension beyond your authentication session. Clearing
          browser data or uninstalling the extension removes all locally held information.
        </p>
      </Section>

      <Section title="Third-party services">
        <p>The following third-party services are used:</p>
        <ul>
          <li><strong>Supabase</strong> (supabase.com) — database and authentication hosting</li>
          <li><strong>Vercel</strong> (vercel.com) — web application hosting</li>
          <li><strong>Anthropic</strong> (anthropic.com) — AI-powered task extraction from meeting notes (text only, no personal data)</li>
        </ul>
        <p>Each of these services maintains its own privacy policy and security standards.</p>
      </Section>

      <Section title="Your rights">
        <p>
          As an employee user, you may request access to, correction of, or deletion of any
          personal data held within the WHEB CRM system by contacting the administrator below.
          Account access can be revoked at any time by a system administrator.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          For any questions about this privacy policy or data held in the WHEB CRM system,
          please contact:
        </p>
        <p>
          <strong>Mike Savage</strong><br />
          Warren House Employee Benefits Ltd<br />
          <a href={`mailto:${contact}`} style={{ color: '#2563eb' }}>{contact}</a>
        </p>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #e2e8f0' }}>{title}</h2>
      <div style={{ fontSize: 15, color: '#334155' }}>{children}</div>
    </section>
  )
}
