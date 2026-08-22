# WorkHours Bot API (V1.1)

Base URL: `/api`  
Auth: Telegram-based user identification through `telegramId`

This API supports the backend operations used by the Telegram bot for tracking work hours, viewing specific records, editing records, managing absences, and viewing weekly/monthly summaries.

V1.1 uses English-only bot messages. The project may keep message labels in a JSON file, but the API does not support multi-language settings.

---

## 1. Conventions

### 1.1 Standard Response Envelope

Success:
```json
{
  "success": true,
  "data": {}
}
```

Error:
```json
{
  "success": false,
  "error": {
    "code": "SOME_CODE",
    "message": "Human readable message",
    "details": {}
  }
}
```

### 1.2 Common HTTP Status Codes

- **200** OK
- **201** Created
- **400** Validation error / bad input
- **404** Not found
- **409** Conflict / invalid current state
- **500** Internal server error

### 1.3 Common Error Codes

- `VALIDATION_ERROR`
- `USER_SETTINGS_NOT_FOUND`
- `SETUP_ALREADY_COMPLETED`
- `DAILY_RECORD_NOT_FOUND`
- `ACTIVE_RECORD_NOT_FOUND`
- `DAILY_RECORD_ALREADY_EXISTS`
- `PREVIOUS_RECORD_STILL_OPEN`
- `DAILY_RECORD_ALREADY_CLOSED`
- `INVALID_DATE_FORMAT`
- `INVALID_TIME_FORMAT`
- `INVALID_TIME_RANGE`
- `INVALID_RECORD_TYPE`
- `CONFLICT`
- `INTERNAL_ERROR`

---

## 1.4 Bot Labels Rule

V1.1 does not support multiple languages.

The bot should use English messages only.

The project can keep user-facing messages in a single JSON labels file, for example:

```txt
botLabels.json
```

This is used to avoid hardcoding message text across many files, but it is not multi-language support.

---

## 2. Data Models Reference

### 2.1 User Settings

```json
{
  "id": "usr_123",
  "telegramId": "123456789",
  "dailyRequiredMinutes": 528,
  "timezone": "Asia/Jerusalem",
  "workdays": [0, 1, 2, 3, 4],
  "createdAt": "2026-06-12T08:00:00.000Z",
  "updatedAt": "2026-06-12T08:00:00.000Z"
}
```

Field notes:
- `telegramId` is the Telegram user identifier.
- `dailyRequiredMinutes` stores the required daily work time in minutes.
- `528` minutes = `8h 48m`.
- `timezone` is used for local date calculations and user-facing times.
- `workdays` stores the configured workdays.
Recommended day mapping:
- `0` = Sunday
- `1` = Monday
- `2` = Tuesday
- `3` = Wednesday
- `4` = Thursday
- `5` = Friday
- `6` = Saturday

---

### 2.2 Daily Record

```json
{
  "id": "rec_123",
  "telegramId": "123456789",
  "workDate": "2026-06-12",
  "recordType": "WORK",
  "startTime": "2026-06-12T05:15:00.000Z",
  "expectedEndTime": "2026-06-12T14:03:00.000Z",
  "endTime": "2026-06-12T14:45:00.000Z",
  "workedMinutes": 570,
  "createdAt": "2026-06-12T05:15:00.000Z",
  "updatedAt": "2026-06-12T14:45:00.000Z"
}
```

Field notes:
- `workDate` is the local date according to the user's timezone.
- `recordType` defines whether the day is work, absence, holiday, etc.
- `startTime`, `expectedEndTime`, and `endTime` are stored as UTC timestamps.
- `endTime` is `null` while a `WORK` record is still active/open.
- `workedMinutes` is `null` while a `WORK` record is still active/open.
- V1.1 does not include a `note` field. Notes can be considered as a future feature.

---

### 2.3 Record Types

Supported `recordType` values:

```txt
WORK
SICK
VACATION
HOLIDAY
HOLIDAY_EVE
UNPAID_ABSENCE
ELECTION
```

