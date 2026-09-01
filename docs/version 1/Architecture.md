# WorkHours Bot — Architecture

This document describes the project structure, main responsibilities, backend layering, Docker setup, and development conventions for the **WorkHours Bot** MVP.

---

## 1. Monorepo Structure

```txt
root/
├── backend/                         # Node.js + Express + TypeScript backend
│   ├── prisma/                      # Prisma schema and migrations
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── src/
│   │   ├── bot/                     # Telegram bot setup and command handlers
│   │   ├── routes/                  # Express route definitions
│   │   ├── controllers/             # HTTP request/response layer
│   │   ├── services/                # Business logic
│   │   ├── repositories/            # Database access logic
│   │   ├── validators/              # Zod request validation schemas
│   │   ├── middlewares/             # Express middlewares
│   │   ├── utils/                   # Shared backend helpers
│   │   ├── config/                  # Environment/config loading
│   │   ├── app.ts                   # Express app setup
│   │   └── server.ts                # Server bootstrap
│   ├── .env
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
│
├── shared/                          # Shared TypeScript types, schemas, and helpers
│   └── src/
│       ├── types/
│       ├── schemas/
│       └── utils/
│
├── docs/                            # Project documentation
│   ├── Spec.md
│   ├── API.md
│   ├── Architecture.md
│   ├── DatabaseSchema.md
│   └── DataModels.md
│
├── docker-compose.yml               # Local PostgreSQL setup
├── .gitignore
├── package.json                     # Optional root workspace config
└── README.md
```

---

## 2. High-Level Architecture

```txt
User
 ↓
Telegram App
 ↓
Telegram Bot API
 ↓
WorkHours Bot Backend
 ↓
Services Layer
 ↓
Repositories Layer
 ↓
PostgreSQL Database running in Docker
```

The user interacts only with the Telegram bot.

The backend is responsible for:
- Receiving Telegram commands
- Running business logic
- Saving and reading data from PostgreSQL
- Returning formatted messages to the user

There is no frontend web application in the MVP.

---

## 3. Backend (`/backend/src`)

The backend uses:

- Node.js
- Express
- TypeScript
- Prisma ORM
- PostgreSQL
- Zod
- Telegram Bot API library

Suggested backend structure:

```txt
src/
├── bot/
│   ├── Bot.ts
│   ├── BotCommands.ts
│   └── handlers/
│       ├── SetupCommandHandler.ts
│       ├── StartCommandHandler.ts
│       ├── StatusCommandHandler.ts
│       ├── EndCommandHandler.ts
│       ├── WeekCommandHandler.ts
│       └── MonthCommandHandler.ts
│
├── routes/
│   ├── SettingsRoutes.ts
│   ├── WorkdayRoutes.ts
│   └── SummaryRoutes.ts
│
├── controllers/
│   ├── SettingsController.ts
│   ├── WorkdayController.ts
│   └── SummaryController.ts
│
├── services/
│   ├── SettingsService.ts
│   ├── WorkdayService.ts
│   ├── SummaryService.ts
│   └── TimeCalculationService.ts
│
├── repositories/
│   ├── UserSettingsRepository.ts
│   └── DailyRecordRepository.ts
│
├── validators/
│   ├── SettingsSchemas.ts
│   ├── WorkdaySchemas.ts
│   └── SummarySchemas.ts
│
├── middlewares/
│   ├── ErrorMiddleware.ts
│   └── ValidateMiddleware.ts
│
├── utils/
│   ├── ApiResponse.ts
│   ├── AppError.ts
│   ├── ErrorCodes.ts
│   ├── DateUtils.ts
│   └── FormatUtils.ts
│
├── config/
│   └── Env.ts
│
├── app.ts
└── server.ts
```

---

## 4. Backend Layer Responsibilities

## 4.1 Bot Layer

Location:

```txt
backend/src/bot/
```

Responsibilities:
- Initialize the Telegram bot
- Register bot commands
- Parse Telegram messages
- Extract `telegramId` from the Telegram user
- Call the relevant service or internal API logic
- Format and send Telegram responses

Example commands:
- `/setup`
- `/start`
- `/status`
- `/end`
- `/end HH:mm`
- `/week`
- `/month`

The bot layer should not contain database queries directly.

---

## 4.2 Routes Layer

Location:

```txt
backend/src/routes/
```

Responsibilities:
- Define HTTP endpoints
- Attach validation middleware
- Route requests to controllers

Example:

```txt
POST /api/workdays/start
GET  /api/workdays/status/:telegramId
POST /api/workdays/end
```

Even though the MVP is Telegram-first, HTTP routes are useful because:
- They make the business logic easier to test.
- They can support a future web dashboard.
- They create clear backend boundaries.

---

## 4.3 Controllers Layer

