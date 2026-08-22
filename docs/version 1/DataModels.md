# WorkHours Bot Data Models (TypeScript) — MVP

This document defines the TypeScript models used by the **WorkHours Bot** backend and shared contracts.

The models describe:
- User work settings
- Daily work records
- Workday status
- Weekly/monthly summaries
- Request inputs
- API response envelopes
- Shared helper types

---

## 1. Core Types

### 1.1 Basic IDs

```ts
export type UserSettingsId = string;
export type DailyRecordId = string;
export type TelegramId = string;
export type ManualEndTime = string; // HH:mm format, example: "17:30"
```

---

### 1.2 Weekday

Weekdays are represented as numbers.

```ts
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
```

Mapping:

```ts
export const WEEKDAY_LABELS: Record<Weekday, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};
```

Examples:

```ts
export const SUNDAY_TO_THURSDAY: Weekday[] = [0, 1, 2, 3, 4];
export const MONDAY_TO_FRIDAY: Weekday[] = [1, 2, 3, 4, 5];
```

---

### 1.3 User Settings

```ts
export interface UserSettings {
  id: UserSettingsId;
  telegramId: TelegramId;
  dailyRequiredMinutes: number; // integer > 0, example: 528 = 8h 48m
  timezone: string;             // example: "Asia/Jerusalem"
  workdays: Weekday[];          // example: [0, 1, 2, 3, 4]
  createdAt: string;            // ISO datetime
  updatedAt: string;            // ISO datetime
}
```

Field notes:
- `telegramId` identifies the Telegram user.
- `dailyRequiredMinutes` stores required work duration in minutes.
- Decimal hours should not be stored directly.
- `timezone` is used for local date/time display.
- `workdays` controls which days count as required workdays.

---

### 1.4 Daily Record

```ts
export interface DailyRecord {
  id: DailyRecordId;
  telegramId: TelegramId;
  workDate: string;             // ISO date: YYYY-MM-DD, based on user's timezone
  startTime: string;            // ISO datetime, stored in UTC
  expectedEndTime: string;      // ISO datetime, stored in UTC
  endTime?: string | null;      // ISO datetime, null while active
  workedMinutes?: number | null;// integer >= 0, null while active
  createdAt: string;            // ISO datetime
  updatedAt: string;            // ISO datetime
}
```

Field notes:
- `workDate` is the local work date according to the user's configured timezone.
- `startTime`, `expectedEndTime`, and `endTime` are timestamps.
- A record is active/open when `endTime` is `null`.
- `workedMinutes` is calculated when the user runs `/end`.

---

## 2. Derived / View Models

These models are not necessarily stored directly in the database.  
They are calculated and returned by services.

---

### 2.1 Workday Status

Used by the `/status` command.

```ts
export interface WorkdayStatus {
  workDate: string;              // YYYY-MM-DD
  startTime: string;             // ISO datetime
  expectedEndTime: string;       // ISO datetime
  workedMinutesSoFar: number;    // integer >= 0
  remainingMinutes: number;      // integer >= 0
  isActive: boolean;
}
```

Example:

```ts
const status: WorkdayStatus = {
  workDate: "2026-06-12",
  startTime: "2026-06-12T05:15:00.000Z",
  expectedEndTime: "2026-06-12T14:03:00.000Z",
  workedMinutesSoFar: 435,
  remainingMinutes: 93,
  isActive: true,
};
```

---

### 2.2 End Workday Result

Used by the `/end` command.

```ts
export interface EndWorkdayResult {
  id: DailyRecordId;
  telegramId: TelegramId;
  workDate: string;
  startTime: string;
  expectedEndTime: string;
  endTime: string;
  workedMinutes: number;
  requiredMinutes: number;
  balanceMinutes: number; // workedMinutes - requiredMinutes
}
```

Example:

```ts
const result: EndWorkdayResult = {
  id: "rec_123",
  telegramId: "123456789",
  workDate: "2026-06-12",
  startTime: "2026-06-12T05:15:00.000Z",
  expectedEndTime: "2026-06-12T14:03:00.000Z",
  endTime: "2026-06-12T14:45:00.000Z",
  workedMinutes: 570,
  requiredMinutes: 528,
  balanceMinutes: 42,
};
```

---

### 2.3 Summary Period

```ts
export type SummaryPeriod = "week" | "month";
```

---

### 2.4 Work Summary

Used by the `/week` and `/month` commands.