| Record Type | Meaning | Counted Worked Minutes |
|---|---|---:|
| `WORK` | Regular workday | Actual worked minutes |
| `SICK` | Sick day | Full required day |
| `VACATION` | Vacation day | Full required day |
| `HOLIDAY` | Holiday / paid day off | Full required day |
| `HOLIDAY_EVE` | Holiday evening / shortened paid day | Half required day |
| `UNPAID_ABSENCE` | Unpaid absence | 0 minutes |
| `ELECTION` | Election day / paid day off | Full required day |

---

## 3. Endpoints

## 3.1 POST `/settings/setup`

Create user settings for first-time setup.

Used by the `/setup` bot command.

### Request Body

```json
{
  "telegramId": "123456789",
  "dailyRequiredMinutes": 528,
  "timezone": "Asia/Jerusalem",
  "workdays": [0, 1, 2, 3, 4]
}
```

### Validations

- `telegramId` is required.
- `dailyRequiredMinutes` is required and must be an integer greater than `0`.
- `timezone` is required and must be a non-empty string.
- `workdays` is required and must contain at least one day.
- Each workday must be a number between `0` and `6`.

### Important Rule

If settings already exist for the user, this endpoint should not overwrite them.

The response should be `409 SETUP_ALREADY_COMPLETED`.

The user should change settings through `/settings_edit`.

### 201 Created

```json
{
  "success": true,
  "data": {
    "id": "usr_123",
    "telegramId": "123456789",
    "dailyRequiredMinutes": 528,
    "timezone": "Asia/Jerusalem",
    "workdays": [0, 1, 2, 3, 4],
    "createdAt": "2026-06-12T08:00:00.000Z",
    "updatedAt": "2026-06-12T08:00:00.000Z"
  }
}
```

#### Errors

- 400 `VALIDATION_ERROR`
- 409 `SETUP_ALREADY_COMPLETED`
- 500 `INTERNAL_ERROR`

---

## 3.2 GET `/settings/:telegramId`

Get user work settings.

Used by the `/settings` bot command.

### 200 OK

```json
{
  "success": true,
  "data": {
    "id": "usr_123",
    "telegramId": "123456789",
    "dailyRequiredMinutes": 528,
    "timezone": "Asia/Jerusalem",
    "workdays": [0, 1, 2, 3, 4],
    "createdAt": "2026-06-12T08:00:00.000Z",
    "updatedAt": "2026-06-12T08:00:00.000Z"
  }
}
```

#### Errors

- 404 `USER_SETTINGS_NOT_FOUND`
- 500 `INTERNAL_ERROR`

---

## 3.3 PATCH `/settings/:telegramId`

Update existing user settings.

Used by the `/settings_edit` bot command.

### Request Body

All fields are optional, but at least one field must be provided.

```json
{
  "dailyRequiredMinutes": 528,
  "timezone": "Asia/Jerusalem",
  "workdays": [0, 1, 2, 3, 4]
}
```

### Validations

- `dailyRequiredMinutes`, if provided, must be an integer greater than `0`.
- `timezone`, if provided, must be a non-empty string.
- `workdays`, if provided, must contain at least one day.
- Each workday must be a number between `0` and `6`.

### 200 OK

```json
{
  "success": true,
  "data": {
    "id": "usr_123",
    "telegramId": "123456789",
    "dailyRequiredMinutes": 528,
    "timezone": "Asia/Jerusalem",
    "workdays": [0, 1, 2, 3, 4],
    "createdAt": "2026-06-12T08:00:00.000Z",
    "updatedAt": "2026-06-12T09:00:00.000Z"
  }
}
```

#### Errors

- 400 `VALIDATION_ERROR`
- 404 `USER_SETTINGS_NOT_FOUND`
- 500 `INTERNAL_ERROR`

---

## 3.4 POST `/workdays/start`

Start today's workday.

Used by the `/start` bot command.

### Request Body

```json
{
  "telegramId": "123456789"
}
```

### Behavior

The backend should:
1. Load the user's settings.
2. Calculate today's local date using the user's timezone.
3. Check if there is any open `WORK` record for the user.
4. If an old open record exists, block the new start.
5. Check if today's record already exists.
6. Create a new `WORK` daily record.
7. Calculate `expectedEndTime` using the user's `dailyRequiredMinutes`.

