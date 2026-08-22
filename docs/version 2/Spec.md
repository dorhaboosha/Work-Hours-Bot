# WorkHours Bot — Specification (V1.1)

## 1. Project Overview

### 1.1 Project Name
WorkHours Bot

### 1.2 Version
V1.1 — Improved MVP

### 1.3 One-line Description
A Telegram bot that helps users track work hours, manage daily work records, edit mistakes, mark absences, and view weekly/monthly work summaries.

### 1.4 Problem Statement
Tracking work hours manually can be uncomfortable, inaccurate, and easy to forget.

A user may forget:
- When they started working
- When they finished working
- To start a workday
- To close a workday
- To mark a sick day, vacation day, holiday, or absence
- How many hours they worked today
- Whether they completed the required weekly or monthly hours

The goal of V1.1 is to make the bot more realistic for daily usage by allowing users to configure settings, fix mistakes, mark absences, and calculate summaries based on real calendar dates.

### 1.5 Target Users
- Primary user: an employee, freelancer, or student who wants to track personal work hours.
- V1.1 focus: a single Telegram user tracking their own work hours.
- Future users: multiple employees, managers, or teams that need work-hour reporting.

### 1.6 Goals (V1.1)
- Allow the user to configure daily required work hours, workdays, timezone, and language.
- Allow the user to view and edit settings after setup.
- Allow the user to start today's workday.
- Allow the user to check today's workday status.
- Allow the user to end today's active workday.
- Allow the user to edit a specific date using `/edit dd-mm`.
- Allow the user to fix an open previous workday using `/edit dd-mm`.
- Allow the user to manually set start and end hours for a date.
- Allow the user to mark absences such as sick day, vacation, holiday, holiday eve, unpaid absence, and election day.
- Allow the user to view weekly and monthly summaries based on real calendar dates and configured workdays.
- Store work records persistently in a database.
- Keep V1.1 command-based, simple, and easy to use.

### 1.7 Non-Goals (V1.1)
- Web dashboard
- Authentication/login outside Telegram
- Manager/admin mode
- Team management
- AI assistant / natural language processing
- WhatsApp integration
- Automatic holiday calendar integration
- Payroll calculation
- Export to Excel/CSV
- Complex reporting system
- Natural language commands
- Automatic country-based setup

---

## 2. Functional Requirements (V1.1)

## 2.1 Setup Flow

The user must be able to run:

```txt
/setup
```

The `/setup` command is used for first-time setup.

After setup is completed, the user should use `/settings` to view settings and `/settings_edit` to change settings.

### 2.1.1 Setup Fields
The setup must collect:
- Required daily work hours
- Workdays
- Timezone
- Language

The bot should not silently assume fixed workdays or timezone.

The bot can suggest common options, but the user must choose or confirm them.

### 2.1.2 Setup Already Completed Rule

If the user already completed setup and runs:

```txt
/setup
```

again, the bot should not restart the setup flow automatically and should not overwrite the existing settings.

Instead, the bot should show a clear message and guide the user to use `/settings_edit`.

Response example:

```txt
You already completed setup.

Current settings:
Daily required hours: 08:48
Workdays: Sunday-Thursday
Timezone: Asia/Jerusalem
Language: English

To change your settings, use:
/settings_edit
```

This prevents the user from accidentally overwriting existing settings.

If the user wants to change settings, the official command is:

```txt
/settings_edit
```

---

## 2.2 Daily Work Hours Setup

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

The daily work hours already include break time, so the system does not need a separate break feature in V1.1.

---

## 2.3 Workdays Setup

The bot should ask the user to choose workdays.

Example:
```txt
Choose your workdays:

1. Sunday-Thursday
2. Monday-Friday
3. Custom
```

### 2.3.1 Predefined Workday Options

Option 1:
```txt
Sunday-Thursday
```

Stored as:
```txt
[0, 1, 2, 3, 4]
```

Option 2:
```txt
Monday-Friday
```

Stored as:
```txt
[1, 2, 3, 4, 5]
```

### 2.3.2 Custom Workdays

If the user chooses custom, the bot asks:

```txt
Enter your custom workdays.

Examples:
Sunday-Thursday
Monday-Friday
Sunday, Tuesday, Thursday
```

The system should convert workdays to numbers.

Mapping:
```txt
0 = Sunday
1 = Monday
2 = Tuesday
3 = Wednesday
4 = Thursday
5 = Friday
6 = Saturday
```

