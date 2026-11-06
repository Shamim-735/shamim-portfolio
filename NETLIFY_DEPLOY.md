# Deploy your portfolio on Netlify

This package includes the complete design, animations, public portfolio, private admin panel, username/password login, optional phone OTP, shared project storage, and enquiry inbox. It uses Netlify Functions, Netlify Database (Postgres), and Netlify Blobs. Deploy the project from Git so the backend functions and database migrations are included.

## 1. Extract and open the code

Extract `Shamim_Portfolio_Final_With_Admin.zip`. Open the extracted `Shamim_Portfolio` folder in VS Code. Its root should contain `package.json`, `netlify.toml`, `public`, `worker`, `scripts`, and `netlify`.

Install Node.js 24 LTS if necessary. Open a new VS Code terminal and run:

```sh
npm install
npm run setup:netlify
```

If PowerShell blocks `npm.ps1`, use `npm.cmd install` and `npm.cmd run setup:netlify` instead.

The second command creates `.env.netlify` with four private settings and prints a private setup link. It does not choose your username or password. Keep the generated file on your computer; the supplied `.gitignore` excludes it and the local setup state from Git.

## 2. Put the project on GitHub

Create a private GitHub repository and commit the extracted project folder. GitHub Desktop is a convenient option: add this folder as a local repository, make the first commit, then publish the repository privately.

The repository root must contain `netlify.toml` and `package.json` directly. Include `package-lock.json`, the `netlify` folder, `public`, `worker`, `scripts`, `drizzle`, and the guide. Exclude `node_modules`, `.env.netlify`, `.sites-runtime`, `dist`, and `netlify-public`; `.gitignore` handles these when you commit through Git or GitHub Desktop. Do not upload the entire working folder using a web file uploader after generating the secret file.

## 3. Import it into Netlify

In Netlify, choose **Add new project → Import an existing project → GitHub**, then select your repository.

Use these settings (the included `netlify.toml` already supplies them):

| Setting | Value |
| --- | --- |
| Framework preset | Other / no framework |
| Base directory | Leave empty if `package.json` is at repository root |
| Build command | `npm run build` |
| Publish directory | `netlify-public` |
| Functions directory | `netlify/functions` |
| Node.js version | `24` |

Deploy the project. Because `@netlify/database` is installed and SQL migrations are included in `netlify/database/migrations`, Netlify provisions the database and applies its schema during deployment. The file store is opened by the function when artwork is uploaded. Your Netlify plan must support Netlify Database; it is available on credit-based plans and usage counts toward your plan's limits.

If the project reports that no database is provisioned, open **Data & Storage → Database**, create the database, and redeploy. Do not paste a database password into the frontend.

## 4. Add the private settings

Open **Project configuration → Environment variables → Add a variable → Import from a .env file**. Import your local `.env.netlify` file. The required settings are:

| Variable | Purpose |
| --- | --- |
| `ADMIN_PASSWORD_PEPPER` | Private key used when hashing passwords; keep it unchanged after account setup |
| `ADMIN_PHONE` | The single approved OTP number; initially `+8801868333944` |
| `ADMIN_SETUP_TOKEN_HASH` | Hash of the one-time account setup invitation |
| `ADMIN_SETUP_EXPIRES` | Invitation expiration time |

Make the values available to **Functions**, with the **Production** deploy context. If your Netlify UI does not offer scope choices, keep the values private in the environment-variable settings. Then create a new production deploy so the functions receive the values.

These are server settings. They are not the username or password you will use to sign in.

## 5. Create your Netlify admin account

Copy the real Netlify website origin from the successful deployment. In the same local project folder, run the following, replacing the example with your website origin:

```sh
npm run setup:netlify -- https://YOUR-SITE.netlify.app
```

Open the private link printed by that command. On the website, choose your username and a password of at least 14 characters. Account creation signs you into `/admin` automatically. In future, open `/admin/login` to sign in. Visitors see only the public portfolio; no management link or editor is included on that page.

Use this command within 24 hours of generating the invitation. If the invitation expired, rerun the command, re-import the updated `.env.netlify`, and redeploy before using the new link. The helper retains the same pepper. Never replace an existing pepper with a new random value after creating the account: the stored password hash depends on it.

The existing ChatGPT-hosted site's account is stored in that site's database. It is not included in source code and does not automatically transfer to Netlify. You can choose the same username/password again on the new deployment, or different ones. No ChatGPT account is required for the Netlify admin login.

## 6. Bring your projects across

On the current portfolio, sign in to its admin panel and choose **Back up projects**. This creates a JSON backup containing the artwork, metadata, and ordering.

Sign in to the Netlify admin panel and choose **Import backup**. Confirm replacing its collection. The images upload to Netlify Blobs and the collection is saved to Netlify Database, so visitors on other devices see the same work.

Projects still stored only in a phone's browser must be backed up from that browser first. Admin credentials, sessions, and the previous enquiry inbox are separate from project backups and are not transferred by this step.

## 7. Optional phone OTP

Password login works after account setup. The OTP option remains disabled until you configure a real SMS provider.

The included adapter uses Twilio Verify. Set up the provider service and configure these additional private Netlify environment variables with the Functions scope, then redeploy:

```text
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_VERIFY_SERVICE_SID
```

The server sends codes only to `ADMIN_PHONE`, enforces resend/attempt limits, and requires provider approval before issuing a session. SMS delivery charges and country availability depend on the provider. No SMS account, funds, secret keys, or test code are included in the ZIP. Test delivery to your actual phone after configuring the provider.

## 8. Check the result

- Open the portfolio in a private/incognito window: it should load without sign-in and show no project-management controls.
- Visit `/admin`: it should show the independent sign-in page until authenticated.
- Add or import a project, reload, and check another device.
- Sign out: the admin panel and enquiry inbox must require login again.
- Send a real enquiry and check **Load project enquiries**. FormSubmit forwarding to Gmail still needs its one-time email activation and real inbox verification; the brief is saved even if email forwarding fails.

## Run locally

```sh
npm install
npm run dev
```

The local server prints a local setup link on first use. Its SQLite database and media live in the ignored `.sites-runtime` folder. Local credentials and projects are separate from Netlify production. To test the actual Netlify platform locally after linking a Netlify project, use a current Netlify CLI and `netlify dev`.

## Build and verification

```sh
npm test
npm run build
```

44 automated checks passed when this package was created. They include the original regression suite and an integration check using an actual Postgres engine (PGlite) with the Netlify storage adapters. The generated public folder is checked to ensure it contains no admin editor, server code, or secrets. A real Netlify deployment and SMS delivery have not been performed from this environment.

## References

- Repository deployment: https://docs.netlify.com/start/quickstarts/deploy-from-repository/
- Database setup: https://docs.netlify.com/build/data-and-storage/netlify-database/getting-started/
- Database migrations: https://docs.netlify.com/build/data-and-storage/netlify-database/migrations/
- Functions and environment variables: https://docs.netlify.com/build/functions/environment-variables/
- Blobs storage: https://docs.netlify.com/build/data-and-storage/netlify-blobs/