Location:

```txt
backend/src/controllers/
```

Responsibilities:
- Read request parameters/body/query
- Call services
- Return standard API responses
- Keep HTTP-specific logic outside services

Controllers should be thin.

They should not contain:
- Time calculations
- Database logic
- Business rules

---

## 4.4 Services Layer

Location:

```txt
backend/src/services/
```

Responsibilities:
- Own business logic
- Validate business rules
- Call repositories
- Calculate work durations, balances, and summaries
- Decide what happens in edge cases

Examples:
- Prevent starting two records for the same day
- Prevent starting a new workday while a previous day is still open
- Require manual end time when closing a previous unfinished workday
- Apply manual end time to the original work date, not to the current date
- Calculate expected end time
- Calculate daily balance
- Calculate weekly and monthly summaries

---

## 4.5 Repositories Layer

Location:

```txt
backend/src/repositories/
```

Responsibilities:
- Access PostgreSQL through Prisma
- Keep database queries in one place
- Return database models to services

Repositories should not contain Telegram logic or message formatting.

---

## 4.6 Validators Layer

Location:

```txt
backend/src/validators/
```

Responsibilities:
- Define Zod schemas
- Validate API input
- Validate setup input
- Validate query parameters

Examples:
- `dailyRequiredMinutes` must be a positive integer
- `workdays` must contain valid day numbers
- `timezone` must be a non-empty string
- `manualEndTime`, when provided, must use `HH:mm` format

---

## 4.7 Utils Layer

Location:

```txt
backend/src/utils/
```

Responsibilities:
- Reusable helper functions
- Formatting durations
- Formatting dates
- Error helpers
- API response helpers

Examples:
- Convert minutes to `HH:mm`
- Format positive/negative balance
- Convert decimal hours to minutes
- Build standard success/error responses

---

## 5. Shared (`/shared/src`)

The `shared` folder contains code that can be used by both backend and future frontend/dashboard.

Suggested structure:

```txt
shared/src/
├── types/
│   ├── UserSettingsTypes.ts
│   ├── DailyRecordTypes.ts
│   ├── SummaryTypes.ts
│   └── ApiResponseTypes.ts
│
├── schemas/
│   ├── SettingsSchemas.ts
│   ├── WorkdaySchemas.ts
│   └── SummarySchemas.ts
│
└── utils/
    ├── TimeUtils.ts
    └── WorkdayUtils.ts
```

Goal:
- Keep request/response shapes consistent
- Avoid duplicated TypeScript types
- Make future frontend development easier

---

## 6. Database

The MVP uses PostgreSQL.

Local development database setup:
- PostgreSQL runs inside Docker.
- Docker Compose is used to start and stop the database.
- The backend connects to PostgreSQL using `DATABASE_URL`.

Expected local database service:

```txt
PostgreSQL Docker container
Database name: workhours_bot
Port: 5432
```

The backend should not require PostgreSQL to be installed manually on the developer machine.

---

## 7. Docker

The project should include a root-level `docker-compose.yml`.

Suggested service:

```yaml
services:
  postgres:
    image: postgres:16
    container_name: workhours-bot-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: workhours
      POSTGRES_PASSWORD: workhours_password
      POSTGRES_DB: workhours_bot
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

The backend `.env` should contain:

```txt
DATABASE_URL="postgresql://workhours:workhours_password@localhost:5432/workhours_bot"
```

---

## 8. Prisma

Prisma is used as the ORM.

Prisma responsibilities:
- Define database models in `schema.prisma`
- Generate TypeScript-safe database client
- Manage migrations
- Improve developer experience when working with PostgreSQL

Expected Prisma location:

```txt
backend/prisma/schema.prisma
```

Common commands:

```txt
npx prisma migrate dev
npx prisma generate
npx prisma studio
```

---

## 9. Docs (`/docs`)

The `docs/` folder contains project documentation.

```txt
docs/
├── Spec.md              # Product requirements and decisions
├── API.md               # Backend API endpoints and examples
├── Architecture.md      # Project structure and architecture
├── DatabaseSchema.md    # PostgreSQL schema reference
└── DataModels.md        # TypeScript data models
```

Each file has a separate responsibility:
- `Spec.md` explains what the product should do.
- `API.md` explains how the backend API behaves.
- `Architecture.md` explains where code should live.
- `DatabaseSchema.md` explains database tables and fields.
- `DataModels.md` explains TypeScript models and contracts.

---

## 10. Environment Variables

Backend `.env`:

```txt
PORT=3000
DATABASE_URL="postgresql://workhours:workhours_password@localhost:5432/workhours_bot"
TELEGRAM_BOT_TOKEN="your-telegram-bot-token"
NODE_ENV="development"
```

Backend `.env.example`:

```txt
PORT=3000
DATABASE_URL=
TELEGRAM_BOT_TOKEN=
NODE_ENV=development
```

Rules:
- `.env` must not be committed to Git.
- `.env.example` should be committed.
- Secrets must always be loaded from environment variables.

---

## 11. Request / Command Flow

## 11.1 Start Command Flow

```txt
User sends /start
 ↓
