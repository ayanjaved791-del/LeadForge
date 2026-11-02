# LeadForge

LeadForge is a self-hosted SaaS platform for **finding local businesses and turning them into clients**. Freelancers, web developers and agencies use it to:

1. discover businesses by country, city, area, category and radius (OpenStreetMap),
2. spot businesses that have no website, or a broken one,
3. see a transparent opportunity score,
4. save them as leads and work them through a full CRM (pipeline, contacts, activities, follow-ups, tasks, calendar, email templates),
5. audit prospects' websites and track revenue in a live analytics dashboard.

**Zero budget.** Everything is free and open source. There are no paid APIs, no Google Maps and no AI services, and it runs on XAMPP.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | TypeScript, React 19 (TSX), Vite, Tailwind CSS v4, shadcn/ui (Radix), Lucide icons, Recharts, TanStack Query, React Router |
| Maps | Leaflet + OpenStreetMap tiles, Overpass API (businesses), Nominatim (geocoding) |
| Backend | Core PHP 8 REST API (no framework), PDO, PHP sessions |
| Database | MySQL / MariaDB (managed with phpMyAdmin) |
| Dev tools | XAMPP, VS Code, Git, Node.js (frontend build only, never used as the production backend) |

## Architecture

```
leadforge/
├── api/                    PHP REST API (served by Apache)
│   ├── index.php           front controller + route table
│   ├── .htaccess           rewrites to index.php, blocks src/ storage/ config
│   ├── config.example.php  copy to config.php
│   ├── bin/migrate.php     CLI migration runner
│   ├── src/Core/           Router, Request/Response, Database (PDO), Session, Csrf,
│   │                       RateLimiter, Validator, Auth middleware, Scope (workspace isolation)
│   ├── src/Services/       Osm (Overpass/Nominatim + cache), SafeHttp (SSRF-safe client),
│   │                       WebsiteChecker, Scoring, Auditor, Businesses, Mailer, Usage, Notifier
│   ├── src/Controllers/    Auth, Workspace, Discovery, Lead, Crm, Audit, Analytics, Notification
│   └── storage/            mail/ (dev emails), logs/ (not web-accessible)
├── database/migrations/    SQL migrations (import with phpMyAdmin or bin/migrate.php)
├── frontend/               React + TypeScript source (Vite)
│   └── src/
│       ├── components/layout   sidebar, header, auth layout
│       ├── components/shared   badges, cards, forms, modals, states
│       ├── components/ui       shadcn/ui primitives
│       ├── pages/              dashboard, discovery, leads, crm, audit, analytics, settings…
│       └── lib/                typed API client, types, formatting, constants
└── app/                    production build output (git-ignored)
```

**How the pieces talk:** the browser loads the React app, which calls `/api/...` with `fetch` (credentials included). PHP keeps the user signed in with an HTTP-only session cookie. Each state-changing request also carries an `X-CSRF-Token` header. Every tenant table has a `workspace_id` column, and every query is scoped to the signed-in user's current workspace.

### Database

The schema is normalised and lives in `database/migrations/001_initial_schema.sql`. Primary keys are UUIDs. The tables are:

- **Identity:** `users`, `profiles`, `email_verifications`, `password_resets`
- **Workspaces and billing:** `workspaces`, `workspace_members`, `subscriptions`, `usage_records`
- **Discovery:** `businesses`, `saved_searches`
- **Leads and CRM:** `leads`, `tags`, `lead_tags`, `contacts`, `lead_notes`, `lead_activities`, `tasks`, `follow_ups`, `calendar_events`, `email_templates`
- **Audits and notifications:** `website_audits`, `notifications`
- **Infrastructure:** `rate_limits`, `api_cache`, `schema_migrations`

The schema uses foreign keys with cascading rules, plus composite indexes for the workspace-scoped queries, CHECK constraints and timestamps.

---

## Running locally with XAMPP

