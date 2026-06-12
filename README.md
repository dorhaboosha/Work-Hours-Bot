# WorkHours Bot

A Telegram bot for tracking personal work hours. Start your day, check your status, end your day, and view weekly and monthly summaries — all from Telegram.

## Commands

| Command | Description |
|---|---|
| `/setup` | Configure daily required hours, workdays, and timezone |
| `/start` | Start today's workday |
| `/status` | Show current workday status |
| `/end` | End today's workday |
| `/end HH:mm` | Close a previous unfinished workday with a manual end time |
| `/week` | Show current week summary |
| `/month` | Show current month summary |

## Project Structure

```
root/
├── backend/          # Node.js + Express + TypeScript backend
│   ├── prisma/       # Prisma schema and migrations
│   └── src/          # Bot, routes, controllers, services, repositories
├── shared/           # Shared TypeScript types, schemas, and utilities
├── docs/             # Project documentation
└── docker-compose.yml
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

## Documentation

- [`docs/Spec.md`](docs/Spec.md) — Product requirements
- [`docs/API.md`](docs/API.md) — Backend API endpoints
- [`docs/Architecture.md`](docs/Architecture.md) — Project structure and layering
- [`docs/DatabaseSchema.md`](docs/DatabaseSchema.md) — PostgreSQL schema reference
- [`docs/DataModels.md`](docs/DataModels.md) — TypeScript data models
