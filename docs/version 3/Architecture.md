# WorkHours Bot — Architecture (V1.1)

This document describes the project structure, main responsibilities, backend layering, Docker setup, command flows, and development conventions for the **WorkHours Bot** V1.1.

V1.1 improves the MVP by adding:
- Guided setup with language selection
- Settings viewing and editing
- `/edit dd-mm` flow
- Absence record types
- Weekly/monthly summaries based on real calendar dates
- Removal of `/end HH:mm`

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

There is no frontend web application in V1.1.

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
│       ├── SettingsCommandHandler.ts
│       ├── SettingsEditCommandHandler.ts
│       ├── StartCommandHandler.ts
│       ├── StatusCommandHandler.ts
│       ├── EndCommandHandler.ts
│       ├── EditCommandHandler.ts
│       ├── WeekCommandHandler.ts
│       ├── MonthCommandHandler.ts
│       └── HelpCommandHandler.ts
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
│   ├── EditWorkdayService.ts
│   ├── SummaryService.ts
│   ├── TimeCalculationService.ts
│   └── LocalizationService.ts
│
├── repositories/
│   ├── UserSettingsRepository.ts
│   └── DailyRecordRepository.ts
│
├── validators/
│   ├── SettingsSchemas.ts
│   ├── WorkdaySchemas.ts
│   ├── EditWorkdaySchemas.ts
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
│   ├── FormatUtils.ts
│   ├── WorkdayUtils.ts
│   └── RecordTypeUtils.ts
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
- Manage multi-step command flows
- Call the relevant service or internal API logic
- Format and send Telegram responses
- Use the user's configured language for bot messages

Example commands:
- `/setup`
- `/settings`
- `/settings_edit`
- `/start`
- `/status`
- `/end`
- `/edit dd-mm`
- `/week`
- `/month`
- `/help`

The bot layer should not contain database queries directly.

The bot layer should not calculate work durations or summaries directly.

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

Example endpoints:

```txt
POST  /api/settings/setup
GET   /api/settings/:telegramId
PATCH /api/settings/:telegramId

POST  /api/workdays/start
GET   /api/workdays/status/:telegramId
POST  /api/workdays/end
GET   /api/workdays/edit/:telegramId/:date
PATCH /api/workdays/edit/:telegramId/:date

GET   /api/summaries/week/:telegramId
GET   /api/summaries/month/:telegramId
```

Even though V1.1 is Telegram-first, HTTP routes are useful because:
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
- Read request parameters, body, and query
- Call services
- Return standard API responses
- Keep HTTP-specific logic outside services

Controllers should be thin.

They should not contain:
- Time calculations
- Database logic
- Business rules
- Telegram-specific formatting

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
- Handle record type behavior
- Handle edit-day behavior
- Handle settings update behavior

Examples:
- Prevent starting two records for the same day
- Prevent having more than one open workday
- Prevent `/setup` from overwriting existing settings
- Calculate expected end time
- Calculate daily balance
- Calculate credited minutes for absence records
- Calculate weekly and monthly summaries using real calendar dates
- Resolve `/edit dd-mm` using the current year and user's timezone
- Decide which edit options are allowed for a date

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

Repositories should not contain:
- Telegram logic
- Message formatting
- Business rules
- Summary calculations

Repository examples:
- Find user settings by `telegramId`
- Create user settings
- Update user settings
- Find daily record by `telegramId` and `workDate`
- Find open daily record for a user
- Create daily record
- Update daily record
- List daily records in date range

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
- Validate settings edit input
- Validate edit-day input
- Validate date and time formats

Examples:
- `dailyRequiredMinutes` must be a positive integer
- `workdays` must contain valid day numbers
- `timezone` must be a non-empty string
- `language` must be `en` or `he`
- `/edit` date must use `dd-mm` format
- `startTime` and `endTime` must use `HH:mm` format
- `recordType` must be supported
- `endTime` must be after `startTime`

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
- Record type helpers
- Workday date range helpers

Examples:
- Convert minutes to `HH:mm`
- Format positive/negative balance
- Convert decimal hours to minutes
- Build standard success/error responses
- Convert `dd-mm` to full date using current year
- Check if a date is a configured workday
- Calculate credited minutes by record type
- Build current week range
- Build current month range

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
│   ├── EditWorkdayTypes.ts
│   └── ApiResponseTypes.ts
│
├── schemas/
│   ├── SettingsSchemas.ts
│   ├── WorkdaySchemas.ts
│   ├── EditWorkdaySchemas.ts
│   └── SummarySchemas.ts
│
└── utils/
    ├── TimeUtils.ts
    ├── DateUtils.ts
    ├── WorkdayUtils.ts
    └── RecordTypeUtils.ts
