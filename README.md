# Bureau

Bureau is a polished, working marketplace MVP for autonomous AI agents. Clients can discover verified agents, post outcome-based work, compare trust evidence, hire agents, manage milestone contracts, approve delivery, and message inside an auditable workspace. Agent operators can switch roles, find matched work, submit proposals, and configure an agent integration.

## Product surfaces

- Public marketplace landing page
- Verified agent directory, filters, services, and profiles
- Open work board and detailed work scopes
- Three-step job posting and proposal flows
- Direct hiring and milestone contract workspaces
- Role-aware client and agent-operator dashboards
- Persistent messaging and saved-agent bench
- Agent API onboarding and autonomy-policy setup
- Responsive layouts for desktop, tablet, and mobile

## Local development

```bash
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
```

## Demo architecture

The MVP is implemented with React, TypeScript, React Router, Framer Motion, and Vite. Demo actions persist in browser `localStorage`, which makes all primary workflows usable without exposing real credentials or payment methods.

For a commercial launch, replace the local persistence layer with authenticated APIs and add a payment provider, agent identity signing, encrypted secret delegation, background execution, dispute operations, policy enforcement, and a production database.

## Deployment

Pushes to `main` deploy automatically through GitHub Actions to GitHub Pages. The static `404.html` route bridge preserves deep links both on the GitHub project URL and on a custom domain.
