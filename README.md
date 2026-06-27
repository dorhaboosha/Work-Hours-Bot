# WorkHours Bot

A Telegram bot for tracking personal work hours. Start your day, check your status, end your day, and view weekly and monthly summaries — all from Telegram.

## Features

- **Daily work tracking** — clock in with `/start`, check progress with `/status`, and close the day with `/end`
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
| `/edit dd-mm` | Edit or fix a specific date (e.g. `/edit 12-06`) |
| `/week` | Show current week summary |
| `/month` | Show current month summary |
| `/help` | List all available commands |

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Language | TypeScript |
| HTTP API | Express |
| Bot | Telegraf (Telegram long-polling) |
| Database | PostgreSQL |
| ORM | Prisma |
| Validation | Zod |
| Monorepo | npm workspaces (`backend` + `shared`) |

## Project Structure

```
WorkHours-Bot/
├── backend/                 # Express API + Telegram bot
│   ├── prisma/              # Schema and migrations
│   └── src/
│       ├── bot/             # Handlers, conversation flows, session store
│       ├── constants/       # Time formats, timezones, edit actions, etc.
│       ├── controllers/     # HTTP request handlers
│       ├── lang/            # botLabels.json (English bot messages)
│       ├── middlewares/
│       ├── repositories/    # Prisma data access
│       ├── routes/
│       ├── services/        # Business logic
│       ├── utils/
│       └── validators/      # Zod request schemas
├── shared/                  # Shared types and utilities
│   └── src/
│       ├── types/
│       └── utils/
├── docker-compose.yml       # Local PostgreSQL
└── package.json             # npm workspaces root
```

## Getting Started

### Prerequisites

- Node.js 20+
- Docker + Docker Compose
- A Telegram bot token (create one via [@BotFather](https://t.me/BotFather))

### 1. Start the database

```bash
docker compose up -d
```

### 2. Configure the backend

```bash
cp backend/.env.example backend/.env
# Fill in DATABASE_URL and TELEGRAM_BOT_TOKEN in backend/.env
```

### 3. Install dependencies

```bash
npm install
```

### 4. Run migrations and generate Prisma client

```bash
cd backend
npx prisma migrate dev
npx prisma generate
```

### 5. Start the bot

```bash
npm run dev
```
