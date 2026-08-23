# WorkHours Bot — Specification (MVP)

## 1. Project Overview

### 1.1 Project Name
WorkHours Bot

### 1.2 One-line Description
A Telegram bot that helps users track work hours, manage daily work records, and view weekly/monthly work summaries.

### 1.3 Problem Statement
Tracking work hours manually can be uncomfortable, inaccurate, and easy to forget.

A user may forget:
- When they started working
- When they finished working
- How many hours they worked today
- Whether they completed the required weekly or monthly hours
- Whether they are missing hours or have extra hours

The goal of this project is to provide a simple Telegram-based assistant that allows the user to track work time in real time and receive clear summaries.

### 1.4 Target Users
- Primary user: an employee, freelancer, or student who wants to track personal work hours.
- MVP focus: a single Telegram user tracking their own work hours.
- Future users: multiple employees, managers, or teams that need work-hour reporting.

### 1.5 Goals (MVP)
- Allow the user to configure daily required work hours, workdays, and timezone.
- Allow the user to start a workday using a Telegram command.
- Allow the user to check current workday status.
- Allow the user to end a workday and receive a daily summary.
- Allow the user to close a previous unfinished workday with a manual end time.
- Allow the user to view weekly and monthly work summaries.
- Calculate required hours vs. worked hours.
- Store work records persistently in a database.
- Keep the MVP simple, command-based, and easy to use.

### 1.6 Non-Goals (MVP)
- Web dashboard
- Authentication/login outside Telegram
- Manager/admin mode
- Team management
- AI assistant / natural language processing
- WhatsApp integration
- Holiday calendar integration
- Full manual edit flow for old records
- Export to Excel/CSV
- Payroll calculation
- Complex reporting system

---

## 2. Functional Requirements (MVP)

## 2.1 Setup Flow

The user must be able to run:

```txt
/setup
```

The setup flow should configure the user's work settings.

### 2.1.1 Setup Fields
The setup must collect:
- Required daily work hours
- Workdays
- Timezone

### 2.1.2 Daily Work Hours
The user enters the required daily work hours.

Example:
```txt
8.8
```

The system should convert decimal hours into minutes.

Example:
```txt
8.8 hours = 8 hours and 48 minutes = 528 minutes
```

The daily work hours already include break time, so the system does not need a separate break feature in the MVP.

### 2.1.3 Workdays
The bot should support common workday options:
- Sunday-Thursday
- Monday-Friday
- Custom workdays

For the MVP, if the user does not choose custom workdays, the default workdays will be Sunday-Thursday.

This means:

```txt
Sunday, Monday, Tuesday, Wednesday, Thursday
```

### 2.1.4 Timezone
The bot should store the user's timezone.

For the MVP, the default timezone will be:

```txt
Asia/Jerusalem
```

This timezone will be used unless the user chooses another timezone during setup.

The timezone is important because the bot needs to know:
- What "today" means for the user
- How to calculate the local work date
- How to display times like `08:15` and `17:03`

The system should not rely on IP/location detection in the MVP.

---

## 2.2 Start Workday

The user must be able to run:

```txt
/start
```

### 2.2.1 Behavior
When the user starts a workday, the bot creates a daily work record.

The record should include:
- Date
- Start time
- Expected end time
- End time: empty at first
- Worked minutes: empty at first

### 2.2.2 Expected End Time
The expected end time is calculated as:

```txt
start time + required daily work minutes
```

Example:
```txt
Start: 08:15
Required: 8h 48m
Expected end: 17:03
```

### 2.2.3 Start Response Example
```txt
Workday started.

Start: 08:15
Expected end: 17:03
```

### 2.2.4 Validation Rules
If today's workday already exists and is active, the bot should not create another record.

Response example:
```txt
You already started today's workday at 08:15.
```

If there is an unfinished workday from a previous date, the bot must not allow starting a new workday.

Response example:
```txt
You have an unfinished workday from 2026-06-12.

Please close it first using:
/end 17:30
```

The previous unfinished workday must be closed before the user can start a new workday.

---

## 2.3 Workday Status

The user must be able to run:

```txt
/status
```

### 2.3.1 Behavior
The bot returns the current status of today's active workday.

The status should include:
- Start time
- Worked time so far
- Remaining time
- Expected finish time

### 2.3.2 Status Response Example
```txt
Today's Status

Start: 08:15
Worked: 07:15
Remaining: 01:33
Expected finish: 17:03
```

### 2.3.3 Validation Rules
If there is no active workday for today, return a clear message.

Response example:
```txt
No active workday found for today.
Use /start to begin.
```

If there is an unfinished workday from a previous date, return a message that asks the user to close that previous workday first.

Response example:
```txt
You have an unfinished workday from 2026-06-12.

Please close it using:
/end 17:30
```

---

## 2.4 End Workday

The user must be able to run:

```txt
/end
```

The user may also run:

```txt
/end HH:mm
```