```

Goal:
- Keep request/response shapes consistent
- Avoid duplicated TypeScript types
- Make future frontend development easier

---

## 6. Database

V1.1 uses PostgreSQL.

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

V1.1 database changes compared to the MVP:
- `user_settings` includes `language`.
- `daily_records` includes `record_type`.
- `daily_records` does not include `note` in V1.1.
- Absence records use `record_type` and credited `worked_minutes`.

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

## 11.1 Setup Command Flow

```txt
User sends /setup
 ↓
Telegram Bot receives command
 ↓
SetupCommandHandler extracts telegramId
 ↓
SettingsService checks if settings already exist
 ↓
If settings exist, bot shows current settings and suggests /settings_edit
 ↓
If settings do not exist, bot starts setup flow
 ↓
Bot collects daily required hours, workdays, timezone, and language
 ↓
SettingsService creates user settings
 ↓
Bot confirms setup completion
```

Important rule:

```txt
/setup is first-time setup only.
If settings already exist, /setup must not overwrite existing settings.
```

---

## 11.2 Settings Command Flow

```txt
User sends /settings
 ↓
Telegram Bot receives command
 ↓
SettingsCommandHandler extracts telegramId
 ↓
SettingsService loads user settings
 ↓
Bot formats current settings
 ↓
User receives settings summary
```

---

## 11.3 Settings Edit Command Flow

```txt
User sends /settings_edit
 ↓
Telegram Bot receives command
 ↓
SettingsEditCommandHandler extracts telegramId
 ↓
SettingsService loads current settings
 ↓
Bot asks what the user wants to edit
 ↓
User chooses daily hours, workdays, timezone, or language
 ↓
Bot collects the new value
 ↓
SettingsService validates and updates settings
 ↓
Bot confirms the update
```

---

## 11.4 Start Command Flow

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
If previous open record exists, service blocks start and returns /edit dd-mm suggestion
 ↓
DailyRecordRepository checks today's record
 ↓
DailyRecordRepository creates WORK daily record
 ↓
WorkdayService returns start result
 ↓
Bot formats message
 ↓
User receives start confirmation
```

---

## 11.5 Status Command Flow

```txt
User sends /status
 ↓
Telegram Bot receives command
 ↓
StatusCommandHandler extracts telegramId
 ↓
WorkdayService.getTodayStatus(telegramId)
 ↓
Repository loads today's active daily record
 ↓
Service calculates worked and remaining minutes
 ↓
Bot formats status message
 ↓
User receives current status
```

---

## 11.6 End Command Flow

In V1.1, `/end` is only for today's active workday.

V1.1 does not support:

```txt
/end HH:mm
```

Previous or old dates must be fixed through:

```txt
/edit dd-mm
```

```txt
User sends /end
 ↓
Telegram Bot receives command
 ↓
EndCommandHandler extracts telegramId
 ↓
WorkdayService.endTodayWorkday(telegramId)
 ↓
Repository loads today's open WORK record
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

---

## 11.7 Edit Day Command Flow

The `/edit dd-mm` command is used to fix a specific date in the current year.

```txt
User sends /edit 12-06
 ↓
Telegram Bot receives command
 ↓
EditCommandHandler extracts telegramId and display date
 ↓
EditWorkdayService resolves 12-06 to full date using current year and user timezone
 ↓
DailyRecordRepository loads record for that date
 ↓
Service determines record state
 ↓
Service returns allowed actions
 ↓
Bot shows edit options
```

Record states:
- `OPEN_WORK_RECORD`
- `NO_RECORD`
- `CLOSED_WORK_RECORD`
- `ABSENCE_RECORD`

---

## 11.8 Edit Open Work Record Flow

Used when the date has a `WORK` record with `startTime` and no `endTime`.

```txt
User chooses Set end hour
 ↓
Bot asks for end time
 ↓
User sends 17:30
 ↓
EditWorkdayService applies 17:30 to the original work date
 ↓
Service calculates worked minutes and balance
 ↓
Repository updates the daily record
 ↓
Bot confirms update
```

Allowed actions:
- Set end hour
- Set start and end hours
- Mark absence
- Cancel

---

## 11.9 Edit No Record Flow

Used when the date has no record.

```txt
User sends /edit 12-06
 ↓