```ts
export interface WorkSummary {
  period: SummaryPeriod;
  startDate?: string;        // YYYY-MM-DD, mainly for week summary
  endDate?: string;          // YYYY-MM-DD, mainly for week summary
  month?: string;            // YYYY-MM, mainly for month summary
  workdaysCount: number;
  requiredMinutes: number;
  workedMinutes: number;
  balanceMinutes: number;    // workedMinutes - requiredMinutes
}
```

Weekly example:

```ts
const weekSummary: WorkSummary = {
  period: "week",
  startDate: "2026-06-07",
  endDate: "2026-06-11",
  workdaysCount: 5,
  requiredMinutes: 2640,
  workedMinutes: 2775,
  balanceMinutes: 135,
};
```

Monthly example:

```ts
const monthSummary: WorkSummary = {
  period: "month",
  month: "2026-06",
  workdaysCount: 22,
  requiredMinutes: 11616,
  workedMinutes: 10880,
  balanceMinutes: -736,
};
```

---

## 3. Request Models

### 3.1 Setup User Settings

Used by:

```txt
POST /settings/setup
```

```ts
export interface SetupUserSettingsInput {
  telegramId: TelegramId;
  dailyRequiredMinutes: number; // integer > 0
  timezone: string;             // example: "Asia/Jerusalem"
  workdays: Weekday[];          // at least one day
}
```

Example:

```ts
const input: SetupUserSettingsInput = {
  telegramId: "123456789",
  dailyRequiredMinutes: 528,
  timezone: "Asia/Jerusalem",
  workdays: [0, 1, 2, 3, 4],
};
```

---

### 3.2 Start Workday

Used by:

```txt
POST /workdays/start
```

```ts
export interface StartWorkdayInput {
  telegramId: TelegramId;
}
```

---

### 3.3 End Workday

Used by:

```txt
POST /workdays/end
```

This model supports both `/end` and `/end HH:mm`.

```ts
export interface EndWorkdayInput {
  telegramId: TelegramId;
  manualEndTime?: ManualEndTime; // optional, HH:mm format, used for closing a previous unfinished workday
}
```

Examples:

Close today's active workday using the current time:

```ts
const todayInput: EndWorkdayInput = {
  telegramId: "123456789",
};
```

Close a previous unfinished workday with a manual end time:

```ts
const previousDayInput: EndWorkdayInput = {
  telegramId: "123456789",
  manualEndTime: "17:30",
};
```

Important rule:
- If the open record is from today's local date, `manualEndTime` is optional.
- If the open record is from a previous local date, `manualEndTime` is required.
- `manualEndTime` is applied to the original `workDate`, not to the current date.

---

### 3.4 Week Summary Query

Used by:

```txt
GET /summaries/week/:telegramId
```

```ts
export interface WeekSummaryQuery {
  date?: string; // optional reference date, YYYY-MM-DD
}
```

---

### 3.5 Month Summary Query

Used by:

```txt
GET /summaries/month/:telegramId
```

```ts
export interface MonthSummaryQuery {
  month?: string; // optional month, YYYY-MM
}
```

---

### 3.6 Daily Records Query

Used by:

```txt
GET /workdays/:telegramId
```

```ts
export interface DailyRecordsQuery {
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
}
```

---

## 4. API Response Envelope

All API responses should use the same response envelope.

### 4.1 Success Response

```ts
export interface ApiSuccess<T> {
  success: true;
  data: T;
}
```

### 4.2 Error Response

```ts
export interface ApiError {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}
```

### 4.3 API Response Union

```ts
export type ApiResponse<T> = ApiSuccess<T> | ApiError;
```

---

## 5. Error Codes

```ts
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "USER_SETTINGS_NOT_FOUND"
  | "DAILY_RECORD_NOT_FOUND"
  | "ACTIVE_RECORD_NOT_FOUND"
  | "DAILY_RECORD_ALREADY_EXISTS"
  | "PREVIOUS_RECORD_STILL_OPEN"
  | "MANUAL_END_TIME_REQUIRED"
  | "DAILY_RECORD_ALREADY_CLOSED"
  | "CONFLICT"
  | "INTERNAL_ERROR";
```

---

## 6. Bot Message Models

These models represent data prepared for Telegram response formatting.

The bot does not need to expose these through HTTP APIs, but they help keep bot formatting clean.

---

### 6.1 Start Message View Model

