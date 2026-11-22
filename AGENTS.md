# Deployment & Git Workflow Rules

For every verified code change made in this workspace (`cue`):

1. Run `npm run build` (`tsc -b && vite build`) and confirm it exits with code `0`.
2. Stage and commit all changes cleanly on branch `main`, and push to GitHub (`origin main`, repository `rohailshah/cue`).
3. Deploy the production build to Vercel (`vercel --prod --yes`).
4. Report the GitHub commit hash / URL and the live Vercel production URL in the final response.
