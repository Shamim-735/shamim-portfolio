# Shamim portfolio — final Netlify package

Start with **NETLIFY_DEPLOY.md** for complete deployment and admin-account setup steps.

This version preserves the portfolio design and adds a Netlify deployment adapter for the independent admin login, shared projects, images, and private enquiry inbox.

```sh
npm install
npm run dev
```

For Netlify production, import the project from GitHub and use:

- Build command: `npm run build`
- Publish directory: `netlify-public`
- Functions directory: `netlify/functions`
- Node.js: `24`

Run `npm run setup:netlify` on your computer, import its private `.env.netlify` settings into Netlify, redeploy, and follow the printed one-time link to choose the Netlify deployment's username and password. Existing hosted credentials and project data live in a separate database; use the guide to initialize the new account and import a project backup.

Phone OTP is included as an optional Twilio Verify integration, disabled until its provider secrets are configured. Username/password sign-in does not need an SMS provider or ChatGPT account.

Files:

- `public/`: design, animations, public pages, and admin UI
- `worker/`: portable application and authentication logic
- `netlify/functions/portfolio.mjs`: Netlify route handler
- `netlify/server/adapters.mjs`: Postgres and Blobs adapters
- `netlify/database/migrations/`: Netlify Postgres schema
- `drizzle/`: SQLite schema for local development
- `scripts/`: local preview, build, and private setup helpers
- `tests/`: 44 automated regression and integration checks

This package contains no account passwords, live sessions, setup invitation, SMS keys, uploaded project collection, or private enquiry records. Do not publish `.env.netlify` or `.sites-runtime`.
