# Noticer (上稿 Noticer)

Noticer is a Cloudflare Workers-based monitoring service that periodically checks specific publishing platforms (such as **Vita** and **Peopo**) for new posts. It ensures that content is successfully published and notifies you of any delays or missing posts. It also includes an HTTP dashboard for real-time status monitoring and manual checks.

## Features

- **Automated Monitoring:** Runs securely on Cloudflare Workers using Scheduled Triggers (Cron).
- **Multiple Platforms:** Currently supports monitoring for **Vita** and **Peopo**.
- **Real-Time Dashboard:** A web-based dashboard at the root URL (`/`) provides the latest check statuses, update timestamps, and quick links to the newest articles.
- **Manual Triggers:** Endpoints available to manually trigger checks (`/test-vita` and `/test-peopo`).
- **Data Persistence:** Uses **Cloudflare D1** (SQLite) to track the latest posts and statuses.
- **Email Notifications:** Built-in support for alert notifications utilizing **Resend** APIs.

## Tech Stack

- [Cloudflare Workers](https://workers.cloudflare.com/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- TypeScript
- Tailwind CSS & FontAwesome (for the dashboard)

## Project Structure

```text
├── src/
│   ├── index.ts        # Cloudflare Worker entry point (HTTP & Cron handlers)
│   ├── checker.ts      # Core logic for checking Vita and Peopo platforms
│   ├── dashboard.ts    # HTML & Frontend JavaScript for the dashboard
│   └── sql/
│       └── schemas.sql # D1 database schema definitions
├── wrangler.jsonc      # Cloudflare Workers configuration file
├── package.json        # Node.js dependencies and scripts
└── tsconfig.json       # TypeScript configuration
```

## Setup & Local Development

### Prerequisites

- Node.js (v18+)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed globally or run via `npx`
- A Cloudflare Account

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Cloudflare D1 (Local)

Before running the worker locally, you must initialize the local D1 database schema:

```bash
npx wrangler d1 execute noticer-db --local --file=./src/sql/schemas.sql
```

### 3. Setup Secrets

You need to set up the Resend API key for email notifications. For local development, you could mock this or provide an `.dev.vars` file:

```env
RESEND_API_KEY="re_..."
```

### 4. Run Locally

Start the local development server (with cron triggers enabled):

```bash
npm run dev
```

Visit `http://localhost:8787` (or the port provided by Wrangler) in your browser to view the monitoring dashboard.

## Deployment

### 1. Initialize Production D1 Database

First, provision a new D1 database in your Cloudflare account. Update the `database_id` in your `wrangler.jsonc` file, then apply the schema to the production database:

```bash
npx wrangler d1 execute noticer-db --remote --file=./src/sql/schemas.sql
```

### 2. Set Production Secrets

Add the required secret (Resend API key) to your Cloudflare Worker:

```bash
npx wrangler secret put RESEND_API_KEY
```

### 3. Deploy

Deploy the worker to your Cloudflare account using:

```bash
npm run deploy
```

## API Routes

- `GET /` : HTML Dashboard.
- `GET /api/status` : Returns JSON with the current checking status of all platforms.
- `GET /test-vita` : Manually triggers the Vita platform check.
- `GET /test-peopo` : Manually triggers the Peopo platform check.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.