### Important Rule

There can be only one open workday at a time.

If the user has an unfinished workday from a previous date, the backend must not create a new record.

The response should be `409 PREVIOUS_RECORD_STILL_OPEN`, and the bot should tell the user to fix the previous workday using:

```txt
/edit dd-mm
```

Example:
```txt
/edit 12-06
```

### 201 Created

```json
{
  "success": true,
  "data": {
    "id": "rec_123",
    "telegramId": "123456789",
    "workDate": "2026-06-12",
    "recordType": "WORK",
    "startTime": "2026-06-12T05:15:00.000Z",
    "expectedEndTime": "2026-06-12T14:03:00.000Z",
    "endTime": null,
    "workedMinutes": null
  }
}
```

#### Errors

- 400 `VALIDATION_ERROR`
- 404 `USER_SETTINGS_NOT_FOUND`
- 409 `DAILY_RECORD_ALREADY_EXISTS`
- 409 `PREVIOUS_RECORD_STILL_OPEN`
- 500 `INTERNAL_ERROR`

---

## 3.5 GET `/workdays/status/:telegramId`

Get today's active workday status.

Used by the `/status` bot command.

### 200 OK

```json
{
  "success": true,
  "data": {
    "workDate": "2026-06-12",
    "startTime": "2026-06-12T05:15:00.000Z",
    "expectedEndTime": "2026-06-12T14:03:00.000Z",
    "workedMinutesSoFar": 435,
    "remainingMinutes": 93,
    "isActive": true
  }
}
```

Field notes:
- `workedMinutesSoFar` is calculated from `startTime` until the current time.
- `remainingMinutes` is calculated from required daily minutes minus worked minutes so far.
- If the user already worked more than required, `remainingMinutes` can be `0`.

### Important Rule

If there is an unfinished workday from a previous date, the backend should return `409 PREVIOUS_RECORD_STILL_OPEN`.

The bot should ask the user to fix the previous workday using:

```txt
/edit dd-mm
```

#### Errors

- 404 `USER_SETTINGS_NOT_FOUND`
- 404 `ACTIVE_RECORD_NOT_FOUND`
- 409 `PREVIOUS_RECORD_STILL_OPEN`
- 500 `INTERNAL_ERROR`

---

## 3.6 POST `/workdays/end`

End today's active workday.

Used by the `/end` bot command.

### Request Body

```json
{
  "telegramId": "123456789"
}
```

### Behavior

The backend should:
1. Load the user's settings.
2. Calculate today's local date using the user's timezone.
3. Find today's open `WORK` record.
4. Close the record using the current time.
5. Calculate `workedMinutes`.
6. Calculate `balanceMinutes`.
7. Return daily summary data.

### Important Rule

V1.1 does not support `/end HH:mm`.

Previous or old dates must be fixed using:

```txt
/edit dd-mm
```

### 200 OK

```json
{
  "success": true,
  "data": {
    "id": "rec_123",
    "telegramId": "123456789",
    "workDate": "2026-06-12",
    "recordType": "WORK",
    "startTime": "2026-06-12T05:15:00.000Z",
    "expectedEndTime": "2026-06-12T14:03:00.000Z",
    "endTime": "2026-06-12T14:45:00.000Z",
    "workedMinutes": 570,
    "requiredMinutes": 528,
    "balanceMinutes": 42
  }
}
```

#### Errors

- 400 `VALIDATION_ERROR`
- 404 `USER_SETTINGS_NOT_FOUND`
- 404 `ACTIVE_RECORD_NOT_FOUND`
- 409 `DAILY_RECORD_ALREADY_CLOSED`
- 500 `INTERNAL_ERROR`

---


## 3.7 GET `/workdays/record/:telegramId/:date`

Get a specific daily record by date.

Used by the `/record dd-mm` bot command.

The `date` parameter should be in `dd-mm` format.

Example:
```txt
GET /workdays/record/123456789/12-06
```

### Behavior

