// Allowed origin for the WHEB CRM Chrome/Edge browser extension.
// Set CHROME_EXTENSION_ID in Vercel env vars to the 32-char ID shown in
// edge://extensions or chrome://extensions after loading the extension.
// While unset (e.g. during initial deployment), any chrome-extension:// origin
// is accepted — set the variable to lock it down.
const ALLOWED_ORIGIN = process.env.CHROME_EXTENSION_ID
  ? `chrome-extension://${process.env.CHROME_EXTENSION_ID}`
  : null

export function isExtensionOrigin(origin: string): boolean {
  if (!origin.startsWith('chrome-extension://')) return false
  return ALLOWED_ORIGIN ? origin === ALLOWED_ORIGIN : true
}

export function extensionCorsHeaders(origin: string): Record<string, string> {
  if (!isExtensionOrigin(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
  }
}
