# Phase 3, Part 1: SharePoint Document Storage (Phase 1 spec)

Status: DRAFT for review. Author: Claude, 2026-09-25.

## 1. Goal

Give every client (company or person) a **Documents** section in the CRM. Working documents (Word, Excel, PDFs, emails, reports) are stored in SharePoint and can be uploaded, found, previewed and opened from the CRM.

Papercloud stays for scanned documents. The CRM only links to it.

### In scope
- Documents section on the client page (`/clients/[id]`)
- Upload (drag and drop, multiple files, large files), open, preview, download, edit details, delete
- Category and document date on each file
- Search: by name and details across all clients, plus full-text search inside documents
- Papercloud reference and deep link on each client
- Folder auto-created per client in SharePoint

### Out of scope (later phases)
- The Papercloud-style in-tray (page splitting, merging, reordering scans)
- Document Sets for advice packs and plans
- Saving email attachments from the Outlook add-in
- Word template merge
- Client portal (clients do not upload, so not needed)
- Bulk purge of a client's documents on a removal request (design allows for it, see 9)

## 2. Design decisions

| Topic | Decision | Why |
|---|---|---|
| File storage | One SharePoint site, one library "Client Documents", one folder per client | Simple and native. Staff can also browse in SharePoint |
| Index | Mirror file metadata into Supabase (`client_documents`) | Fast lists, DataTable filtering, global search, no Graph call per page view. SharePoint stays the source of truth for file content |
| Identity of a file | SharePoint `driveItem.id`, never the path | Survives renames and moves |
| Auth | **Delegated** (each user's own Microsoft token), reusing the existing Entra app and the token storage in `profiles` that To Do sync already uses | No admin-only app-only setup needed. SharePoint audit shows the real user. Users only see what SharePoint permissions allow |
| Upload path | Browser uploads **directly to SharePoint** via a Graph upload session | Vercel body limit is about 4.5 MB. Files never pass through our server |
| Sync back from SharePoint | On-demand **delta query** (on tab open and via a Refresh button) | No cron, per the reactive preference. Webhooks can be added later if wanted |
| Deletion | Delete moves the file to the SharePoint recycle bin. Admin and manager roles only | "Keep everything forever" policy |

## 3. SharePoint setup (one-off, manual)

1. Create a SharePoint team or communication site: **WHEB Client Documents**. Add all CRM staff as Members.
2. In the default library (rename it **Client Documents**) add site columns:
   - `CRMClientId` (single line text, indexed)
   - `Category` (choice: see 5)
   - `DocDate` (date only)
   - `Notes` (multiple lines)
3. Enable versioning on the library (on by default).
4. Record `SHAREPOINT_SITE_ID` and `SHAREPOINT_DRIVE_ID` (from Graph Explorer: `/sites/{host}:/sites/{name}` then `/sites/{id}/drives`).
5. Entra app registration (existing app): add **delegated** permissions `Files.ReadWrite.All` and `Sites.ReadWrite.All`. Check whether the tenant allows user consent. If not, an M365 admin must click Grant admin consent. This is the one possible admin dependency.
6. Add env vars in Vercel (Production and Preview) and `.env.local`: `SHAREPOINT_SITE_ID`, `SHAREPOINT_DRIVE_ID`.

Note: the OAuth scope string in `src/app/api/auth/microsoft/route.ts` currently requests `Tasks.ReadWrite` only. It will add the two new scopes, and **every user must reconnect Microsoft once** to grant them.

## 4. Data model (`supabase/migrations/client_documents.sql`)

```sql
alter table clients
  add column papercloud_id text,          -- e.g. '313' -> https://www.papercloudelite.co.uk/client-file/313
  add column sp_folder_item_id text,
  add column sp_folder_url text;

create table client_documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete restrict,
  sp_drive_id text not null,
  sp_item_id text not null unique,
  name text not null,
  size_bytes bigint,
  mime_type text,
  web_url text not null,
  category text not null default 'Other',
  doc_date date,
  notes text,
  uploaded_by uuid references profiles(id),
  uploaded_at timestamptz not null default now(),
  modified_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references profiles(id)
);
create index on client_documents (client_id) where deleted_at is null;
create index on client_documents using gin (to_tsvector('english', name || ' ' || coalesce(notes,'')));

create table sp_delta_state (              -- single row
  id int primary key default 1,
  delta_link text,
  updated_at timestamptz
);
```

RLS: same pattern as other tables. Authenticated users can read. Writes go through server actions or route handlers using the service role after checking the user. Add `client_documents` to `src/lib/backup.ts`.

## 5. Categories

Constants file `src/lib/document-categories.ts` (same style as `benefit-types.ts`):
Advice, Plans & Policies, Correspondence, Meeting Notes, Reports & Valuations, ID & Compliance, Contracts & Agreements, Other.

## 6. Server side

All Graph calls go through a new `src/lib/sharepoint.ts`. It reuses `getValidAccessToken` from `microsoft-graph.ts`, and the `graph()` helper should be exported for reuse.

| Function or route | Purpose |
|---|---|
| `ensureClientFolder(token, client)` | Creates `Individuals/{Name} [{first 8 of id}]` or `Companies/{Name} [{...}]` if `sp_folder_item_id` is null and saves it. Uses conflict behaviour `fail`, then re-reads on 409 so concurrent uploads are safe |
| `POST /api/documents/upload-session` | Checks the user is signed in and has connected Microsoft. Ensures the folder and creates an upload session for `{folder}/{filename}` with `@microsoft.graph.conflictBehavior: rename`. Returns `uploadUrl` |
| `POST /api/documents/register` | Called after the upload finishes. Body: item ID, client ID, category, date, notes. Reads the item from Graph (name, size, webUrl), inserts a `client_documents` row, and PATCHes `listItem/fields` (`CRMClientId`, `Category`, `DocDate`, `Notes`) |
| `GET /api/documents/[id]/preview` | `POST /items/{id}/preview` returns an embeddable URL (short-lived) |
| `GET /api/documents/[id]/download` | Fetches a fresh `@microsoft.graph.downloadUrl` and 302-redirects to it |
| `PATCH /api/documents/[id]` | Edit category, date, notes, and name (rename via Graph PATCH) |
| `DELETE /api/documents/[id]` | Admin and manager only. `DELETE /items/{id}` (recycle bin), then sets `deleted_at` |
| `POST /api/documents/sync` | Delta query using the stored `delta_link`. It upserts changed items (renames, moves, edits made in SharePoint, uploads made outside the CRM) and marks deleted ones. Files in a client folder that are not in the DB are added by parsing the id from the folder name |
| `GET /api/documents/search?q=` | Graph Search API (`POST /search/query`, entity `driveItem`, KQL scoped to the library path), returns hits mapped back to `client_documents` rows |

Note: `AGENTS.md` warns that this Next.js version has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before writing route handlers and server actions.

## 7. UI

### 7.1 Client page: Documents section
New `src/app/(app)/clients/[id]/ClientDocuments.tsx` (client component), placed alongside the tasks and timeline panels.

- Category chips across the top (All, Advice, Plans & Policies...) with counts, acting as the "tabs" that Papercloud has.
- **DataTable** (per the table standards), `storageKey="client-documents"`. Columns: Name (with file-type icon), Category, Doc date, Uploaded by, Uploaded, Size. All standard sort, filter, reorder, hide and resize features apply.
- Row actions: Open in SharePoint or Office online, Preview (modal with iframe), Download, Edit details, Delete (admin and manager).
- Drop zone at the top: drop or select files, choose a category and date (default today) once for the batch, per-file progress bars. Chunked upload in 320 KiB multiples (for example 5 MiB chunks). Cap at 250 MB per file in the UI.
- Not connected to Microsoft: show a **Connect Microsoft** button linking to `/api/auth/microsoft`.
- Papercloud: field on the client edit form (`papercloud_id`). If set, show an **Open in Papercloud** button on the client page header.
- Refresh button (runs sync). Sync also runs when the section first loads.

### 7.2 Documents page (`/documents`) and global search
- New nav item. DataTable of all documents across clients, with a Client column linking to the client page.
- Box for "Search inside documents", which calls `/api/documents/search`.
- `GlobalSearch.tsx`: add document name matches (from Supabase).

## 8. Build order and estimates

| # | Step | Notes |
|---|---|---|
| 0 | SharePoint setup and consent (section 3) | Manual, about an hour, needs a 5-minute check on consent |
| 1 | **Spike**: browser-to-SharePoint upload session from `wheb-crm.vercel.app`, including CORS, a 100 MB test file and reconnect scopes | De-risks the whole design before building UI |
| 2 | Migration, types, `sharepoint.ts` | |
| 3 | Route handlers (upload-session, register, preview, download, patch, delete) | |
| 4 | `ClientDocuments` UI, Papercloud field | |
| 5 | Delta sync | |
| 6 | Documents page, global search, Graph content search | |
| 7 | Backup inclusion, testing, docs | |

## 9. Retention and client removal
Nothing is auto-deleted. If a client asks to be removed completely, an admin would: delete the client folder in SharePoint, delete the recycle-bin entries (first and second stage), and delete the `client_documents` rows. This is a manual runbook for now. A CRM "purge client documents" admin action can be added in phase 2. The `on delete restrict` on `client_documents.client_id` stops a client being deleted while documents still exist.

## 10. Risks and open questions

| Risk or question | Mitigation or decision needed |
|---|---|
| Delegated consent might need admin | Check in step 0. Fallback is app-only with `Sites.Selected`, which needs an admin either way |
| Users must have SharePoint site access | Add all staff to the site's Members group. New CRM users must be added too |
| Browser CORS on upload session URLs | Verify in the spike. Fallback is a server-side chunk relay in 4 MB pieces |
| Tokens are per user | If a user's Microsoft token expires or is revoked, the Documents section shows Connect Microsoft and does not fail silently |
| SharePoint OCR on scanned PDFs | Works for search on most tenants, but check on real scans in step 6 |
| Sensitive data (NI numbers, pensions) | Site is private to staff. Do not enable anonymous or org-wide sharing links. Consider sensitivity labels later |
| Folder naming with special characters | Sanitise names (`" * : < > ? / \ |`) and keep the client ID suffix as the stable key |
| Client renamed in CRM | Folder is not renamed automatically (the ID suffix keeps it findable). Optional rename on client edit |

## 11. Acceptance criteria
1. Upload a 150 MB PDF and a 20 KB Word doc to a client. Both appear in the Documents table with correct category and date, and in the correct SharePoint folder.
2. Open a Word doc in Word for the web from the CRM and edit it. The next refresh shows the updated modified date.
3. Rename a file in SharePoint. The CRM shows the new name after Refresh, and links still work.
4. Search for a phrase that appears only inside a document's text. The correct document is returned.
5. A staff user without SharePoint site access sees an access message, not a crash.
6. A staff user cannot delete. An admin or manager can, and the file is found in the SharePoint recycle bin.
7. Column layout preferences persist, as on other tables.