The backend should:
1. Load the user's settings.
2. Resolve `dd-mm` to a full date using the current year in the user's timezone.
3. Look for a daily record for that date.
4. Return the record details if a record exists.
5. Return a clear `NO_RECORD` state if no record exists.

This endpoint is read-only. It must not create, update, or delete records.

### Possible Record States

- `COMPLETED_WORK_RECORD`
- `OPEN_WORK_RECORD`
- `ABSENCE_RECORD`
- `NO_RECORD`

### 200 OK — Completed Work Record

```json
{
  "success": true,
  "data": {
    "workDate": "2026-06-12",
    "displayDate": "12-06",
    "state": "COMPLETED_WORK_RECORD",
    "record": {
      "id": "rec_123",
      "telegramId": "123456789",
      "recordType": "WORK",
      "startTime": "2026-06-12T05:15:00.000Z",
      "expectedEndTime": "2026-06-12T14:03:00.000Z",
      "endTime": "2026-06-12T14:30:00.000Z",
      "workedMinutes": 555
    }
  }
}
```

### 200 OK — Open Work Record

```json
{
  "success": true,
  "data": {
    "workDate": "2026-06-12",
    "displayDate": "12-06",
    "state": "OPEN_WORK_RECORD",
    "record": {
      "id": "rec_123",
      "telegramId": "123456789",
      "recordType": "WORK",
      "startTime": "2026-06-12T05:15:00.000Z",
      "expectedEndTime": "2026-06-12T14:03:00.000Z",
      "endTime": null,
      "workedMinutes": null
    }
  }
}
```

Bot display rule:
- Show the start time.
- Show the end time as `Not set`.
- Show the status as `Open`.

### 200 OK — Absence Record

```json
{
  "success": true,
  "data": {
    "workDate": "2026-06-12",
    "displayDate": "12-06",
    "state": "ABSENCE_RECORD",
    "record": {
      "id": "rec_124",
      "telegramId": "123456789",
      "recordType": "VACATION",
      "startTime": null,
      "expectedEndTime": null,
      "endTime": null,
      "workedMinutes": 528
    }
  }
}
```

Bot display rule:
- Show that the date is marked as absence.
- Show the absence reason based on `recordType`.

### 200 OK — No Record

```json
{
  "success": true,
  "data": {
    "workDate": "2026-06-12",
    "displayDate": "12-06",
    "state": "NO_RECORD",
    "record": null
  }
}
```

Bot display rule:
- Show a clear message that no record exists for the requested date.

### Validations

- `telegramId` is required.
- `date` must be in `dd-mm` format.
- The resolved date uses the current year in the user's configured timezone.

#### Errors

- 400 `INVALID_DATE_FORMAT`
- 404 `USER_SETTINGS_NOT_FOUND`
- 500 `INTERNAL_ERROR`

---

## 3.8 GET `/workdays/edit/:telegramId/:date`

Get edit options for a specific date.

Used by the `/edit dd-mm` bot command.

The `date` parameter should be in `dd-mm` format.

Example:
```txt
GET /workdays/edit/123456789/12-06
```

### Behavior

The backend should:
1. Load the user's settings.
2. Resolve `dd-mm` to a full date using the current year in the user's timezone.
3. Look for a daily record for that date.
4. Return the record state and the allowed edit options.

### Possible Record States

- `OPEN_WORK_RECORD`
- `NO_RECORD`
- `CLOSED_WORK_RECORD`
- `ABSENCE_RECORD`

### 200 OK — Open Work Record

```json
{
  "success": true,
  "data": {
    "workDate": "2026-06-12",
    "displayDate": "12-06",
    "state": "OPEN_WORK_RECORD",
    "record": {
      "id": "rec_123",
      "recordType": "WORK",
      "startTime": "2026-06-12T05:15:00.000Z",
      "expectedEndTime": "2026-06-12T14:03:00.000Z",
      "endTime": null,
      "workedMinutes": null
    },
    "allowedActions": [
      "SET_END_HOUR",
      "SET_START_AND_END_HOURS",
      "MARK_ABSENCE",
      "CANCEL"
    ]
  }
}
```

