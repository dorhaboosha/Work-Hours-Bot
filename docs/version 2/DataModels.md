# WorkHours Bot Data Models (TypeScript) — V1.1

This document defines the TypeScript models used by the **WorkHours Bot** backend and shared contracts.

The models describe:
- User work settings
- User language preference
- Daily work records
- Absence records
- Workday status
- Edit-day flows
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
```

V1.1 does not use `ManualEndTime`.

Previous or old dates are fixed through:

```txt
/edit dd-mm
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

### 1.3 Language Code

The user chooses the bot language during `/setup`.

```ts
export type LanguageCode = "en" | "he";
```

Mapping:

```ts
export const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  en: "English",
  he: "Hebrew",
};
```

---

### 1.4 Daily Record Type

A daily record can represent a workday or an absence/day-off type.

```ts
export type DailyRecordType =
  | "WORK"
  | "SICK"
  | "VACATION"
  | "HOLIDAY"
  | "HOLIDAY_EVE"
  | "UNPAID_ABSENCE"
  | "ELECTION";
```

Absence-only record types:

```ts
export type AbsenceRecordType =
  | "SICK"
  | "VACATION"
  | "HOLIDAY"
  | "HOLIDAY_EVE"
  | "UNPAID_ABSENCE"
  | "ELECTION";
```

Record type labels:

```ts
export const DAILY_RECORD_TYPE_LABELS: Record<DailyRecordType, string> = {
  WORK: "Work",
  SICK: "Sick day",
  VACATION: "Vacation day",
  HOLIDAY: "Holiday",
  HOLIDAY_EVE: "Holiday eve",
  UNPAID_ABSENCE: "Unpaid absence",
  ELECTION: "Election day",
};
```

---

### 1.5 User Settings

```ts
export interface UserSettings {
  id: UserSettingsId;
  telegramId: TelegramId;
  dailyRequiredMinutes: number; // integer > 0, example: 528 = 8h 48m
  timezone: string;             // example: "Asia/Jerusalem"
  workdays: Weekday[];          // example: [0, 1, 2, 3, 4]
  language: LanguageCode;       // example: "en"
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
- `language` controls the language of bot messages.

---

### 1.6 Daily Record

```ts
export interface DailyRecord {
  id: DailyRecordId;
  telegramId: TelegramId;
  workDate: string;                  // ISO date: YYYY-MM-DD, based on user's timezone
  recordType: DailyRecordType;
  startTime?: string | null;         // ISO datetime, stored in UTC, null for absence records
  expectedEndTime?: string | null;   // ISO datetime, stored in UTC, null for absence records
  endTime?: string | null;           // ISO datetime, null while active or for absence records
  workedMinutes?: number | null;     // integer >= 0, null only while WORK record is active
  createdAt: string;                 // ISO datetime
  updatedAt: string;                 // ISO datetime
}
```

Field notes:
- `workDate` is the local work date according to the user's configured timezone.
- `recordType` defines whether the day is work, sick day, vacation, holiday, etc.
- `startTime`, `expectedEndTime`, and `endTime` are timestamps stored in UTC.
- A `WORK` record is active/open when `endTime` is `null`.
- Absence records have `startTime`, `expectedEndTime`, and `endTime` as `null`.
- `workedMinutes` is actual worked minutes for `WORK`.
- `workedMinutes` is credited minutes for absence records.
- V1.1 does not include a `note` field.

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

In V1.1, `/end` closes only today's active workday.

```ts
export interface EndWorkdayResult {
  id: DailyRecordId;
  telegramId: TelegramId;
  workDate: string;
  recordType: "WORK";
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
  recordType: "WORK",
  startTime: "2026-06-12T05:15:00.000Z",
  expectedEndTime: "2026-06-12T14:03:00.000Z",
  endTime: "2026-06-12T14:45:00.000Z",
  workedMinutes: 570,
  requiredMinutes: 528,
  balanceMinutes: 42,
};
```

---

### 2.3 Edit Record State

Used by the `/edit dd-mm` command.

```ts
export type EditRecordState =
  | "OPEN_WORK_RECORD"
  | "NO_RECORD"
  | "CLOSED_WORK_RECORD"
  | "ABSENCE_RECORD";