---

## 2.4 Timezone Setup

The bot should ask the user to choose a timezone.

Example:
```txt
Choose your timezone:

1. Asia/Jerusalem
2. Europe/London
3. Europe/Berlin
4. America/New_York
5. Custom
```

If the user chooses custom, the bot asks:

```txt
Enter your timezone in IANA format.

Example:
Asia/Jerusalem
```

The selected timezone is used for:
- Calculating today's local date
- Calculating work dates
- Displaying start and end times
- Weekly summaries
- Monthly summaries

The system should not rely on IP/location detection in V1.1.

---

## 2.5 Language Setup

Language must be part of the setup flow.

The bot should ask:

```txt
Choose your language:

1. English
2. Hebrew
```

The selected language is saved in user settings.

The bot may later use Telegram's language code as a suggestion, but the user must be able to choose manually.

Language can also be changed later through `/settings_edit`.

---

## 2.6 Settings Commands

## 2.6.1 View Settings

The user must be able to run:

```txt
/settings
```

The bot returns the current settings.

Example:
```txt
Your current settings:

Daily required hours: 08:48
Workdays: Sunday-Thursday
Timezone: Asia/Jerusalem
Language: English
```

## 2.6.2 Edit Settings

The user must be able to run:

```txt
/settings_edit
```

The bot asks what setting the user wants to edit.

Example:
```txt
What do you want to edit?

1. Daily required hours
2. Workdays
3. Timezone
4. Language
```

The user should not need to run `/setup` again after the initial setup.


---

## 2.7 Start Workday

The user must be able to run:

```txt
/start
```

### 2.7.1 Behavior
When the user starts a workday, the bot creates a daily work record for today's local date.

The record should include:
- Date
- Record type: `WORK`
- Start time
- Expected end time
- End time: empty at first
- Worked minutes: empty at first

### 2.7.2 Expected End Time
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

### 2.7.3 Start Response Example
```txt
Workday started.

Start: 08:15
Expected end: 17:03
```

### 2.7.4 Validation Rules
If today's workday already exists and is active, the bot should not create another record.

Response example:
```txt
You already started today's workday at 08:15.
```

If there is an unfinished workday from a previous date, the bot must not allow starting a new workday.

Response example:
```txt
You have an unfinished workday from 12-06.

Please fix it first using:
/edit 12-06
```

There can be only one open workday at a time.

---

## 2.8 Workday Status

The user must be able to run:

```txt
/status
```

### 2.8.1 Behavior
The bot returns the current status of today's active workday.

The status should include:
- Start time
- Worked time so far
- Remaining time
- Expected finish time

### 2.8.2 Status Response Example
```txt
Today's Status

Start: 08:15
Worked: 07:15
Remaining: 01:33
Expected finish: 17:03
```

### 2.8.3 Validation Rules
If there is no active workday for today, return a clear message.

Response example:
```txt
No active workday found for today.
Use /start to begin or /edit dd-mm to update another date.
```

If there is an unfinished workday from a previous date, return a message that asks the user to fix it first.

Response example:
```txt
You have an unfinished workday from 12-06.

Please fix it using:
/edit 12-06
```

---

## 2.9 End Workday

The user must be able to run:

```txt
/end
```

### 2.9.1 Behavior
The `/end` command is only used to close today's active workday.

The bot should:
1. Find today's active work record.
2. Set the end time to the current time.
3. Calculate total worked minutes.
4. Calculate daily balance.
5. Return a daily summary.

### 2.9.2 Daily Summary Response Example
```txt
Workday completed.

Start: 08:15
End: 17:45
Worked: 09:30
Balance: +00:42
```

### 2.9.3 Validation Rules
If there is no active workday for today, return:

```txt
No active workday found for today.

If you want to fix another date, use:
/edit dd-mm
```

V1.1 does not support:

```txt
/end HH:mm
```

Previous or old dates must be fixed using:

```txt
/edit dd-mm
```

---

## 2.10 Edit Day

The user must be able to edit a specific date using:

```txt
/edit dd-mm
```

Example:
```txt
/edit 12-06
```

The year is not required because the bot works with the current year.

Example:
```txt
/edit 12-06
```

means:
```txt
12-06-current-year
```

At the start of a new year, records are treated as a new yearly cycle.

---

## 2.11 Edit Day Flow

