## MODIFIED Requirements

### Requirement: Error Codes and HTTP Status Mapping
The API SHALL use a fixed set of error codes and map them to HTTP status codes consistently. The error codes are: `VALIDATION_ERROR`, `USER_SETTINGS_NOT_FOUND`, `SETUP_ALREADY_COMPLETED`, `DAILY_RECORD_NOT_FOUND`, `ACTIVE_RECORD_NOT_FOUND`, `DAILY_RECORD_ALREADY_EXISTS`, `PREVIOUS_RECORD_STILL_OPEN`, `DAILY_RECORD_ALREADY_CLOSED`, `INVALID_DATE_FORMAT`, `INVALID_TIME_FORMAT`, `INVALID_TIME_RANGE`, `INVALID_RECORD_TYPE`, `CONFLICT`, and `INTERNAL_ERROR`.

#### Scenario: Validation failures map to 400
- **WHEN** request input fails validation (including invalid date, time, time range, or record type)
- **THEN** the response status is `400` with an `error.code` of `VALIDATION_ERROR`, `INVALID_DATE_FORMAT`, `INVALID_TIME_FORMAT`, `INVALID_TIME_RANGE`, or `INVALID_RECORD_TYPE`

#### Scenario: Missing resources map to 404
- **WHEN** required user settings or a daily/active record cannot be found
- **THEN** the response status is `404` with `error.code` one of `USER_SETTINGS_NOT_FOUND`, `DAILY_RECORD_NOT_FOUND`, or `ACTIVE_RECORD_NOT_FOUND`

#### Scenario: Invalid state maps to 409
- **WHEN** the request conflicts with current state (e.g. setup already completed, duplicate record, previous record still open, already closed, or a disallowed edit action)
- **THEN** the response status is `409` with the corresponding error code (`SETUP_ALREADY_COMPLETED`, `DAILY_RECORD_ALREADY_EXISTS`, `PREVIOUS_RECORD_STILL_OPEN`, `DAILY_RECORD_ALREADY_CLOSED`, or `CONFLICT`)

#### Scenario: Unexpected failures map to 500
- **WHEN** an unexpected error occurs
- **THEN** the response status is `500` with `error.code = "INTERNAL_ERROR"`

### Requirement: Telegram Command Mapping
Each V1.1 Telegram command SHALL map to a defined backend endpoint, and the bot SHALL identify the user by `telegramId` extracted from the Telegram message.

#### Scenario: Commands route to endpoints
- **WHEN** a user sends a supported command
- **THEN** it is routed as follows: `/setup` → `POST /settings/setup`; `/settings` → `GET /settings/:telegramId`; `/settings_edit` → `PATCH /settings/:telegramId`; `/start` → `POST /workdays/start`; `/status` → `GET /workdays/status/:telegramId`; `/end` → `POST /workdays/end`; `/edit dd-mm` → `GET /workdays/edit/:telegramId/:date` and `PATCH /workdays/edit/:telegramId/:date`; `/week` → `GET /summaries/week/:telegramId`; `/month` → `GET /summaries/month/:telegramId`

#### Scenario: Help command is bot-only
- **WHEN** a user sends `/help`
- **THEN** the bot lists the available commands without requiring a backend endpoint

#### Scenario: User identified by telegramId
- **WHEN** the bot handles any command
- **THEN** it extracts the sender's `telegramId` and uses it as the user identifier for the backend call

### Requirement: User-Friendly Bot Messages
The bot SHALL present short, clear, friendly messages in the user's configured language (`en` or `he`), displaying times and durations in `HH:mm` format, and SHALL include a next action when a command cannot be completed.

#### Scenario: Times displayed in HH:mm
- **WHEN** the bot displays a time or duration
- **THEN** it is formatted as `HH:mm` (e.g. `08:15`, `09:30`), with balances signed (e.g. `+02:15`, `-01:20`)

#### Scenario: Messages rendered in configured language
- **WHEN** the bot replies to a user who has a configured `language`
- **THEN** the message text is rendered in that language (`en` or `he`)

#### Scenario: Error explains next action
- **WHEN** a command cannot be completed
- **THEN** the bot message explains what happened and what the user should do next