```

---

### 2.4 Edit Action

```ts
export type EditAction =
  | "SET_END_HOUR"
  | "SET_START_AND_END_HOURS"
  | "MARK_ABSENCE"
  | "CANCEL";
```

---

### 2.5 Edit Day Options

Returned when the user runs `/edit dd-mm`.

```ts
export interface EditDayOptions {
  workDate: string;              // YYYY-MM-DD
  displayDate: string;           // dd-mm
  state: EditRecordState;
  record: DailyRecord | null;
  allowedActions: EditAction[];
}
```

Example for an open work record:

```ts
const options: EditDayOptions = {
  workDate: "2026-06-12",
  displayDate: "12-06",
  state: "OPEN_WORK_RECORD",
  record: {
    id: "rec_123",
    telegramId: "123456789",
    workDate: "2026-06-12",
    recordType: "WORK",
    startTime: "2026-06-12T05:15:00.000Z",
    expectedEndTime: "2026-06-12T14:03:00.000Z",
    endTime: null,
    workedMinutes: null,
    createdAt: "2026-06-12T05:15:00.000Z",
    updatedAt: "2026-06-12T05:15:00.000Z",
  },
  allowedActions: [
    "SET_END_HOUR",
    "SET_START_AND_END_HOURS",
    "MARK_ABSENCE",
    "CANCEL",
  ],
};
```

---

### 2.6 Edit Workday Result

Used after the user updates a date through `/edit dd-mm`.

```ts
export interface EditWorkdayResult {
  id: DailyRecordId;
  telegramId: TelegramId;
  workDate: string;
  displayDate: string;
  recordType: DailyRecordType;
  startTime?: string | null;
  expectedEndTime?: string | null;
  endTime?: string | null;
  workedMinutes: number;
  requiredMinutes: number;
  balanceMinutes: number;
}
```

Example for updated work record:

```ts
const workResult: EditWorkdayResult = {
  id: "rec_123",
  telegramId: "123456789",
  workDate: "2026-06-12",
  displayDate: "12-06",
  recordType: "WORK",
  startTime: "2026-06-12T05:15:00.000Z",
  expectedEndTime: "2026-06-12T14:03:00.000Z",
  endTime: "2026-06-12T14:30:00.000Z",
  workedMinutes: 555,
  requiredMinutes: 528,
  balanceMinutes: 27,
};
```

Example for absence record:

```ts
const absenceResult: EditWorkdayResult = {
  id: "rec_124",
  telegramId: "123456789",
  workDate: "2026-06-12",
  displayDate: "12-06",
  recordType: "VACATION",
  startTime: null,
  expectedEndTime: null,
  endTime: null,
  workedMinutes: 528,
  requiredMinutes: 528,
  balanceMinutes: 0,
};
```

---

### 2.7 Summary Period

```ts
export type SummaryPeriod = "week" | "month";
```

---

### 2.8 Work Summary

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
  startDate: "2026-06-14",
  endDate: "2026-06-18",
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
  language: LanguageCode;       // "en" or "he"
}
```

Example:

```ts
const input: SetupUserSettingsInput = {
  telegramId: "123456789",
  dailyRequiredMinutes: 528,
  timezone: "Asia/Jerusalem",
  workdays: [0, 1, 2, 3, 4],
  language: "en",
};
```

Important rule:
- If settings already exist, `/setup` must not overwrite them.
- The user should use `/settings_edit` to update settings.

---

### 3.2 Update User Settings

Used by:

```txt
PATCH /settings/:telegramId
```

```ts
export interface UpdateUserSettingsInput {
  dailyRequiredMinutes?: number;
  timezone?: string;
  workdays?: Weekday[];
  language?: LanguageCode;
}
```

At least one field must be provided.

Example:

```ts
const input: UpdateUserSettingsInput = {
  language: "he",
};
```

---

### 3.3 Start Workday

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

### 3.4 End Workday

Used by:

```txt
POST /workdays/end
```

In V1.1, this model supports only `/end`.

It does not support `/end HH:mm`.

```ts
export interface EndWorkdayInput {
  telegramId: TelegramId;
}
```

Example:

```ts
const input: EndWorkdayInput = {
  telegramId: "123456789",
};
```

