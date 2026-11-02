# HelloHR

HelloHR is a human resource management app that covers employees, departments, attendance, leave, holidays, payroll, recruitment and performance in one place. It's built with React and TypeScript, has a clean dashboard design with light and **black-and-white dark mode**, and runs entirely in the browser.

> Data is stored in your browser (`localStorage`), so there's no server or database to set up. Back it up under **Settings → Data & backup**.
>
> Earlier projects in this repository are kept on branches:
> - [`leadforge-crm`](https://github.com/ayanjaved791-del/leadforge/tree/leadforge-crm): LeadForge lead discovery CRM
> - [`backend`](https://github.com/ayanjaved791-del/leadforge/tree/backend): its PHP + MySQL edition

## Features
| Module | What you can do |
| --- | --- |
| **Dashboard** | Payroll total, headcount, who's present or on leave today, open positions, hires vs exits chart, 14-day attendance trend, pending leave approvals, upcoming birthdays, anniversaries and interviews |
| **Employees** | Directory (list/grid, search, filters, CSV export); profiles with personal, job, manager, salary, bank and emergency details; timeline, leave balances, attendance, payslips, reviews and goals; probation and offboarding |
| **Departments** | Department heads, headcount and payroll cost per department |
| **Attendance** | Daily register with check-in/out (automatic *Late* after start time + grace period); monthly overview grid |
| **Leave** | Requests with approve/reject, balances per leave type and year, configurable leave types (paid/unpaid). Weekends and holidays aren't counted |
| **Holidays & calendar** | Company holidays; a month calendar of leave, holidays, interviews, birthdays and work anniversaries |
| **Payroll** | Monthly runs built from each salary set-up (basic, allowances, deductions, tax %). Unpaid leave, absences, half days and partial months are deducted automatically. Adjust drafts, finalize, mark as paid, print payslips |
| **Recruitment** | Job openings and a drag-and-drop candidate pipeline (Applied → Screening → Interview → Offer → Hired/Rejected). Interviews with outcomes; **Hire** creates the employee record |
| **Performance** | Reviews rated 1–5 on six criteria, with strengths and improvement notes; goals with progress tracking |
| **Analytics** | Headcount trend, turnover, tenure, attendance rate, leave by type, payroll cost, recruitment funnel, time to hire, department and employment-type mix |
| **Settings** | Profile, password, company working days and hours, HR admins, data backup and restore |

Nothing is pre-filled: every number comes from the records you enter.

## Tech stack
TypeScript · React 19 · Vite · Tailwind CSS v4 · shadcn/ui (Radix) · Lucide icons · Recharts · TanStack Query · React Router

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
Import the repository on vercel.com and click **Deploy**. No settings or environment variables are needed. Root Directory can be `./` or `frontend`; both work.

Any static host works too. Serve `frontend/dist` and route unknown paths to `index.html`.

## Project structure
```
frontend/src/
  components/layout   sidebar, header, auth layout
  components/shared   cards, forms, modals, pickers, badges
  pages/              dashboard, analytics, people/, time/, payroll/, talent/, settings
  lib/api.ts          API client
  lib/local/          in-browser API (server.ts) and storage (store.ts)
```
`lib/local/server.ts` implements a REST-style API in the browser, so the pages could later talk to a real backend without changes.

## Data and privacy
- **Where data lives:** everything stays in the browser profile where it was entered. Passwords are hashed with PBKDF2 (Web Crypto), and nothing is sent to a server.
- **Shared admin access:** to share HelloHR between admins on different computers, a server backend would be needed.
