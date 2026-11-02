// Runs before `npm run build`. On Vercel the project must be built from the repository root
// (vercel.json runs `npm run build:vercel`). If Vercel runs `npm run build` here, the project's
// Root Directory is set to "frontend" — fail with a clear explanation instead of a missing "dist" error.
if (process.env.VERCEL) {
  console.error(`
  ✖ LeadForge: wrong Vercel "Root Directory".
    In Vercel → Project → Settings → Build and Deployment, clear "Root Directory"
    (it must be the repository root, not "frontend") and set Framework Preset to "Other".
    Then create a NEW deployment from the latest commit on main (not "Redeploy").
`);
  process.exit(1);
}
