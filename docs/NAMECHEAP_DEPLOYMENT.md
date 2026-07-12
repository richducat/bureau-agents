# Namecheap production setup

The source and frontend deployment are already on GitHub. Complete these steps inside the user’s Namecheap account; do not create or use a Vercel project.

## 1. Choose the production domain

Decide the standalone domain or dedicated subdomain before changing DNS. The build expects two origins:

- Public app, such as `https://example.com`
- API, such as `https://api.example.com`

Do not reuse an unrelated product’s domain or credentials.

## 2. Create the MySQL database

In cPanel:

1. Open **MySQL Databases**.
2. Create a database dedicated to Bureau.
3. Create a database user with a unique generated password.
4. Grant that user only the Bureau database’s privileges.
5. Record host, port, database, and username in the cPanel Node app environment; never commit them.

## 3. Create the Node.js application

Namecheap documents Node.js applications under **cPanel → Setup Node.js App** and currently lists Node 22 among supported versions. Use:

- Version: Node.js 22
- Mode: Production
- Application root: a dedicated directory such as `bureau-api`
- Application URL: the dedicated API subdomain
- Startup file: `server.js`

Source: [Namecheap Node.js application guide](https://www.namecheap.com/support/knowledgebase/article.aspx/10047/2182/how-to-work-with-nodejs-app/).

## 4. Configure environment values

Copy every key from `.env.example` into cPanel’s environment-variable UI and replace placeholders. Generate secrets locally:

```bash
openssl rand -hex 32  # CSRF_SECRET
openssl rand -hex 32  # DATA_ENCRYPTION_KEY
```

Required before live traffic:

- Exact `APP_ORIGIN`, `API_ORIGIN`, and `ALLOWED_ORIGINS`
- All MySQL values
- Both generated secrets
- Stripe live secret, webhook secret, and three Price IDs
- Namecheap SMTP host, user, password, port, secure flag, and from address
- `ADMIN_EMAILS`

## 5. Install and migrate

From the cPanel Node application virtual environment:

```bash
npm ci --omit=dev
node server-dist/migrate.js
```

Then restart the Node application and verify:

```text
GET https://api.example.com/health/live
GET https://api.example.com/health/ready
```

`ready` must report the database, Stripe, and email states accurately. Do not promote transactional actions while any required state is false.

## 6. Stripe configuration

1. Activate the Stripe platform account and complete its business profile.
2. Enable Connect marketplace onboarding.
3. Create recurring Prices for Operator Pro ($49/month) and Client Scale ($149/month).
4. Create the one-time agent verification review Price ($99).
5. Add the webhook endpoint `https://api.example.com/api/billing/webhook`.
6. Subscribe it to Checkout Session, PaymentIntent, Account, Subscription, Dispute, and Refund events handled in `server/routes/billing.ts`.
7. Add the resulting live IDs and signing secret to cPanel.
8. Complete Stripe test-mode end-to-end tests before replacing test values with live values.

## 7. GitHub configuration

Repository variables:

- `VITE_SITE_URL`
- `VITE_API_BASE_URL`
- `NAMECHEAP_API_DEPLOY_ENABLED=true` only after the first manual API deployment succeeds
- `NAMECHEAP_APP_ROOT`
- `NAMECHEAP_NODE_VERSION=22`
- `NAMECHEAP_API_HEALTH_URL` set to the exact public HTTPS `/health/live` URL

Repository production-environment secrets:

- `NAMECHEAP_SSH_HOST`
- `NAMECHEAP_SSH_USER`
- `NAMECHEAP_SSH_PRIVATE_KEY`
- `NAMECHEAP_SSH_KNOWN_HOSTS` copied from a trusted Namecheap/cPanel source, not accepted blindly with `ssh-keyscan`

The GitHub Actions environment should require production protection as appropriate. The workflow never uploads `.env` and preserves server environment variables in cPanel.

## 8. DNS and custom domain

Point the public custom domain to GitHub Pages using Namecheap’s GitHub Pages records, and point the API subdomain to the Namecheap hosting application. Add the custom domain in GitHub Pages and require HTTPS. After DNS and TLS settle, rebuild with the production site/API variables so canonicals, sitemap, CORS, and CSP use exact origins.
