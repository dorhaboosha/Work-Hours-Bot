# WorkHours Bot API (MVP)

Base URL: `/api`  
Auth: Telegram-based user identification through `telegramId`

This API supports the backend operations used by the Telegram bot for tracking work hours.

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
- `DAILY_RECORD_NOT_FOUND`
- `ACTIVE_RECORD_NOT_FOUND`
- `DAILY_RECORD_ALREADY_EXISTS`
- `PREVIOUS_RECORD_STILL_OPEN`
- `MANUAL_END_TIME_REQUIRED`
- `DAILY_RECORD_ALREADY_CLOSED`
- `CONFLICT`
- `INTERNAL_ERROR`

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
- `timezone` is used for displaying times correctly.
- `workdays` stores the configured workdays.
- Recommended day mapping:
  - `0` = Sunday
  - `1` = Monday
  - `2` = Tuesday
  - `3` = Wednesday
  - `4` = Thursday
  - `5` = Friday
  - `6` = Saturday

### 2.2 Daily Record

```json
{
  "id": "rec_123",
  "telegramId": "123456789",
  "workDate": "2026-06-12",
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
- `startTime`, `expectedEndTime`, and `endTime` are stored as UTC timestamps.
- `endTime` is `null` while the workday is still active.
- `workedMinutes` is `null` until the workday is ended.

---

## 3. Endpoints

## 3.1 POST `/settings/setup`

Create or update user work settings.

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
- `timezone` is required.
- `workdays` is required and must contain at least one day.
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
    "updatedAt": "2026-06-12T08:00:00.000Z"
  }
}
```

#### Errors

- 400 `VALIDATION_ERROR`
- 500 `INTERNAL_ERROR`

---

## 3.2 GET `/settings/:telegramId`

Get user work settings.

Used before running work-hour commands to know the user's daily required minutes, workdays, and timezone.

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

## 3.3 POST `/workdays/start`

Start a new workday.

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
2. Check if there is an unfinished previous workday.
3. Check if today's record already exists.
4. Create a new daily record.
5. Calculate `expectedEndTime` using the user's `dailyRequiredMinutes`.

### Important Rule

If the user has an unfinished workday from a previous date, the backend must not create a new record.

The response should be `409 PREVIOUS_RECORD_STILL_OPEN`, and the bot should tell the user to close the previous workday using:

```txt
/end HH:mm
```

Example:
```txt
/end 17:30
```

### 201 Created