When the user runs:

```txt
/edit dd-mm
```

the bot first checks the state of that date.

There are three possible states:
1. The date has an open work record.
2. The date has no record.
3. The date has a closed/completed record or absence record.


---

## 2.11.1 If the Date Has an Open Work Record

This means the user started that day but forgot to close it.

Example:
```txt
/edit 12-06
```

If the record has `startTime` but no `endTime`, the bot should show:

```txt
12-06 has an open workday.

What do you want to do?

1. Set end hour
2. Set start and end hours
3. Mark absence
4. Cancel
```

### Option 1 — Set End Hour

Used when the user only forgot to close the day.

Example:
```txt
Enter end time:

Example:
17:30
```

The bot uses:
- the existing start time
- the entered end time
- the original work date

The entered end time belongs to the edited date, not to the current date.

### Option 2 — Set Start and End Hours

Used when the existing start time is wrong or the user wants to replace the whole work record.

Example:
```txt
Enter start and end time:

Example:
08:15-17:30
```

### Option 3 — Mark Absence

Used if the day should be treated as an absence instead of a work-hours record.

The bot should ask the user to choose an absence type.

### Option 4 — Cancel

Returns without changing anything.

---

## 2.11.2 If the Date Has No Record

This means the user may have forgotten to start the day, or the user was absent.

The bot should show:

```txt
No record found for 12-06.

What do you want to do?

1. Set start and end hours
2. Mark absence
```

### Option 1 — Set Start and End Hours

Used when the user worked but forgot to run `/start` and `/end`.

Example:
```txt
Enter start and end time:

Example:
08:15-17:30
```

The bot creates a new record:
- Record type: `WORK`
- Start time
- End time
- Worked minutes

### Option 2 — Mark Absence

Used when the user did not work that day.

The bot asks for the absence type.

---

## 2.11.3 If the Date Has a Closed Work Record

This means the date already has start and end hours.

The bot should show:

```txt
12-06 already has a completed work record.

What do you want to do?

1. Update start and end hours
2. Mark absence instead
3. Cancel
```

V1.1 does not include a delete option.

Reason:
If a workday record is deleted, the day becomes missing and will count as 0 worked minutes in summaries. This may confuse the user.

Instead, the user should:
- update the hours
- mark absence
- cancel

---

## 2.11.4 If the Date Has an Absence Record

This means the date is already marked as sick day, vacation, holiday, holiday eve, unpaid absence, or election day.

The bot should show:

```txt
12-06 is currently marked as Vacation.

What do you want to do?

1. Set start and end hours
2. Change absence type
3. Cancel
```

---

## 2.12 Absence Types

V1.1 should support the following record types:

```txt
WORK
SICK
VACATION
HOLIDAY
HOLIDAY_EVE
UNPAID_ABSENCE
ELECTION
```

### 2.12.1 Record Type Behavior

| Record Type | Meaning | Counted Worked Minutes |
|---|---|---:|
| `WORK` | Regular workday | Actual worked minutes |
| `SICK` | Sick day | Full required day |
| `VACATION` | Vacation day | Full required day |
| `HOLIDAY` | Holiday / paid day off | Full required day |
| `HOLIDAY_EVE` | Holiday evening / shortened paid day | Half required day |
| `UNPAID_ABSENCE` | Unpaid absence | 0 minutes |
| `ELECTION` | Election day / paid day off | Full required day |

Example with daily required time of 8h 48m:

| Record Type | Counted As |
|---|---:|
| `SICK` | 08:48 |
| `VACATION` | 08:48 |
| `HOLIDAY` | 08:48 |
| `HOLIDAY_EVE` | 04:24 |
| `UNPAID_ABSENCE` | 00:00 |
| `ELECTION` | 08:48 |

---

## 2.13 Mark Absence Flow

When the user chooses "Mark absence", the bot should ask:

```txt
Choose absence type:

1. Sick day
2. Vacation day
3. Holiday
4. Holiday eve
5. Unpaid absence
6. Election day
```

After selection, the bot saves the record with the correct record type.

Example:
```txt
Vacation day saved.

Date: 12-06
Counted as: 08:48
Balance: 00:00
```

Example for holiday eve:
```txt
Holiday eve saved.

Date: 12-06
Counted as: 04:24
Balance: -04:24
```

Example for unpaid absence:
```txt
Unpaid absence saved.

Date: 12-06
Counted as: 00:00
Balance: -08:48
```