Example:
```txt
/end 17:30
```

### 2.4.1 Behavior for Today's Active Workday
If today's workday is active, the user can run:

```txt
/end
```

The bot closes today's active workday using the current time.

The record should be updated with:
- End time
- Total worked minutes

### 2.4.2 Behavior for Previous Unfinished Workday
If the user has an unfinished workday from a previous date, the user must provide a manual end time:

```txt
/end HH:mm
```

Example:
```txt
/end 17:30
```

When closing a previous unfinished workday:
- The provided end time is applied to the original work date.
- The bot must not use the current date/time as the end time.
- The bot must not calculate worked time from the previous date until the current date.

Example:
- Open record date: `2026-06-12`
- User writes on `2026-06-13`: `/end 17:30`
- The bot closes the `2026-06-12` record with end time `2026-06-12 17:30`

### 2.4.3 Daily Summary Response Example
```txt
Workday completed.

Start: 08:15
End: 17:45
Worked: 09:30
Balance: +00:42
```

### 2.4.4 Previous Workday Close Response Example
```txt
Previous workday completed.

Date: 2026-06-12
Start: 08:15
End: 17:30
Worked: 09:15
Balance: +00:27
```

### 2.4.5 Balance Calculation
The daily balance is calculated as:

```txt
worked minutes - required daily work minutes
```

Example:
```txt
Worked: 570 minutes
Required: 528 minutes
Balance: +42 minutes
```

### 2.4.6 Validation Rules
If there is no active or unfinished workday, return a clear message.

Response example:
```txt
No active workday found.
Use /start first.
```

If today's workday is already closed, return a clear message.

Response example:
```txt
Today's workday is already closed.
```

If the user has a previous unfinished workday and runs `/end` without a time, return a clear message.

Response example:
```txt
You have an unfinished workday from 2026-06-12.

Please close it with a manual end time:
/end 17:30
```

If the user provides an invalid time format, return a clear message.

Response example:
```txt
Invalid end time format.

Please use:
/end HH:mm

Example:
/end 17:30
```

---

## 2.5 Weekly Summary

The user must be able to run:

```txt
/week
```

### 2.5.1 Behavior
The bot returns a summary of the current work week according to the user's configured workdays.

The summary should include:
- Number of configured workdays in the week
- Required hours
- Worked hours
- Balance

### 2.5.2 Weekly Summary Response Example
```txt
Week Summary

Required: 44:00
Worked: 46:15
Balance: +02:15
```

### 2.5.3 Missing Workdays Rule
For MVP, missing workdays count as 0 worked hours.

This means that if a configured workday has no record, it still counts toward required hours.

### 2.5.4 Open Workday in Summary Rule
If the current day has an active open record, the weekly summary can calculate the current day using worked time so far.

If there is an unfinished workday from a previous date, the bot should ask the user to close it first before showing a weekly summary.

---

## 2.6 Monthly Summary

The user must be able to run:

```txt
/month
```

### 2.6.1 Behavior
The bot returns a summary of the current month according to the user's configured workdays.

The summary should include:
- Number of configured workdays in the month
- Required hours
- Worked hours
- Balance

### 2.6.2 Monthly Summary Response Example
```txt
Month Summary

Workdays: 22
Required: 193:36
Worked: 181:20
Balance: -12:16
```

### 2.6.3 Missing Workdays Rule
For MVP, missing workdays count as 0 worked hours.

### 2.6.4 Open Workday in Summary Rule
If the current day has an active open record, the monthly summary can calculate the current day using worked time so far.

If there is an unfinished workday from a previous date, the bot should ask the user to close it first before showing a monthly summary.

---

## 3. Data Rules

### 3.1 Time Storage
The system should store timestamps in a consistent format.

Recommended:
- Store timestamps in UTC in the database.
- Convert times to the user's timezone when displaying messages.

### 3.2 Timezone Rule
Each user has a configured timezone.

For MVP:
```txt
Asia/Jerusalem
```

The default timezone is `Asia/Jerusalem` unless the user chooses another timezone during setup.

### 3.3 Work Duration Rule
Internally, all work duration calculations should be done in minutes.

This avoids mistakes caused by decimal-hour calculations.

Example:
```txt
8.8 hours = 528 minutes
```

### 3.4 Break Rule
Breaks are not tracked separately in the MVP.

The user's required daily work hours already include break time.

### 3.5 Duplicate Daily Record Rule
A user cannot have more than one work record for the same date.

### 3.6 Open Workday Rule
A user cannot start a new workday while they have an unfinished previous workday.

If the unfinished workday is from a previous date, the user must close it using:

```txt
/end HH:mm
```

The manual end time is applied to the original work date.

### 3.7 Missing Day Rule
A missing workday is treated as 0 worked minutes in weekly and monthly summaries.

### 3.8 Previous Workday Manual Close Rule
When closing a previous unfinished workday, the bot must not use the current date/time as the end time.

