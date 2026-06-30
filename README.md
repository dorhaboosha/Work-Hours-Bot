<p align="center">
  <img src="assets/logo.jpeg" width="180" alt="Work Hours Bot Logo">
</p>

<h1 align="center">Work Hours Bot</h1>

<p align="center">
A backend-focused portfolio project demonstrating software architecture, REST API development, database design, and Telegram Bot integration using TypeScript and Node.js.
</p>

<p align="center">

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Version](https://img.shields.io/badge/version-0.0.1-blue)](#features)
[![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-7.x-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Telegraf](https://img.shields.io/badge/Telegraf-4.x-26A5E4?logo=telegram&logoColor=white)](https://telegraf.js.org/)
[![Zod](https://img.shields.io/badge/Zod-3.x-3E67B1)](https://zod.dev/)
[![License](https://img.shields.io/github/license/dorhaboosha/Work-Hours-Bot)](LICENSE)

</p>

Work Hours Bot is a Telegram bot that helps users track their daily work hours, manage work records, and generate weekly and monthly summaries.

It was built as a backend-focused project with an emphasis on clean architecture, maintainability, and scalable application design.

## Highlights

- 🤖 Telegram bot built with TypeScript, Node.js, and Telegraf
- 🏗️ Layered backend architecture
- 🗄️ PostgreSQL database with Prisma ORM
- 📊 Weekly and monthly work summaries
- ⚙️ Configurable work schedules and timezone support
- 🐳 Docker support for local development
- 🚀 Deployable on Render

## Features

- **Daily work tracking** — clock in with `/start`, check progress with `/status`, and close the day with `/end`
- **Record lookup** — use `/record dd-mm` to instantly view the details of any specific date (read-only)
- **Edit past dates** — use `/edit dd-mm` to fix hours or mark absences on any workday
- **Absence types** — sick, vacation, holiday, holiday eve, unpaid absence, and election (via the edit flow)
- **Summaries** — weekly and monthly balance views against your configured required hours
- **Settings** — one-time `/setup`, then `/settings` and `/settings_edit` for daily hours, workdays, and timezone

## Commands

| Command | Description |
|---|---|
| `/setup` | First-time setup: daily required hours, workdays, and timezone |
| `/settings` | Show your current work settings |
| `/settings_edit` | Change daily hours, workdays, or timezone |
| `/start` | Start today's workday |
| `/status` | Show today's active workday status |
| `/end` | End today's active workday |
| `/record dd-mm` | View the record for a specific date (e.g. `/record 12-06`) |
| `/edit dd-mm` | Edit or fix a specific date (e.g. `/edit 12-06`) |
| `/week` | Show current week summary |
| `/month` | Show current month summary |
| `/help` | List all available commands |

## Architecture

The application follows a layered architecture that separates presentation, business logic, and data access.

```text
          Telegram                    REST API
              │                           │
              ▼                           ▼
        Telegraf Bot              REST Controllers
              │                           │
              ▼                           │
    Conversation Flows                    │
              │                           │
              ▼                           │
    Telegram Handlers                     │
              │                           │
              └──────────┬────────────────┘
                         ▼
               Business Services
                         │
                   Repositories
                         │
                    Prisma ORM
                         │
                   PostgreSQL
```

Both the Telegram bot and the REST API share the same business service layer to keep the application modular and avoid duplicated logic.

## Tech Stack

| Category | Technology |
|------------|----------------|
| Language | TypeScript |
| Runtime | Node.js |
| Framework | Express |
| Bot Framework | Telegraf |
| Database | PostgreSQL |
| ORM | Prisma |
| Validation | Zod |
| Package Manager | npm Workspaces |
| Deployment | Render |
| Local Development | Docker |

## Project Structure

```
WorkHours-Bot/
├── backend/                 # Express API + Telegram bot
│   ├── prisma/              # Schema and migrations
│   └── src/
│       ├── bot/             # Handlers, conversation flows, session store
│       ├── constants/       # Time formats, timezones, edit actions, etc.
│       ├── controllers/     # REST API controllers
│       ├── lang/            # botLabels.json (English bot messages)
│       ├── middlewares/     # Express middleware (validation, error handling)
│       ├── repositories/    # Data access layer (Prisma)
│       ├── routes/          # Express route definitions
│       ├── services/        # Business logic layer
│       ├── utils/           # Shared helpers (dates, errors, API responses)
│       └── validators/      # Request validation (Zod)
├── shared/                  # Shared types and utilities
│   └── src/
│       ├── types/
│       └── utils/
├── docker-compose.yml       # Local PostgreSQL
└── package.json             # npm workspaces root
```

## Engineering Decisions

The project was designed with maintainability and extensibility in mind.

Key design decisions include:

- Layered architecture to separate presentation, business logic, and data access.
- Prisma ORM for type-safe database operations.
- PostgreSQL for reliable relational data storage.
- Zod for runtime validation of incoming requests.
- Shared workspace for reusable types and utilities.
- Configuration-driven bot messages using a centralized JSON labels file.

## Getting Started

Follow these steps from a fresh clone to a running local bot.

### Prerequisites

- Node.js 20+
- Docker + Docker Compose
- A Telegram bot token from [@BotFather](https://t.me/BotFather)

### 1. Clone and install

```bash
git clone https://github.com/dorhaboosha/Work-Hours-Bot.git
cd Work-Hours-Bot
npm install
```

This installs dependencies for both workspaces (`backend` and `shared`).

### 2. Start the database

```bash
docker compose up -d
```

PostgreSQL runs on port **5435** on the host (mapped from container port 5432). Credentials and database name match `docker-compose.yml`.

### 3. Configure environment

```bash
cp backend/.env.example backend/.env
```

On Windows (PowerShell): `Copy-Item backend\.env.example backend\.env`

Edit `backend/.env` and set at minimum:

| Variable | Local value |
|---|---|
| `DATABASE_URL` | `postgresql://workhours:workhours_password@localhost:5435/workhours_bot` |
| `TELEGRAM_BOT_TOKEN` | Your token from BotFather |
| `NODE_ENV` | `development` |

`PORT` defaults to `3000` if omitted. See `backend/.env.example` for production notes.

### 4. Run migrations

```bash
cd backend
npx prisma migrate dev
cd ..
```

This applies all migrations and generates the Prisma client. Accept the default migration name if prompted on first run.

### 5. Start the bot

From the **repository root** (not `backend/`):

```bash
npm run dev
```

You should see `Server running on port 3000 [development]`. In Telegram, send `/setup` to configure your account, then `/start` to begin tracking.

## Deployment (Render)

Production runs as a single Node process: Express (including `GET /health`) and the Telegram bot (long-polling) together. The deployment checklist in `openspec/changes/remove-multi-language-support/tasks.md` (section 9) captures the full Render setup; the summary below matches what is configured in production.

### Render services

1. **PostgreSQL** — provision a database in the same region as the web service. Use the **Internal Database URL** for the web service env var.
2. **Web Service** — connect the GitHub repo and use the commands below.

| Setting | Value |
|---|---|
| **Build Command** | `npm install --include=dev && npm run migrate:deploy -w backend && npm run build -w backend` |
| **Start Command** | `npm start -w backend` |

`--include=dev` is required because Render sets `NODE_ENV=production` during build, which otherwise skips TypeScript and other devDependencies needed to compile. Migrations run in the build step because Pre-Deploy commands are not available on the free tier.

The backend `build` script runs `prisma generate && tsc && tsc-alias`; `start` runs `node dist/backend/src/server.js`.

### Environment variables

Set these on the Render Web Service (see also `backend/.env.example` for local development):

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string. Use Render's **Internal** URL when the database and web service are in the same region. |
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from [@BotFather](https://t.me/BotFather). Mark as **Secret** in Render. |
| `NODE_ENV` | Yes | Set to `production`. |
| `PORT` | No | Injected automatically by Render. Do not set manually in production. |

Locally, copy `backend/.env.example` to `backend/.env` and fill in `DATABASE_URL` and `TELEGRAM_BOT_TOKEN`. `PORT` defaults to `3000` for local dev.

## Scripts

All commands run from the repository root unless noted. The backend lives in the `backend` workspace.

| Command | Description |
|---|---|
| `npm run dev` | Start the bot in development mode (hot reload via `ts-node-dev`) |
| `npm run build -w backend` | Generate Prisma client, compile TypeScript, and rewrite path aliases |
| `npm start -w backend` | Run the compiled production server (`dist/backend/src/server.js`) |
| `npm test -w backend` | Run backend unit tests (Node.js test runner) |

Additional backend scripts (run from `backend/` or with `-w backend`):

| Command | Description |
|---|---|
| `npm run migrate:deploy -w backend` | Apply pending Prisma migrations (production / Render) |

## Contributing

Issues and pull requests are welcome. For local development, follow [Getting Started](#getting-started). Run `npm test -w backend` before submitting changes.

## License

This project is licensed under the [MIT License](LICENSE).