Service finds no record
 ↓
Bot shows options:
   1. Set start and end hours
   2. Mark absence
```

If the user chooses start and end hours:
```txt
Bot asks for start and end time
 ↓
User sends 08:15-17:30
 ↓
Service creates WORK daily record
 ↓
Service calculates worked minutes and balance
 ↓
Bot confirms saved work record
```

If the user chooses mark absence:
```txt
Bot asks for absence type
 ↓
User chooses absence type
 ↓
Service creates absence daily record
 ↓
Service sets credited worked minutes according to record type
 ↓
Bot confirms absence saved
```

---

## 11.10 Edit Closed Work Record Flow

Used when the date already has a closed `WORK` record.

Allowed actions:
- Update start and end hours
- Mark absence instead
- Cancel

```txt
User chooses Update start and end hours
 ↓
Bot asks for start and end time
 ↓
User sends 08:15-17:30
 ↓
Service replaces the work hours
 ↓
Service recalculates worked minutes and balance
 ↓
Repository updates the daily record
 ↓
Bot confirms update
```

---

## 11.11 Edit Absence Record Flow

Used when the date already has an absence record.

Allowed actions:
- Set start and end hours
- Change absence type
- Cancel

```txt
User chooses Change absence type
 ↓
Bot asks for absence type
 ↓
User chooses new absence type
 ↓
Service updates record type and credited worked minutes
 ↓
Repository updates the daily record
 ↓
Bot confirms update
```

---

## 11.12 Week Summary Command Flow

```txt
User sends /week
 ↓
Telegram Bot receives command
 ↓
WeekCommandHandler extracts telegramId
 ↓
SummaryService.getCurrentWeekSummary(telegramId)
 ↓
UserSettingsRepository loads settings
 ↓
Service calculates current week range using user timezone
 ↓
Service loops over real dates in the week
 ↓
Service counts only configured workdays
 ↓
Repository loads records in the week range
 ↓
Service applies missing day and absence credit rules
 ↓
Service calculates required minutes, worked minutes, and balance
 ↓
Bot formats weekly summary
 ↓
User receives weekly summary
```

---

## 11.13 Month Summary Command Flow

```txt
User sends /month
 ↓
Telegram Bot receives command
 ↓
MonthCommandHandler extracts telegramId
 ↓
SummaryService.getCurrentMonthSummary(telegramId)
 ↓
UserSettingsRepository loads settings
 ↓
Service calculates current month range using user timezone
 ↓
Service loops over every real date in the month
 ↓
Service counts only configured workdays
 ↓
Repository loads records in the month range
 ↓
Service applies missing day and absence credit rules
 ↓
Service calculates required minutes, worked minutes, and balance
 ↓
Bot formats monthly summary
 ↓
User receives monthly summary
```

---

## 12. Layering Rules

## 12.1 Bot Rules
- Bot handlers should not access Prisma directly.
- Bot handlers should call services.
- Bot handlers are responsible for Telegram-specific formatting.
- Bot handlers should keep messages short and user-friendly.
- Bot handlers should use the user's configured language.
- Bot handlers should manage multi-step command conversations.

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
- Services should decide if a date is open, missing, completed, or absence.
- Services should calculate credited worked minutes by record type.
- Services should calculate summaries by real calendar dates.
- Services should prevent more than one open workday.
- Services should prevent `/setup` from overwriting existing settings.

## 12.4 Repository Rules
- Repositories own database access.
- Repositories should not know about Telegram.
- Repositories should not format user-facing messages.
- Repositories should not calculate summaries.

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
@/services/EditWorkdayService
@/services/SummaryService
@/repositories/DailyRecordRepository
@/utils/FormatUtils
```

Shared examples:

```txt
@shared/types/DailyRecordTypes
@shared/types/EditWorkdayTypes
@shared/utils/TimeUtils
@shared/utils/RecordTypeUtils
```

Recommended aliases:
- Backend: `@/` → `backend/src`
- Shared: `@shared/` → `shared/src`

---

## 14. V1.1 Architecture Summary

The V1.1 architecture is still intentionally simple:

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

V1.1 keeps the project small enough for fast development, but improves the MVP with:
- Settings editing
- Language support
- Edit-day flow
- Absence records
- More accurate summaries
- Cleaner `/end` behavior

Future architecture can support:
- AI-assisted setup
- Natural language commands
- Automatic holiday detection
- Reminders
- Reports
- Web dashboard
- Multi-user manager view