```json
{
  "success": true,
  "data": {
    "id": "rec_123",
    "telegramId": "123456789",
    "workDate": "2026-06-12",
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

## 3.4 GET `/workdays/status/:telegramId`

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

The bot should ask the user to close the previous workday first using:

```txt
/end HH:mm
```

#### Errors

- 404 `USER_SETTINGS_NOT_FOUND`
- 404 `ACTIVE_RECORD_NOT_FOUND`
- 409 `PREVIOUS_RECORD_STILL_OPEN`
- 500 `INTERNAL_ERROR`

---

## 3.5 POST `/workdays/end`

End an active workday.

Used by:
- `/end`
- `/end HH:mm`

### Request Body — Close Today's Active Workday

Used when the user writes:

```txt
/end
```

```json
{
  "telegramId": "123456789"
}
```

### Request Body — Close Previous Unfinished Workday

Used when the user writes:

```txt
/end 17:30
```

```json
{
  "telegramId": "123456789",
  "manualEndTime": "17:30"
}
```

### Request Fields

| field | type | required | notes |
|---|---|---|---|
| `telegramId` | string | yes | Telegram user identifier |
| `manualEndTime` | string | no | Optional end time in `HH:mm` format. Required only when closing a previous unfinished workday. |

### Behavior

The backend should:
1. Load the user's settings.
2. Look for an active/open daily record for the user.
3. If the open record is from today's date and `manualEndTime` is not provided, close it using the current time.
4. If the open record is from a previous date, require `manualEndTime`.
5. If `manualEndTime` is provided for a previous open record, apply that time to the original `workDate`.
6. Calculate total `workedMinutes`.
7. Return daily summary data.

### Important Previous Workday Rule

When closing a previous unfinished workday:
- `manualEndTime` is applied to the original `workDate`.
- The backend must not use the current date/time as the end time.
- The backend must not calculate worked time from the previous date until the current date.

Example:
- Open record date: `2026-06-12`
- User command on `2026-06-13`: `/end 17:30`
- API body:
```json
{
  "telegramId": "123456789",
  "manualEndTime": "17:30"
}
```
- Stored end time: `2026-06-12 17:30` in the user's timezone, converted to UTC before saving.

### Validations

- `telegramId` is required.
- `manualEndTime`, if provided, must be in `HH:mm` 24-hour format.
- `manualEndTime` hour must be between `00` and `23`.
- `manualEndTime` minute must be between `00` and `59`.
- If the open record is from a previous date and `manualEndTime` is missing, return `MANUAL_END_TIME_REQUIRED`.

### 200 OK — Today's Workday Closed

```json
{
  "success": true,
  "data": {
    "id": "rec_123",
    "telegramId": "123456789",
    "workDate": "2026-06-12",
    "startTime": "2026-06-12T05:15:00.000Z",
    "expectedEndTime": "2026-06-12T14:03:00.000Z",
    "endTime": "2026-06-12T14:45:00.000Z",
    "workedMinutes": 570,
    "requiredMinutes": 528,
    "balanceMinutes": 42
  }
}
```

### 200 OK — Previous Workday Closed

```json
{
  "success": true,
  "data": {
    "id": "rec_122",
    "telegramId": "123456789",
    "workDate": "2026-06-12",
    "startTime": "2026-06-12T05:15:00.000Z",
    "expectedEndTime": "2026-06-12T14:03:00.000Z",
    "endTime": "2026-06-12T14:30:00.000Z",
    "workedMinutes": 555,
    "requiredMinutes": 528,
    "balanceMinutes": 27
  }
}
```

#### Errors

- 400 `VALIDATION_ERROR`
- 404 `USER_SETTINGS_NOT_FOUND`
- 404 `ACTIVE_RECORD_NOT_FOUND`
- 409 `MANUAL_END_TIME_REQUIRED`
- 409 `DAILY_RECORD_ALREADY_CLOSED`
- 500 `INTERNAL_ERROR`

---

## 3.6 GET `/summaries/week/:telegramId`

Get current week summary.

Used by the `/week` bot command.

### Query Parameters Optional

- `date` — ISO date used as the reference date for the week.  
  If not provided, the current date in the user's timezone is used.

Example:
```txt
GET /summaries/week/123456789?date=2026-06-12
```

### Behavior

The backend should:
1. Load the user's settings.
2. Check if there is an unfinished workday from a previous date.
3. Determine the current week according to the user's configured workdays.
4. Load all daily records in that date range.
5. Count missing configured workdays as `0` worked minutes.
6. If the current day has an active open record, calculate the current day using worked time so far.
7. Return required minutes, worked minutes, and balance.

### Important Rule

If there is an unfinished workday from a previous date, the backend should return `409 PREVIOUS_RECORD_STILL_OPEN`.

The user should close the previous workday first using:

```txt
/end HH:mm
```

### 200 OK

```json
{
  "success": true,
  "data": {
    "period": "week",
    "startDate": "2026-06-07",
    "endDate": "2026-06-11",
    "workdaysCount": 5,
    "requiredMinutes": 2640,
    "workedMinutes": 2775,
    "balanceMinutes": 135
  }
}
```

#### Errors

- 400 `VALIDATION_ERROR`
- 404 `USER_SETTINGS_NOT_FOUND`
- 409 `PREVIOUS_RECORD_STILL_OPEN`
- 500 `INTERNAL_ERROR`

---

## 3.7 GET `/summaries/month/:telegramId`

Get current month summary.

Used by the `/month` bot command.

### Query Parameters Optional

- `month` — month in `YYYY-MM` format.  
  If not provided, the current month in the user's timezone is used.

Example:
```txt
GET /summaries/month/123456789?month=2026-06
```

### Behavior

The backend should:
1. Load the user's settings.
2. Check if there is an unfinished workday from a previous date.
3. Determine all configured workdays in the requested month.
4. Load all daily records in that month.
5. Count missing configured workdays as `0` worked minutes.
6. If the current day has an active open record, calculate the current day using worked time so far.
7. Return required minutes, worked minutes, and balance.

### Important Rule

If there is an unfinished workday from a previous date, the backend should return `409 PREVIOUS_RECORD_STILL_OPEN`.

The user should close the previous workday first using:

```txt
/end HH:mm
```

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

- 400 `VALIDATION_ERROR`
- 404 `USER_SETTINGS_NOT_FOUND`
- 409 `PREVIOUS_RECORD_STILL_OPEN`
- 500 `INTERNAL_ERROR`

---

## 3.8 GET `/workdays/:telegramId`

List daily records for a user.

This endpoint is mainly useful for debugging, future dashboard support, and future manual editing flows.

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

### 4.1 Validation Error 400

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "field": "dailyRequiredMinutes",
      "reason": "Must be an integer greater than 0"
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
    "message": "You already started today's workday."
  }
}
```