---

## 2.14 Weekly Summary

The user must be able to run:

```txt
/week
```

The `/week` command returns the summary for the current week according to the user's configured workdays.

### 2.14.1 Weekly Summary Range

The week summary should be calculated according to:
- The current date in the user's timezone
- The user's configured workdays
- The real calendar dates in that week

Example:
If the user works Sunday-Thursday, then:
- If today is Thursday 18-06, `/week` summarizes Sunday to Thursday of that week.
- If today is Wednesday 17-06, `/week` still summarizes Sunday to Thursday of that week.
- If today is Monday 15-06, `/week` still summarizes Sunday to Thursday of that week.

The summary should not assume a fixed number of workdays without checking the real calendar dates.

### 2.14.2 Weekly Summary Behavior

The bot should:
1. Find the current week range.
2. Loop over the real dates in that week.
3. Count only dates that match the user's configured workdays.
4. Calculate required minutes based on the counted workdays.
5. Calculate worked/credited minutes based on records and absence types.
6. Return required hours, worked hours, and balance.

### 2.14.3 Weekly Summary Response Example

```txt
Week Summary

Workdays: 5
Required: 44:00
Worked: 46:15
Balance: +02:15
```

---

## 2.15 Monthly Summary

The user must be able to run:

```txt
/month
```

The `/month` command returns the summary for the current month.

### 2.15.1 Monthly Summary Range

The month summary should be calculated according to:
- The current month in the user's timezone
- The user's configured workdays
- The real calendar dates in the month

Example:
If the month starts on Wednesday and the user works Sunday-Thursday, the bot counts only the Sunday-Thursday dates that actually exist inside that month.

The bot should not assume a fixed monthly number of workdays.

### 2.15.2 Monthly Summary Behavior

The bot should:
1. Find the first day and last day of the current month.
2. Loop over every real date in the month.
3. Count only dates that match the user's configured workdays.
4. Calculate required minutes based on those dates.
5. Calculate worked/credited minutes based on records and absence types.
6. Return required hours, worked hours, and balance.

### 2.15.3 Monthly Summary Response Example

```txt
Month Summary

Workdays: 22
Required: 193:36
Worked: 181:20
Balance: -12:16
```

---

## 3. Data Rules

### 3.1 Time Storage
The system should store timestamps in a consistent format.

Recommended:
- Store timestamps in UTC in the database.
- Convert times to the user's timezone when displaying messages.

### 3.2 Timezone Rule
Each user has a configured timezone.

The timezone is selected during `/setup` and can be changed through `/settings_edit`.

### 3.3 Language Rule
Each user has a configured language.

Supported languages for V1.1:
- English
- Hebrew

The language is selected during `/setup` and can be changed through `/settings_edit`.

### 3.4 Work Duration Rule
Internally, all work duration calculations should be done in minutes.

This avoids mistakes caused by decimal-hour calculations.

Example:
```txt
8.8 hours = 528 minutes
```

### 3.5 Break Rule
Breaks are not tracked separately in V1.1.

The user's required daily work hours already include break time.

### 3.6 Duplicate Daily Record Rule
A user cannot have more than one work record for the same date.

### 3.7 One Open Workday Rule
A user cannot have more than one open workday.

A workday is open when:
- `recordType = WORK`
- `startTime` exists
- `endTime` is null

If the user has an open workday from a previous date, the user must fix it using:

```txt
/edit dd-mm
```

### 3.8 Missing Day Rule
A missing workday is treated as 0 worked minutes in weekly and monthly summaries.

This applies only to dates that are part of the user's configured workdays.

### 3.9 Absence Credit Rule
Absence records affect worked minutes in summaries.

| Record Type | Credited Minutes |
|---|---:|
| `SICK` | Full required day |
| `VACATION` | Full required day |
| `HOLIDAY` | Full required day |
| `HOLIDAY_EVE` | Half required day |
| `UNPAID_ABSENCE` | 0 |
| `ELECTION` | Full required day |


### 3.10 Summary Calculation Rule
For every date in the summary period:

1. Check if the date is one of the user's configured workdays.
2. If it is not a configured workday, ignore it.
3. If it is a configured workday:
   - If there is no record, count as 0 worked minutes.
   - If record type is `WORK`, use actual worked minutes.
   - If record type is `SICK`, count as full required day.
   - If record type is `VACATION`, count as full required day.
   - If record type is `HOLIDAY`, count as full required day.
   - If record type is `HOLIDAY_EVE`, count as half required day.
   - If record type is `UNPAID_ABSENCE`, count as 0 worked minutes.
   - If record type is `ELECTION`, count as full required day.
   - If there is an open current-day work record, use worked time so far.
   - If there is an open previous-day work record, ask the user to fix it with `/edit dd-mm`.

Required minutes:
```txt
number of configured workdays in period * dailyRequiredMinutes
```

Worked minutes:
```txt
sum of actual worked minutes + credited absence minutes
```

Balance:
```txt
worked minutes - required minutes
```

---

## 4. Bot Commands

## 4.1 V1.1 Commands

| Command | Description |
|---|---|
| `/setup` | First-time setup |
| `/settings` | Show current settings |
| `/settings_edit` | Edit daily hours, workdays, timezone, or language |
| `/start` | Start today's workday |
| `/status` | Show today's active workday status |
| `/end` | End today's active workday |
| `/edit dd-mm` | Edit/fix a specific date in the current year |
| `/week` | Show current week summary |
| `/month` | Show current month summary |
| `/help` | Show available commands |

### Removed From V1.1

```txt
/end HH:mm
```

Old or previous open dates must be fixed through:

```txt
/edit dd-mm
```

---

## 5. UI / UX Requirements

### 5.1 Telegram-First Experience
The system is used through Telegram bot commands.

There is no frontend web app in V1.1.

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
You have an unfinished workday from 12-06.

Please fix it first using:
/edit 12-06
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

### 5.5 Date Format
User-facing edit commands should use:

```txt
dd-mm
```

Example:
```txt
/edit 12-06
```

Internally, the system should resolve this date using the current year in the user's timezone.

---

## 6. Technical Decisions (V1.1)

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
- Simple and fast development
- TypeScript gives better type safety
- Express is lightweight and flexible
- No need to learn NestJS for this version

### 6.3 Database
- PostgreSQL

Reason:
- Reliable relational database
- Good fit for users, settings, and daily records
- Easy to query summaries by date ranges

Development setup:
- PostgreSQL will run inside Docker using Docker Compose.
- The backend will connect to PostgreSQL using a `DATABASE_URL` environment variable.
- PostgreSQL should not be installed manually on the local machine.

### 6.4 ORM
- Prisma ORM

Reason:
- Clean TypeScript database access
- Strong typing
- Easier migrations and schema management
- Faster development than writing raw SQL

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

## 7. Success Criteria (V1.1 Done)

V1.1 is considered complete when:

- The Telegram bot is created and connected to the backend.
- The bot responds to all V1.1 commands:
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
- `/setup` collects daily required hours, workdays, timezone, and language.
- If the user runs `/setup` after setup already exists, the bot does not overwrite settings and tells the user to use `/settings_edit`.
- `/settings` displays current user settings.
- `/settings_edit` allows changing daily hours, workdays, timezone, and language.
- The user cannot create duplicate records for the same date.
- The user cannot have more than one open workday.
- `/end` closes only today's active workday.
- `/end HH:mm` is not used in V1.1.
- `/edit dd-mm` allows fixing an open workday by setting only end hour.
- `/edit dd-mm` allows setting start and end hours.
- `/edit dd-mm` allows marking absences.
- V1.1 supports record types:
  - `WORK`
  - `SICK`
  - `VACATION`
  - `HOLIDAY`
  - `HOLIDAY_EVE`
  - `UNPAID_ABSENCE`
  - `ELECTION`
- Weekly summaries calculate real configured workdays in the current week.
- Monthly summaries calculate real configured workdays in the current month.
- Missing configured workdays are counted as 0 worked minutes.
- Absence types are credited correctly in summaries.
- All timestamps are stored in UTC.
- User-facing times are displayed in the user's configured timezone.
- Sensitive values, such as Telegram token and database URL, are stored in environment variables.

---

## 8. Planned Future Features

- AI-assisted setup
- Natural language commands
- Automatic country-based workday suggestions
- Automatic holiday calendar integration
- Delete record command with confirmation
- Daily start reminder
- End-of-day reminder
- Monthly carry-over
- Export monthly report to CSV or Excel
- Web dashboard
- Multi-user manager view
- Authentication for web dashboard
- Advanced reports and charts