Important rule:
- `/end` closes only today's active workday.
- Previous or old open dates are fixed through `/edit dd-mm`.

---

### 3.5 Edit Day Options Request

Used by:

```txt
GET /workdays/edit/:telegramId/:date
```

The `date` parameter should be in `dd-mm` format.

```ts
export interface EditDayParams {
  telegramId: TelegramId;
  date: string; // dd-mm
}
```

Example:

```ts
const params: EditDayParams = {
  telegramId: "123456789",
  date: "12-06",
};
```

---

### 3.6 Edit Workday Input

Used by:

```txt
PATCH /workdays/edit/:telegramId/:date
```

```ts
export type EditWorkdayInput =
  | SetEndHourInput
  | SetStartAndEndHoursInput
  | MarkAbsenceInput;
```

---

### 3.6.1 Set End Hour Input

Used when a date has an open `WORK` record and the user only forgot to close it.

```ts
export interface SetEndHourInput {
  action: "SET_END_HOUR";
  endTime: string; // HH:mm
}
```

Example:

```ts
const input: SetEndHourInput = {
  action: "SET_END_HOUR",
  endTime: "17:30",
};
```

Important rule:
- This action is allowed only when the date has an open `WORK` record.
- The end time belongs to the edited date, not the current date.

---

### 3.6.2 Set Start And End Hours Input

Used when:
- the user forgot to start and end a workday
- the user wants to replace wrong work hours
- the user wants to replace an absence with work hours

```ts
export interface SetStartAndEndHoursInput {
  action: "SET_START_AND_END_HOURS";
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
}
```

Example:

```ts
const input: SetStartAndEndHoursInput = {
  action: "SET_START_AND_END_HOURS",
  startTime: "08:15",
  endTime: "17:30",
};
```

---

### 3.6.3 Mark Absence Input

Used when the user wants to mark a date as an absence or paid day off.

```ts
export interface MarkAbsenceInput {
  action: "MARK_ABSENCE";
  recordType: AbsenceRecordType;
}
```

Example:

```ts
const input: MarkAbsenceInput = {
  action: "MARK_ABSENCE",
  recordType: "VACATION",
};
```

---

### 3.7 Week Summary Query

Used by:

```txt
GET /summaries/week/:telegramId
```

```ts
export interface WeekSummaryQuery {}
```

V1.1 returns the current week only.

The current week is calculated using:
- the current date in the user's timezone
- the user's configured workdays
- the real calendar dates in that week

---

### 3.8 Month Summary Query

Used by:

```txt
GET /summaries/month/:telegramId
```

```ts
export interface MonthSummaryQuery {}
```

V1.1 returns the current month only.

The current month is calculated using:
- the current date in the user's timezone
- the user's configured workdays
- the real calendar dates in that month

---

### 3.9 Daily Records Query

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
  | "SETUP_ALREADY_COMPLETED"
  | "DAILY_RECORD_NOT_FOUND"
  | "ACTIVE_RECORD_NOT_FOUND"
  | "DAILY_RECORD_ALREADY_EXISTS"
  | "PREVIOUS_RECORD_STILL_OPEN"
  | "DAILY_RECORD_ALREADY_CLOSED"
  | "INVALID_DATE_FORMAT"
  | "INVALID_TIME_FORMAT"
  | "INVALID_TIME_RANGE"
  | "INVALID_RECORD_TYPE"
  | "CONFLICT"
  | "INTERNAL_ERROR";