### 200 OK — No Record

```json
{
  "success": true,
  "data": {
    "workDate": "2026-06-12",
    "displayDate": "12-06",
    "state": "NO_RECORD",
    "record": null,
    "allowedActions": [
      "SET_START_AND_END_HOURS",
      "MARK_ABSENCE"
    ]
  }
}
```

### 200 OK — Closed Work Record

```json
{
  "success": true,
  "data": {
    "workDate": "2026-06-12",
    "displayDate": "12-06",
    "state": "CLOSED_WORK_RECORD",
    "record": {
      "id": "rec_123",
      "recordType": "WORK",
      "startTime": "2026-06-12T05:15:00.000Z",
      "expectedEndTime": "2026-06-12T14:03:00.000Z",
      "endTime": "2026-06-12T14:45:00.000Z",
      "workedMinutes": 570
    },
    "allowedActions": [
      "SET_START_AND_END_HOURS",
      "MARK_ABSENCE",
      "CANCEL"
    ]
  }
}
```

### 200 OK — Absence Record

```json
{
  "success": true,
  "data": {
    "workDate": "2026-06-12",
    "displayDate": "12-06",
    "state": "ABSENCE_RECORD",
    "record": {
      "id": "rec_123",
      "recordType": "VACATION",
      "workedMinutes": 528
    },
    "allowedActions": [
      "SET_START_AND_END_HOURS",
      "MARK_ABSENCE",
      "CANCEL"
    ]
  }
}
```

#### Errors

- 400 `INVALID_DATE_FORMAT`
- 404 `USER_SETTINGS_NOT_FOUND`
- 500 `INTERNAL_ERROR`

---

## 3.9 PATCH `/workdays/edit/:telegramId/:date`

Edit a specific date.

Used after the user chooses an action in the `/edit dd-mm` flow.

The `date` parameter should be in `dd-mm` format.

Example:
```txt
PATCH /workdays/edit/123456789/12-06
```

### Request Body — Set Only End Hour

Used when the date has an open work record and the user only forgot to close it.

```json
{
  "action": "SET_END_HOUR",
  "endTime": "17:30"
}
```

Behavior:
- Uses the existing `startTime`.
- Applies `endTime` to the edited date.
- Validates that `endTime` is after the existing `startTime`.
- Calculates `workedMinutes`.
- Updates the record as `WORK`.

### Request Body — Set Start and End Hours

Used when:
- There is no record and the user worked.
- There is an open record and the user wants to replace the whole workday.
- There is a closed record and the user wants to update the hours.
- There is an absence record and the user wants to replace it with work hours.

```json
{
  "action": "SET_START_AND_END_HOURS",
  "startTime": "08:15",
  "endTime": "17:30"
}
```

Behavior:
- Applies `startTime` and `endTime` to the edited date.
- Validates that both times are valid `HH:mm` values.
- Validates that `endTime` is after `startTime`.
- Creates or updates the record as `WORK`.
- Calculates `expectedEndTime`.
- Calculates `workedMinutes`.

### Request Body — Mark Absence

Used when the user wants to mark the date as an absence or paid day off.

```json
{
  "action": "MARK_ABSENCE",
  "recordType": "VACATION"
}
```

Behavior:
- Creates or updates the record.
- Sets the selected `recordType`.
- Clears `startTime`, `expectedEndTime`, and `endTime`.
- Sets `workedMinutes` according to the absence credit rule.

### Supported Actions

```txt
SET_END_HOUR
SET_START_AND_END_HOURS
MARK_ABSENCE
```

### Supported Absence Record Types

```txt
SICK
VACATION
HOLIDAY
HOLIDAY_EVE
UNPAID_ABSENCE
ELECTION
```

### Validations

- `date` must be in `dd-mm` format.
- `action` is required.
- `action` must be supported.
- `SET_END_HOUR` requires `endTime`.
- `SET_END_HOUR` is allowed only when the date has an open `WORK` record.
- `SET_START_AND_END_HOURS` requires `startTime` and `endTime`.
- `startTime` and `endTime` must be valid `HH:mm` 24-hour time values.
- Valid time examples:
  - `08:15`
  - `17:30`
  - `23:59`
