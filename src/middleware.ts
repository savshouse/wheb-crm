import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes served to external services (MS Graph, Vercel cron) — never have a
// Supabase session, so skip the auth check entirely to avoid pointless network calls.
const EXTERNAL_PREFIXES = ['/api/webhook/', '/api/cron/']

// Routes accessible without a session (auth pages, public token-protected feeds, add-in).
const PUBLIC_PREFIXES = [
  '/auth/',
  '/api/rss/',
  '/api/pa/',
  '/privacy',
  '/outlook',  // covers /outlook and /outlook-addin
]

// /api/calendar/{uuid} — iCal feed, token-protected at the route level.
// Other /api/calendar/* routes (schedule, search, outlook-search) are protected.
// 's', 'o', 'u' etc. are not hex chars so those names won't match.
const CALENDAR_FEED_RE = /^\/api\/calendar\/[0-9a-f-]{32,}$/i

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Let external-service routes bypass session handling completely
  if (EXTERNAL_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Build the response object; setAll will replace it with a new one carrying
  // refreshed cookies whenever Supabase rotates the session token.
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() validates the JWT with Supabase Auth (unlike getSession() which trusts
  // the local cookie without re-checking). This also triggers token refresh.
  const { data: { user } } = await supabase.auth.getUser()

  const isPublic =
    PUBLIC_PREFIXES.some(p => pathname.startsWith(p)) ||
    CALENDAR_FEED_RE.test(pathname)

  if (!user && !isPublic) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/auth/login'
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    // Run on all paths except Next.js internals and static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