```

---

## 6. Bot Message Models

These models represent data prepared for Telegram response formatting.

The bot does not need to expose these through HTTP APIs, but they help keep bot formatting clean.

---

### 6.1 Settings Message View Model

```ts
export interface SettingsMessageViewModel {
  dailyRequiredText: string; // example: "08:48"
  workdaysText: string;      // example: "Sunday-Thursday"
  timezoneText: string;      // example: "Asia/Jerusalem"
  languageText: string;      // example: "English"
}
```

---

### 6.2 Start Message View Model

```ts
export interface StartMessageViewModel {
  startTimeText: string;       // example: "08:15"
  expectedEndTimeText: string; // example: "17:03"
}
```

---

### 6.3 Status Message View Model

```ts
export interface StatusMessageViewModel {
  startTimeText: string;          // example: "08:15"
  workedTimeText: string;         // example: "07:15"
  remainingTimeText: string;      // example: "01:33"
  expectedFinishTimeText: string; // example: "17:03"
}
```

---

### 6.4 End Message View Model

```ts
export interface EndMessageViewModel {
  startTimeText: string;   // example: "08:15"
  endTimeText: string;     // example: "17:45"
  workedTimeText: string;  // example: "09:30"
  balanceText: string;     // example: "+00:42"
}
```

---

### 6.5 Edit Day Options Message View Model

```ts
export interface EditDayOptionsMessageViewModel {
  displayDate: string;       // example: "12-06"
  state: EditRecordState;
  options: string[];
}
```

---

### 6.6 Edit Day Result Message View Model

```ts
export interface EditDayResultMessageViewModel {
  displayDate: string;       // example: "12-06"
  recordTypeText: string;    // example: "Vacation day"
  workedTimeText: string;    // example: "08:48"
  balanceText: string;       // example: "00:00"
}
```

---

### 6.7 Summary Message View Model

```ts
export interface SummaryMessageViewModel {
  title: "Week Summary" | "Month Summary";
  workdaysCount: number;
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

### 7.5 Is Absence Record Type

```ts
export function isAbsenceRecordType(recordType: DailyRecordType): recordType is AbsenceRecordType {
  return recordType !== "WORK";
}
```

---

### 7.6 Calculate Credited Minutes By Record Type

```ts
export function calculateCreditedMinutes(
  recordType: AbsenceRecordType,
  dailyRequiredMinutes: number
): number {
  switch (recordType) {
    case "SICK":
    case "VACATION":
    case "HOLIDAY":
    case "ELECTION":
      return dailyRequiredMinutes;

    case "HOLIDAY_EVE":
      return Math.floor(dailyRequiredMinutes / 2);

    case "UNPAID_ABSENCE":
      return 0;
  }
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
- `language` must be `en` or `he`.

---

### 8.2 Daily Record Validation

Rules:
- `telegramId` is required.
- `workDate` must be a valid local date.
- `recordType` is required.
- `recordType` must be one of the supported record types.
- If `recordType = WORK`, `startTime` is required.
- If `recordType = WORK` and the record is closed, `endTime` and `workedMinutes` are required.
- If `recordType` is an absence type, `startTime`, `expectedEndTime`, and `endTime` should be `null`.
- If `recordType` is an absence type, `workedMinutes` should be set according to the absence credit rule.
- If `workedMinutes` exists, it must be an integer greater than or equal to `0`.

---

### 8.3 Edit Date Validation

Rules:
- `/edit` date must use `dd-mm` format.
- The system resolves `dd-mm` using the current year in the user's timezone.
- The resolved date must be valid.
- Example valid date: `12-06`.
- Example invalid date: `31-02`.

---

### 8.4 Edit Time Validation

Rules:
- `startTime` and `endTime` must use `HH:mm` 24-hour format.
- The hour must be between `00` and `23`.
- The minute must be between `00` and `59`.
- `endTime` must be after `startTime`.

---

### 8.5 Edit Action Validation

Rules:
- `action` is required.
- `action` must be one of the supported edit actions.
- `SET_END_HOUR` requires `endTime`.
- `SET_END_HOUR` is allowed only when the date has an open `WORK` record.
- `SET_START_AND_END_HOURS` requires `startTime` and `endTime`.
- `MARK_ABSENCE` requires an absence `recordType`.
- `MARK_ABSENCE` cannot use `WORK`.

---

## 9. Notes

- Durations are stored and calculated in minutes.
- Decimal hours should be converted to minutes before saving.
- Timestamps should be stored in UTC.
- User-facing times should be converted to the user's configured timezone.
- `workDate` should be calculated according to the user's timezone.
- A user cannot have more than one daily record for the same `workDate`.
- A user cannot have more than one open workday.
- A `WORK` record with `endTime = null` is considered active/open.
- If an active/open record belongs to a previous date, it must be fixed with `/edit dd-mm`.
- V1.1 does not support `/end HH:mm`.
- V1.1 does not use `ManualEndTime`.
- V1.1 does not include a `note` field.
- Missing workdays are calculated during summaries and are not stored as rows.
- Breaks are not modeled separately in V1.1.