- Invalid time examples:
  - `25:00`
  - `45:00`
  - `99:99`
  - `17:70`
- `endTime` must be after `startTime`.
- `SET_END_HOUR` must reject an end time that is before or equal to the existing start time.
- The backend must never save a `WORK` record where `endTime <= startTime`.
- `MARK_ABSENCE` requires a supported absence `recordType`.
- `recordType` for `MARK_ABSENCE` cannot be `WORK`.

### Time Validation Examples

Invalid `SET_START_AND_END_HOURS` request:

```json
{
  "action": "SET_START_AND_END_HOURS",
  "startTime": "25:00",
  "endTime": "45:00"
}
```

Expected error:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_TIME_FORMAT",
    "message": "Invalid time format. Please use HH:mm."
  }
}
```

Invalid time range:

```json
{
  "action": "SET_START_AND_END_HOURS",
  "startTime": "17:00",
  "endTime": "09:00"
}
```

Expected error:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_TIME_RANGE",
    "message": "End time must be after start time."
  }
}
```

Invalid `SET_END_HOUR` for an open record:

```txt
Existing start time: 20:03
Entered end time: 17:30
```

Expected error:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_TIME_RANGE",
    "message": "End time must be after start time."
  }
}
```

### 200 OK — Work Record Updated

```json
{
  "success": true,
  "data": {
    "id": "rec_123",
    "telegramId": "123456789",
    "workDate": "2026-06-12",
    "recordType": "WORK",
    "startTime": "2026-06-12T05:15:00.000Z",
    "expectedEndTime": "2026-06-12T14:03:00.000Z",
    "endTime": "2026-06-12T14:30:00.000Z",
    "workedMinutes": 555,
    "requiredMinutes": 528,
    "balanceMinutes": 27
  }
}
```

### 200 OK — Absence Record Saved

```json
{
  "success": true,
  "data": {
    "id": "rec_124",
    "telegramId": "123456789",
    "workDate": "2026-06-12",
    "recordType": "VACATION",
    "startTime": null,
    "expectedEndTime": null,
    "endTime": null,
    "workedMinutes": 528,
    "requiredMinutes": 528,
    "balanceMinutes": 0
  }
}
```

#### Errors

- 400 `VALIDATION_ERROR`
- 400 `INVALID_DATE_FORMAT`
- 400 `INVALID_TIME_FORMAT`
- 400 `INVALID_TIME_RANGE`
- 400 `INVALID_RECORD_TYPE`
- 404 `USER_SETTINGS_NOT_FOUND`
- 404 `DAILY_RECORD_NOT_FOUND`
- 409 `CONFLICT`
- 500 `INTERNAL_ERROR`

---

## 3.10 GET `/summaries/week/:telegramId`

Get current week summary.

Used by the `/week` bot command.

### Behavior

The backend should:
1. Load the user's settings.
2. Determine the current week using the current date in the user's timezone.
3. Loop over the real dates in the week.
4. Count only dates that match the user's configured workdays.
5. Load daily records in that date range.
6. Count missing configured workdays as `0` worked minutes.
7. Credit absence records according to the absence credit rule.
8. If the current day has an active open record, calculate worked time so far.
9. If there is an open previous-day record, return `409 PREVIOUS_RECORD_STILL_OPEN`.
10. Return required minutes, worked minutes, and balance.

### 200 OK

```json
{
  "success": true,
  "data": {
    "period": "week",
    "startDate": "2026-06-14",
    "endDate": "2026-06-18",
    "workdaysCount": 5,
    "requiredMinutes": 2640,
    "workedMinutes": 2775,
    "balanceMinutes": 135
  }
}
```

#### Errors

- 404 `USER_SETTINGS_NOT_FOUND`
- 409 `PREVIOUS_RECORD_STILL_OPEN`
- 500 `INTERNAL_ERROR`

---

## 3.11 GET `/summaries/month/:telegramId`

Get current month summary.

Used by the `/month` bot command.

### Behavior

The backend should:
1. Load the user's settings.
2. Determine the current month using the current date in the user's timezone.
3. Loop over every real date in the month.
4. Count only dates that match the user's configured workdays.
5. Load daily records in that month.
6. Count missing configured workdays as `0` worked minutes.
7. Credit absence records according to the absence credit rule.
8. If the current day has an active open record, calculate worked time so far.
9. If there is an open previous-day record, return `409 PREVIOUS_RECORD_STILL_OPEN`.
10. Return required minutes, worked minutes, and balance.

### 200 OK

```json
{
  "success": true,
  "data": {
    "period": "month",
    "month": "2026-06",
    "workdaysCount": 22,
    "requiredMinutes": 11616,
    "workedMinutes": 10880,
    "balanceMinutes": -736
  }
}
```

#### Errors

- 404 `USER_SETTINGS_NOT_FOUND`
- 409 `PREVIOUS_RECORD_STILL_OPEN`
- 500 `INTERNAL_ERROR`

---

## 3.12 GET `/workdays/:telegramId`

List daily records for a user.

This endpoint is mainly useful for debugging, future dashboard support, and future reports.

### Query Parameters Optional

- `from` — start date in `YYYY-MM-DD` format
- `to` — end date in `YYYY-MM-DD` format

Example:
```txt
GET /workdays/123456789?from=2026-06-01&to=2026-06-30
```

### 200 OK

```json
{
  "success": true,
  "data": [
    {
      "id": "rec_123",
      "telegramId": "123456789",
      "workDate": "2026-06-12",
      "recordType": "WORK",
      "startTime": "2026-06-12T05:15:00.000Z",
      "expectedEndTime": "2026-06-12T14:03:00.000Z",
      "endTime": "2026-06-12T14:45:00.000Z",
      "workedMinutes": 570,
      "createdAt": "2026-06-12T05:15:00.000Z",
      "updatedAt": "2026-06-12T14:45:00.000Z"
    }
  ]
}
```

#### Errors

- 400 `VALIDATION_ERROR`
- 404 `USER_SETTINGS_NOT_FOUND`
- 500 `INTERNAL_ERROR`

---

## 4. Example Error Responses

### 4.1 Setup Already Completed 409

```json
{
  "success": false,
  "error": {
    "code": "SETUP_ALREADY_COMPLETED",
    "message": "Setup is already completed. Use /settings_edit to change your settings.",
    "details": {
      "telegramId": "123456789"
    }
  }
}
```

### 4.2 User Settings Not Found 404

```json
{
  "success": false,
  "error": {
    "code": "USER_SETTINGS_NOT_FOUND",
    "message": "User settings not found. Please run /setup first."
  }
}
```

### 4.3 Daily Record Already Exists 409

```json
{
  "success": false,
  "error": {
    "code": "DAILY_RECORD_ALREADY_EXISTS",
    "message": "You already have a record for today's date."
  }
}
```

### 4.4 Previous Record Still Open 409

```json
{
  "success": false,
  "error": {
    "code": "PREVIOUS_RECORD_STILL_OPEN",
    "message": "You have an unfinished previous workday. Please fix it before starting a new one.",
    "details": {
      "workDate": "2026-06-12",
      "displayDate": "12-06",
      "example": "/edit 12-06"
    }
  }
}
```

### 4.5 Active Record Not Found 404

```json
{
  "success": false,
  "error": {
    "code": "ACTIVE_RECORD_NOT_FOUND",
    "message": "No active workday found for today."
  }
}
```

### 4.6 Invalid Date Format 400

```json
{
  "success": false,
  "error": {
    "code": "INVALID_DATE_FORMAT",
    "message": "Invalid date format. Please use dd-mm.",
    "details": {
      "example": "/edit 12-06"
    }
  }
}
```

### 4.7 Invalid Time Format 400

```json
{
  "success": false,
  "error": {
    "code": "INVALID_TIME_FORMAT",
    "message": "Invalid time format. Please use HH:mm.",
    "details": {
      "example": "17:30"
    }
  }
}
```

### 4.8 Invalid Time Range 400

```json
{
  "success": false,
  "error": {
    "code": "INVALID_TIME_RANGE",
    "message": "End time must be after start time."
  }
}
```

### 4.9 Invalid Record Type 400

```json
{
  "success": false,
  "error": {
    "code": "INVALID_RECORD_TYPE",
    "message": "Unsupported record type."
  }
}
```

### 4.10 Internal Error 500

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Something went wrong. Please try again later."
  }
}
```