Telegram Bot receives command
 ↓
StartCommandHandler extracts telegramId
 ↓
WorkdayService.startWorkday(telegramId)
 ↓
UserSettingsRepository loads settings
 ↓
DailyRecordRepository checks open records
 ↓
DailyRecordRepository creates daily record
 ↓
WorkdayService returns start result
 ↓
Bot formats message
 ↓
User receives start confirmation
```

---

## 11.2 Status Command Flow

```txt
User sends /status
 ↓
Telegram Bot receives command
 ↓
StatusCommandHandler extracts telegramId
 ↓
WorkdayService.getTodayStatus(telegramId)
 ↓
Repository loads active daily record
 ↓
Service calculates worked and remaining minutes
 ↓
Bot formats status message
 ↓
User receives current status
```

---

## 11.3 End Command Flow

The `/end` command has two supported flows:

- `/end` — closes today's active workday using the current time.
- `/end HH:mm` — closes a previous unfinished workday using a manual end time.

### 11.3.1 End Today's Active Workday

```txt
User sends /end
 ↓
Telegram Bot receives command
 ↓
EndCommandHandler extracts telegramId
 ↓
WorkdayService.endWorkday(telegramId)
 ↓
Repository loads active/open daily record
 ↓
Service checks that the open record belongs to today's local date
 ↓
Service closes the record using the current time
 ↓
Service calculates worked minutes and balance
 ↓
Repository updates the daily record
 ↓
Bot formats daily summary
 ↓
User receives completion message
```

### 11.3.2 End Previous Unfinished Workday

```txt
User sends /end 17:30
 ↓
Telegram Bot receives command
 ↓
EndCommandHandler extracts telegramId and manualEndTime
 ↓
WorkdayService.endWorkday(telegramId, manualEndTime)
 ↓
Repository loads active/open daily record
 ↓
Service checks that the open record belongs to a previous local date
 ↓
Service applies manualEndTime to the original workDate
 ↓
Service converts the final end timestamp to UTC
 ↓
Service calculates worked minutes and balance
 ↓
Repository updates the daily record
 ↓
Bot formats previous workday summary
 ↓
User receives completion message
```

Important rule:

```txt
If the open record is from a previous date, the service must not close it using the current date/time.
It must require manualEndTime and apply that time to the original workDate.
```

Example:

```txt
Open record date: 2026-06-12
User command date: 2026-06-13
User command: /end 17:30
Stored end time: 2026-06-12 17:30 in the user's timezone, converted to UTC
```

---

## 12. Layering Rules

## 12.1 Bot Rules
- Bot handlers should not access Prisma directly.
- Bot handlers should call services.
- Bot handlers are responsible for Telegram-specific formatting.
- Bot handlers should keep messages short and user-friendly.

## 12.2 Controller Rules
- Controllers should be thin.
- Controllers should call services.
- Controllers should not contain business logic.
- Controllers should return standard API envelopes.

## 12.3 Service Rules
- Services own business logic.
- Services can call repositories.
- Services can call shared utils.
- Services should throw typed application errors for invalid flows.
- Services should decide whether `/end` closes today's active workday or a previous unfinished workday.
- Services should require `manualEndTime` when closing a previous unfinished workday.

## 12.4 Repository Rules
- Repositories own database access.
- Repositories should not know about Telegram.
- Repositories should not format user-facing messages.

## 12.5 Shared Rules
- Shared types should not import backend-only code.
- Shared schemas should be reusable by backend and future frontend.
- Shared utilities should be pure functions where possible.

---

## 13. Path Aliases Recommended

To keep imports clean, use TypeScript path aliases.

Backend examples:

```txt
@/services/WorkdayService
@/repositories/DailyRecordRepository
@/utils/FormatUtils
```

Shared examples:

```txt
@shared/types/DailyRecordTypes
@shared/utils/TimeUtils
```

Recommended aliases:
- Backend: `@/` → `backend/src`
- Shared: `@shared/` → `shared/src`

---

## 14. MVP Architecture Summary

The MVP architecture is intentionally simple:

```txt
Telegram Bot
   ↓
Node.js + Express + TypeScript Backend
   ↓
Service Layer
   ↓
Prisma ORM
   ↓
PostgreSQL in Docker
```

This structure keeps the project small enough for fast development, but organized enough to support future features such as:
- Web dashboard
- Manual record editing
- Reminders
- Reports
- Multi-user manager view
