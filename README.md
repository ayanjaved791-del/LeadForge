# LeadForge

LeadForge is a SaaS-style platform for **discovering local businesses and turning them into clients**. You can discover businesses on OpenStreetMap, spot the ones without a working website, score each opportunity, save leads, and run your sales in a built-in CRM.

> **This is the frontend-only edition.** The whole app runs in the browser and your data is stored in this browser (`localStorage`). There is no server or database to set up, so you can host it anywhere for free, including Vercel.
>
> The full **PHP + MySQL** edition (server-side storage, password reset by email, deeper website audits) is kept on the [`backend`](https://github.com/ayanjaved791-del/leadforge/tree/backend) branch.

## Features
- **Business discovery:** search by country, city, area, category (18 types) and radius, using the free OpenStreetMap Nominatim and Overpass APIs. Only real OpenStreetMap data is shown; missing information is never invented.
- **Map explorer:** a Leaflet + OpenStreetMap map with markers coloured by score, a radius circle, click-to-search and save-from-popup.
- **Website status:**
  - Statuses: Available, No Website Found, Inactive, Needs Review, Unknown.
  - "No website" is clearly labelled as not proof, and uncertain browser checks are marked *Needs Review*.
- **Opportunity score (0–100):** transparent rules, adjustable per workspace. Each business shows why it got its score. It is not a probability of winning the deal.
- **Leads:** notes, tags, priority, 8 statuses, follow-ups, search and filters, CSV export, bulk delete.
- **CRM:**
  - Drag-and-drop pipeline and contacts.
  - Activity log for calls, emails, meetings and WhatsApp.
  - Follow-up reminders, tasks, a calendar, email templates and revenue tracking.
- **Website audit:** reachability, HTTPS and response time.
- **Dashboard and analytics:** every number is calculated from your own data; nothing is hard-coded.
- **Accounts:** registration, login, onboarding and workspaces. Passwords are hashed with PBKDF2 (Web Crypto).
- **Data and backup:** export and restore a JSON backup, or delete everything, under **Settings → Data & backup**.

### Limits of the browser-only edition
- **Data stays in the browser.** Other browsers and devices won't see it, and clearing site data erases it, so download backups regularly.
- **No emails.** Password reset and email verification need the server edition.
- **Browsers can't read other websites (CORS).** Website checks can only confirm that a site answers over HTTPS and how fast. Audits can't read page content such as title, meta tags or viewport.

## Tech stack
TypeScript · React 19 · Vite · Tailwind CSS v4 · shadcn/ui (Radix) · Lucide icons · Recharts · TanStack Query · React Router · Leaflet + OpenStreetMap

## Run locally
```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```
```bash
npm run build      # static site in frontend/dist
```

## Deploy to Vercel
1. On vercel.com, go to **Add New → Project** and import this repository.
2. Click **Deploy**. No environment variables are needed.

Root Directory can be left empty (`./`) or set to `frontend`; both work. `vercel.json` handles the build and makes deep links (e.g. `/leads/123`) load the app.

The output is a static site, so any other static host works too: Netlify, GitHub Pages or Cloudflare Pages, or upload `frontend/dist` to any web server. Configure your host to serve `index.html` for unknown paths.

## Project structure
```
frontend/
  src/
    components/   layout (sidebar, header), shared UI, shadcn/ui primitives
    pages/        dashboard, discovery, leads, CRM, audit, analytics, settings…
    lib/api.ts    API client (browser-only mode by default)
    lib/local/    in-browser data layer: storage, OpenStreetMap, scoring, website checks, request router
```
`lib/local/server.ts` implements the same endpoints as the PHP API, so the pages don't care which edition they run on. To switch back to the PHP backend, restore it from the `backend` branch and build with `VITE_DATA_MODE=api` (see `frontend/.env.example`).

## Attribution
Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, available under the ODbL. Discovery requests are cached and throttled to respect the Nominatim and Overpass usage policies.