---

## 5. Telegram Bot Command Mapping

| Telegram Command | Backend Endpoint |
|---|---|
| `/setup` | `POST /settings/setup` |
| `/settings` | `GET /settings/:telegramId` |
| `/settings_edit` | `PATCH /settings/:telegramId` |
| `/start` | `POST /workdays/start` |
| `/status` | `GET /workdays/status/:telegramId` |
| `/end` | `POST /workdays/end` |
| `/record dd-mm` | `GET /workdays/record/:telegramId/:date` |
| `/edit dd-mm` | `GET /workdays/edit/:telegramId/:date` and `PATCH /workdays/edit/:telegramId/:date` |
| `/week` | `GET /summaries/week/:telegramId` |
| `/month` | `GET /summaries/month/:telegramId` |
| `/help` | Bot-only command, no required API endpoint |

### 5.1 Slash Command Rule

V1.1 supports Telegram slash commands only.

Supported examples:

```txt
/start
/end
/record 12-06
/edit 12-06
/week
/month
```

V1.1 should not support commands without `/`, such as:

```txt
start
end
record 12-06
week
month
```

Reason:
Keeping slash commands only avoids confusion between commands and normal conversation replies.

---

## 6. Appendix — Suggested Bot Messages

### 6.1 Setup Already Completed