```ts
export interface StartMessageViewModel {
  startTimeText: string;       // example: "08:15"
  expectedEndTimeText: string; // example: "17:03"
}
```

---

### 6.2 Status Message View Model

```ts
export interface StatusMessageViewModel {
  startTimeText: string;          // example: "08:15"
  workedTimeText: string;         // example: "07:15"
  remainingTimeText: string;      // example: "01:33"
  expectedFinishTimeText: string; // example: "17:03"
}
```

---

### 6.3 End Message View Model

```ts
export interface EndMessageViewModel {
  startTimeText: string;   // example: "08:15"
  endTimeText: string;     // example: "17:45"
  workedTimeText: string;  // example: "09:30"
  balanceText: string;     // example: "+00:42"
}
```

---

### 6.4 Previous Workday End Message View Model

```ts
export interface PreviousWorkdayEndMessageViewModel {
  workDateText: string;    // example: "2026-06-12"
  startTimeText: string;   // example: "08:15"
  endTimeText: string;     // example: "17:30"
  workedTimeText: string;  // example: "09:15"
  balanceText: string;     // example: "+00:27"
}
```

---

### 6.5 Summary Message View Model

```ts
export interface SummaryMessageViewModel {
  title: "Week Summary" | "Month Summary";
  workdaysCount?: number;
  requiredText: string; // example: "44:00"
  workedText: string;   // example: "46:15"
  balanceText: string;  // example: "+02:15"
}
```

---

## 7. Shared Helpers

### 7.1 Convert Decimal Hours To Minutes

```ts
export function decimalHoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}
```

Example:

```ts
decimalHoursToMinutes(8.8); // 528
```

---

### 7.2 Format Minutes As Duration

```ts
export function formatMinutesAsDuration(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const absMinutes = Math.abs(minutes);

  const hours = Math.floor(absMinutes / 60);
  const mins = absMinutes % 60;

  return `${sign}${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}
```

Examples:

```ts
formatMinutesAsDuration(570);  // "09:30"
formatMinutesAsDuration(42);   // "00:42"
formatMinutesAsDuration(-80);  // "-01:20"
```

---

### 7.3 Format Balance

```ts
export function formatBalance(minutes: number): string {
  const formatted = formatMinutesAsDuration(minutes);

  if (minutes > 0) {
    return `+${formatted}`;
  }

  return formatted;
}
```

Examples:

```ts
formatBalance(42);   // "+00:42"
formatBalance(-80);  // "-01:20"
formatBalance(0);    // "00:00"
```

---

### 7.4 Is Workday

```ts
export function isWorkday(day: Weekday, workdays: Weekday[]): boolean {
  return workdays.includes(day);
}
```

---

## 8. Validation Notes

### 8.1 User Settings Validation

Rules:
- `telegramId` is required.
- `dailyRequiredMinutes` must be an integer greater than `0`.
- `timezone` is required and must not be empty.
- `workdays` must include at least one day.
- Each workday must be between `0` and `6`.

---

### 8.2 Daily Record Validation

Rules:
- `telegramId` is required.
- `workDate` must be a valid local date.
- `startTime` is required.
- `expectedEndTime` is required.
- `endTime` is optional while a record is active.
- `workedMinutes` is optional while a record is active.
- If `workedMinutes` exists, it must be an integer greater than or equal to `0`.

---

### 8.3 Manual End Time Validation

Rules:
- `manualEndTime` is optional for today's active workday.
- `manualEndTime` is required when closing a previous unfinished workday.
- `manualEndTime` must use `HH:mm` 24-hour format.
- The hour must be between `00` and `23`.
- The minute must be between `00` and `59`.
- When closing a previous unfinished workday, `manualEndTime` is applied to the original `workDate`, not to the current date.

---

## 9. Notes

- Durations are stored and calculated in minutes.
- Decimal hours should be converted to minutes before saving.
- Timestamps should be stored in UTC.
- User-facing times should be converted to the user's configured timezone.
- `workDate` should be calculated according to the user's timezone.
- A user cannot have more than one daily record for the same `workDate`.
- A record with `endTime = null` is considered active/open.
- If an active/open record belongs to a previous date, it must be closed with `manualEndTime`.
- `manualEndTime` is an input only; it is not stored as a separate database field.
- The final calculated `endTime` is stored in the daily record.
- Missing workdays are calculated during summaries and are not stored as rows.
- Breaks are not modeled separately in the MVP.