### 1. Requirements
- [XAMPP](https://www.apachefriends.org/) with PHP 8.1+ (it includes Apache, MariaDB/MySQL and phpMyAdmin). PHP extensions `pdo_mysql`, `curl`, `dom`, `mbstring` and `json` are enabled by default.
- [Node.js 20+](https://nodejs.org/) (only to build the frontend).

### 2. Put the project in `htdocs`
```bash
cd C:\xampp\htdocs        # macOS: /Applications/XAMPP/htdocs
git clone https://github.com/ayanjaved791-del/leadforge.git
```
The API is now served at `http://localhost/leadforge/api/`. Make sure `mod_rewrite` is enabled; it is in XAMPP's default config.

### 3. Create the database
Start **Apache** and **MySQL** in the XAMPP control panel, then do either of the following:

- **phpMyAdmin:** open http://localhost/phpmyadmin, create a database `leadforge` (collation `utf8mb4_unicode_ci`), then *Import* `database/migrations/001_initial_schema.sql`.
- **CLI:**
  ```bash
  cd C:\xampp\htdocs\leadforge\api
  copy config.example.php config.php
  C:\xampp\php\php.exe bin\migrate.php
  ```

### 4. Configure the API
Copy `api/config.example.php` to `api/config.php` and set:
- `db.username` / `db.password` (XAMPP default: `root` with an empty password),
- `osm.user_agent`: put your own contact email here, as the Nominatim usage policy requires,
- `app.url`: the URL where you open the frontend. Password-reset and verification links point here.

### 5. Run the frontend

**Development (hot reload):**
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173. Vite proxies `/api` to `http://localhost/leadforge/api`, so the session cookie stays same-origin. If your folder or port is different, set `LEADFORGE_API_TARGET` / `LEADFORGE_API_PATH` in `frontend/.env.local`.

**Production build (served by Apache only):**
```bash
cd frontend
npm run build      # writes static files to ../app
```
Open http://localhost/leadforge/app/ (or http://localhost/leadforge/, which redirects there). Set `app.url` in `config.php` to that URL.

### Emails in development
Mail uses the free `log` driver by default. Verification and password-reset emails are written to `api/storage/mail/*.eml`, so open the newest file to get the link. Set `mail.driver` to `mail` to use PHP `mail()`/sendmail when you deploy.

---

## Deploying to shared PHP/MySQL hosting
1. Upload `api/`, the built `app/` folder and the root `index.php`.
2. Import the migration through the host's phpMyAdmin and create `api/config.php`. Set `app.env` to `production` and `session.secure` to `true` (HTTPS).
3. If the files live under a different path, rebuild with `VITE_BASE=/your-path/app/ VITE_API_BASE=/your-path/api npm run build`.

---

## Feature notes

### Business discovery
- Searches use OpenStreetMap's **Overpass API** with 18 category mappings (restaurants → `amenity=restaurant|fast_food`, law firms → `office=lawyer`, and so on). Locations are geocoded with **Nominatim**.
- The app only shows data that exists in OSM: name, category, address, phone, website, email, social links, opening hours and coordinates. **Missing information is never invented.**
- Usage policies are respected:
  - an identifying User-Agent is sent;
  - Nominatim is throttled to 1 request per second;
  - every response is cached in MySQL (geocodes for 30 days, POI searches for 24 hours);
  - each workspace is limited to 10 searches per minute;
  - each workspace has a free-plan monthly quota.

### Website status detection
| Status | Meaning |
| --- | --- |
| Website Available | A listed website responded with a 2xx status |
| No Website Found | No website **and** no social profile in OSM. The UI explains that this is *not proof* the business has no website |
| Website Inactive | DNS failure, refused connection, or a 404/410/5xx response |
| Needs Review | Bot protection (401/403/429/503), a timeout, a TLS problem, a parked domain, a social-only presence, or a private address |
| Unknown | A website is listed but hasn't been checked yet |

### SSRF protection (website checks and audits)
- Only http/https on ports 80 and 443 are allowed, and URLs containing credentials are rejected.
- Every resolved IP must be public. Private, loopback, link-local, CGNAT, reserved, multicast, ULA and IPv4-mapped addresses are rejected.
- The connection is pinned to the validated IP (`CURLOPT_RESOLVE`), which prevents DNS rebinding.
- Redirects are followed manually (at most 4) and every hop is validated again.
- Response bodies are capped (64 KB for checks, 1.5 MB for audits).
- HTML is parsed as inert text with libxml (`LIBXML_NONET`). Scripts are never executed.

### Opportunity scoring
The score runs from 0 to 100 and is rule-based. Each business shows the rules it matched and their points. Workspace admins can change the points under **Settings → Scoring rules**, and every business is then re-scored.

**Default points**

| Signal | Points |
| --- | --- |
| No website | +40 |
| Website unreachable | +20 |
| Uncertain status | +10 |
| No HTTPS | +10 |
| No phone | +5 |
| No email | +5 |
| No social media | +5 |
| No opening hours | +5 |
| Audit: no mobile viewport | +10 |
| Audit: no meta description | +5 |
| Audit: no title | +5 |
| Audit: slow response | +5 |

**Bands**

| Band | Score |
| --- | --- |
| Low | 0–24 |
| Medium | 25–49 |
| High | 50–74 |
| Very High | 75+ |

The score is **not** a probability of closing a deal, and the UI says so.

### CRM
- **Pipeline:** a drag-and-drop Kanban with 8 statuses. Moving a lead to Won or Lost records the date automatically, and a reason can be recorded for lost deals.
- **Contacts:** contacts can be linked to leads.
- **Activity log:** calls, emails, meetings, WhatsApp messages and notes, each with direction, outcome and duration. The first outbound contact moves a New lead to Contacted.
- **Follow-ups:** follow-ups that become due create in-app notifications. No cron job is needed.
- **Tasks:** a board with assignees.
- **Calendar:** a month view showing events, follow-ups and tasks together.
- **Email templates:** variables such as `{{business_name}}` are filled from the lead. Emails open in your own mail client (`mailto:`) and are logged on the lead.
- **Revenue:** revenue tracking uses each lead's deal value and the date it was won.

### Security checklist
- PDO prepared statements everywhere, with emulated prepares turned off.
- `password_hash` (bcrypt by default) with automatic rehashing.
- HTTP-only, SameSite=Lax session cookies with strict mode. The session ID is regenerated on login, and sessions have an idle timeout.
- A synchronizer CSRF token is required on every non-GET request.
- MySQL-backed rate limiting covers login (per IP and per email), registration, password reset, geocoding, discovery, website checks, audits and a global per-session cap.
- Server-side validation of every input, and React escaping of all output. JSON responses use `JSON_HEX_TAG`, and CSV exports are protected against formula injection.
- Authentication middleware on every private route, and role checks (owner/admin/member) on workspace settings.
- Workspace isolation through `Scope::find()` and `workspace_id` filters on every query.
- Password-reset and email-verification tokens are stored only as SHA-256 hashes and expire. Password-reset requests don't reveal whether an account exists.
- `config.php`, `src/`, `storage/` and `bin/` are blocked from the web, and DB credentials never reach the frontend.
- Security headers: `nosniff`, `X-Frame-Options: DENY`, a restrictive CSP on API responses, and `Referrer-Policy`.

## API overview
All responses have the shape `{ "data": ... }` or `{ "error": { "message", "fields?" } }`.

| Area | Endpoints |
| --- | --- |
| Auth | `GET /auth/csrf`, `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `PATCH /auth/profile`, `POST /auth/password`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `POST /auth/verify-email`, `POST /auth/resend-verification` |
| Workspace | `GET/PATCH /workspace`, `POST /workspace/switch`, `GET/PUT /workspace/scoring`, `GET/POST /workspace/members`, `DELETE /workspace/members/{id}` |
| Discovery | `GET /discovery/categories`, `GET /discovery/geocode`, `POST /discovery/search`, `GET /businesses`, `GET/DELETE /businesses/{id}`, `POST /businesses/{id}/check-website`, `POST /businesses/check-websites`, `GET/POST /saved-searches`, `POST /saved-searches/{id}/run`, `DELETE /saved-searches/{id}` |
| Leads | `GET/POST /leads`, `GET /leads/export`, `GET /leads/tags`, `POST /leads/bulk-delete`, `GET/PATCH/DELETE /leads/{id}`, `POST /leads/{id}/move`, `POST /leads/{id}/notes`, `DELETE /leads/{id}/notes/{noteId}` |
| CRM | `/contacts`, `/activities`, `/tasks`, `/follow-ups`, `/calendar`, `/calendar/events`, `/email-templates` (standard CRUD) |
| Audit | `GET/POST /audits`, `GET/DELETE /audits/{id}` |
| Analytics | `GET /dashboard?year=`, `GET /analytics?days=` |
| Notifications | `GET /notifications`, `POST /notifications/read-all`, `POST /notifications/{id}/read`, `DELETE /notifications/{id}` |

## Attribution
Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, available under the ODbL. Map tiles come from the OpenStreetMap Foundation tile servers, so follow their [tile usage policy](https://operations.osmfoundation.org/policies/tiles/). For heavy use, switch to another free tile provider.