```txt
You already completed setup.

Current settings:
Daily required hours: 08:48
Workdays: Sunday-Thursday
Timezone: Asia/Jerusalem
To change your settings, use:
/settings_edit
```

### 6.2 Settings View

```txt
Your current settings:

Daily required hours: 08:48
Workdays: Sunday-Thursday
Timezone: Asia/Jerusalem
```

### 6.3 Start Success

```txt
Workday started.

Start: 08:15
Expected end: 17:03
```

### 6.4 Start Blocked By Previous Open Workday

```txt
You have an unfinished workday from 12-06.

Please fix it first using:
/edit 12-06
```

### 6.5 Status Success

```txt
Today's Status

Start: 08:15
Worked: 07:15
Remaining: 01:33
Expected finish: 17:03
```

### 6.6 End Success

```txt
Workday completed.

Start: 08:15
End: 17:45
Worked: 09:30
Balance: +00:42
```

### 6.7 Edit Open Record

```txt
12-06 has an open workday.

What do you want to do?

1. Set end hour
2. Set start and end hours
3. Mark absence
4. Cancel
```

### 6.8 Edit No Record

```txt
No record found for 12-06.

What do you want to do?

1. Set start and end hours
2. Mark absence
```

### 6.9 Mark Absence

```txt
Choose absence type:

1. Sick day
2. Vacation day
3. Holiday
4. Holiday eve
5. Unpaid absence
6. Election day
```


### 6.10 Record Lookup — Completed Work Record

```txt
Record for 12-06

Start: 08:15
End: 17:30
Worked: 09:15
```

### 6.11 Record Lookup — Open Work Record

```txt
Record for 12-06

Start: 08:15
End: Not set
Status: Open
```

### 6.12 Record Lookup — Absence Record

```txt
Record for 12-06

Status: Vacation
```

### 6.13 Record Lookup — No Record

```txt
No record found for 12-06.
```

### 6.14 Week Summary

```txt
Week Summary

Workdays: 5
Required: 44:00
Worked: 46:15
Balance: +02:15
```

### 6.15 Month Summary

```txt
Month Summary

Workdays: 22
Required: 193:36
Worked: 181:20
Balance: -12:16
```

### 6.16 Setup Missing

```txt
User settings not found.
Please run /setup first.
```

### 6.17 No Active Workday

```txt
No active workday found for today.

If you want to fix another date, use:
/edit dd-mm
```