### 4.4 Previous Record Still Open 409

```json
{
  "success": false,
  "error": {
    "code": "PREVIOUS_RECORD_STILL_OPEN",
    "message": "You have an unfinished previous workday. Please close it before starting a new one.",
    "details": {
      "workDate": "2026-06-12",
      "example": "/end 17:30"
    }
  }
}
```

### 4.5 Manual End Time Required 409

```json
{
  "success": false,
  "error": {
    "code": "MANUAL_END_TIME_REQUIRED",
    "message": "Please provide a manual end time to close the previous workday.",
    "details": {
      "workDate": "2026-06-12",
      "example": "/end 17:30"
    }
  }
}
```

### 4.6 Active Record Not Found 404

```json
{
  "success": false,
  "error": {
    "code": "ACTIVE_RECORD_NOT_FOUND",
    "message": "No active workday found. Use /start first."
  }
}
```

### 4.7 Daily Record Already Closed 409

```json
{
  "success": false,
  "error": {
    "code": "DAILY_RECORD_ALREADY_CLOSED",
    "message": "Today's workday is already closed."
  }
}
```

### 4.8 Internal Error 500

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
| `/start` | `POST /workdays/start` |
| `/status` | `GET /workdays/status/:telegramId` |
| `/end` | `POST /workdays/end` |
| `/end HH:mm` | `POST /workdays/end` with `manualEndTime` |
| `/week` | `GET /summaries/week/:telegramId` |
| `/month` | `GET /summaries/month/:telegramId` |

---

## 6. Appendix — Suggested Bot Messages

### 6.1 Start Success

```txt
Workday started.

Start: 08:15
Expected end: 17:03
```

### 6.2 Start Blocked By Previous Open Workday

```txt
You have an unfinished workday from 2026-06-12.

Please close it first using:
/end 17:30
```

### 6.3 Status Success

```txt
Today's Status

Start: 08:15
Worked: 07:15
Remaining: 01:33
Expected finish: 17:03
```

### 6.4 End Success

```txt
Workday completed.

Start: 08:15
End: 17:45
Worked: 09:30
Balance: +00:42
```

### 6.5 Previous Workday End Success

```txt
Previous workday completed.

Date: 2026-06-12
Start: 08:15
End: 17:30
Worked: 09:15
Balance: +00:27
```

### 6.6 Week Summary

```txt
Week Summary

Required: 44:00
Worked: 46:15
Balance: +02:15
```

### 6.7 Month Summary

```txt
Month Summary

Workdays: 22
Required: 193:36
Worked: 181:20
Balance: -12:16
```

### 6.8 Setup Missing

```txt
User settings not found.
Please run /setup first.
```

### 6.9 No Active Workday

```txt
No active workday found.
Use /start first.
```

### 6.10 Manual End Time Required

```txt
You have an unfinished workday from 2026-06-12.

Please close it with a manual end time:
/end 17:30
```

### 6.11 Invalid Manual End Time

```txt
Invalid end time format.

Please use:
/end HH:mm

Example:
/end 17:30
```