Example:
- Previous open date: `2026-06-12`
- User closes it on: `2026-06-13`
- User command: `/end 17:30`
- Stored end time: `2026-06-12 17:30` in the user's timezone, converted to UTC before saving

---

## 4. Bot Commands

## 4.1 MVP Commands

| Command | Description |
|---|---|
| `/setup` | Configure user settings |
| `/start` | Start today's workday |
| `/status` | Show current active workday status |
| `/end` | End today's active workday using the current time |
| `/end HH:mm` | Close a previous unfinished workday with a manual end time |
| `/week` | Show current week summary |
| `/month` | Show current month summary |

---

## 5. UI / UX Requirements

### 5.1 Telegram-First Experience
The system is used through Telegram bot commands.

There is no frontend web app in the MVP.

### 5.2 Message Style
Bot messages should be:
- Short
- Clear
- Friendly
- Easy to scan
- Focused on the next action the user can take

### 5.3 Error Messages
Error messages should explain:
- What happened
- Why the command cannot be completed
- What the user should do next

Example:
```txt
No active workday found.
Use /start first.
```

### 5.4 Time Format
Times should be displayed in a readable `HH:mm` format.

Examples:
```txt
08:15
17:03
```

Durations should be displayed in `HH:mm` format.

Examples:
```txt
09:30
+02:15
-01:20
```

### 5.5 Previous Workday UX
If the user has an unfinished previous workday, the bot should clearly explain that the user must close it with a manual end time.

Example:
```txt
You have an unfinished workday from 2026-06-12.

Please close it using:
/end 17:30

This will close 2026-06-12 with the end time 17:30.
```

---

## 6. Technical Decisions (MVP)

### 6.1 Bot Platform
- Telegram Bot API

Reason:
- Easier setup than WhatsApp
- No phone number required for the bot
- No Meta business setup required
- Good fit for a personal productivity bot

### 6.2 Backend
- Node.js
- Express
- TypeScript

Reason:
- Simple and fast MVP development
- TypeScript gives better type safety
- Express is lightweight and flexible
- No need to learn NestJS for this MVP

### 6.3 Database
- PostgreSQL

Reason:
- Reliable relational database
- Good fit for users, settings, and daily records
- Easy to query summaries by date ranges

Development setup:
- PostgreSQL will run inside Docker using Docker Compose.
- The backend will connect to PostgreSQL using a `DATABASE_URL` environment variable.
- PostgreSQL should not be installed manually on the local machine for the MVP.

### 6.4 ORM
- Prisma ORM

Reason:
- Clean TypeScript database access
- Strong typing
- Easier migrations and schema management
- Faster development than writing raw SQL for the MVP

### 6.5 Validation
- Zod

Reason:
- Clear validation schemas
- Works well with TypeScript
- Good for validating setup input and command payloads

### 6.6 Docker
- Docker
- Docker Compose

Reason:
- Keeps the local development environment consistent
- Makes PostgreSQL easy to run without installing it directly on the machine
- Makes onboarding and project setup easier
- Allows the project to define database configuration in code using `docker-compose.yml`

### 6.7 Project Structure
The project should include a `docs/` folder with:

```txt
docs/
├── Spec.md
├── API.md
├── Architecture.md
├── DatabaseSchema.md
└── DataModels.md
```

---

## 7. Success Criteria (MVP Done)

The MVP is considered complete when:

- The Telegram bot is created and connected to the backend.
- The bot responds to all MVP commands:
  - `/setup`
  - `/start`
  - `/status`
  - `/end`
  - `/end HH:mm`
  - `/week`
  - `/month`
- User settings are saved in the database.
- Daily work records are saved in the database.
- PostgreSQL runs successfully inside Docker using Docker Compose.
- The backend connects to PostgreSQL using `DATABASE_URL`.
- The user cannot create duplicate active records for the same day.
- The user cannot start a new day while a previous day is still open.
- The user can close a previous unfinished workday using `/end HH:mm`.
- Closing a previous unfinished workday applies the manual end time to the original work date.
- The bot does not calculate a previous unfinished workday until the current date/time.
- The bot calculates expected end time correctly.
- The bot calculates daily worked time correctly.
- The bot calculates weekly summary correctly.
- The bot calculates monthly summary correctly.
- Missing workdays are counted as 0 worked hours.
- All messages are clear and user-friendly.
- Sensitive values, such as Telegram token and database URL, are stored in environment variables.

---

## 8. Planned Post-MVP Features

- Full manual add record:
```txt
/add 2026-06-10 08:00 17:30
```

- Full manual edit record:
```txt
/edit 2026-06-10
```

- Delete/cancel a record
- Holiday support
- Sick day / vacation day support
- Daily start reminder
- End-of-day reminder
- Monthly carry-over
- Export monthly report to CSV or Excel
- Web dashboard
- Multi-user manager view
- Natural language commands
- Authentication for web dashboard
- Advanced reports and charts
