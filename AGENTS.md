# Deployment & Git Workflow Rules

For every verified code change made in this workspace (`cue`):

1. Update `README.md` whenever user-facing features, architecture, or workflows change so the repository documentation stays accurate.
2. Run `npm run build` (`tsc -b && vite build`) and confirm it exits with code `0`.
3. Stage and commit all changes cleanly on branch `main`, and push to GitHub (`origin main`, repository `rohail-git/cue`).
4. Deploy the production build to Vercel (`vercel --prod --yes`).
5. Report the GitHub commit hash / URL and the live Vercel production URL in the final response.
