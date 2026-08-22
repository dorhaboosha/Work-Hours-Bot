## ADDED Requirements

### Requirement: Standard Response Envelope
All HTTP API endpoints SHALL return a standard JSON envelope. Successful responses SHALL use `{ "success": true, "data": <payload> }`. Failed responses SHALL use `{ "success": false, "error": { "code": <ErrorCode>, "message": <string>, "details"?: <object> } }`.

#### Scenario: Successful response shape
- **WHEN** an endpoint completes successfully
- **THEN** the response body has `success: true` and a `data` field containing the payload
- **AND** no `error` field is present

#### Scenario: Error response shape
- **WHEN** an endpoint fails
- **THEN** the response body has `success: false` and an `error` object with `code` and `message`
- **AND** `error.details` MAY be present with additional context

### Requirement: Error Codes and HTTP Status Mapping
The API SHALL use a fixed set of error codes and map them to HTTP status codes consistently. The error codes are: `VALIDATION_ERROR`, `USER_SETTINGS_NOT_FOUND`, `DAILY_RECORD_NOT_FOUND`, `ACTIVE_RECORD_NOT_FOUND`, `DAILY_RECORD_ALREADY_EXISTS`, `PREVIOUS_RECORD_STILL_OPEN`, `MANUAL_END_TIME_REQUIRED`, `DAILY_RECORD_ALREADY_CLOSED`, `CONFLICT`, `INTERNAL_ERROR`.

#### Scenario: Validation failures map to 400
- **WHEN** request input fails validation
- **THEN** the response status is `400` with `error.code = "VALIDATION_ERROR"`

#### Scenario: Missing resources map to 404
- **WHEN** required user settings or an active record cannot be found
- **THEN** the response status is `404` with `error.code` one of `USER_SETTINGS_NOT_FOUND`, `DAILY_RECORD_NOT_FOUND`, or `ACTIVE_RECORD_NOT_FOUND`

#### Scenario: Invalid state maps to 409
- **WHEN** the request conflicts with current state (e.g. duplicate record, previous record still open, manual end time required, already closed)
- **THEN** the response status is `409` with the corresponding error code

#### Scenario: Unexpected failures map to 500
- **WHEN** an unexpected error occurs
- **THEN** the response status is `500` with `error.code = "INTERNAL_ERROR"`

### Requirement: Telegram Command Mapping
Each MVP Telegram command SHALL map to a defined backend endpoint, and the bot SHALL identify the user by `telegramId` extracted from the Telegram message.

#### Scenario: Commands route to endpoints
- **WHEN** a user sends a supported command
- **THEN** it is routed as follows: `/setup` → `POST /settings/setup`; `/start` → `POST /workdays/start`; `/status` → `GET /workdays/status/:telegramId`; `/end` and `/end HH:mm` → `POST /workdays/end`; `/week` → `GET /summaries/week/:telegramId`; `/month` → `GET /summaries/month/:telegramId`

#### Scenario: User identified by telegramId
- **WHEN** the bot handles any command
- **THEN** it extracts the sender's `telegramId` and uses it as the user identifier for the backend call

### Requirement: User-Friendly Bot Messages
The bot SHALL present short, clear, friendly messages, displaying times and durations in `HH:mm` format, and SHALL include a next action when a command cannot be completed.

#### Scenario: Times displayed in HH:mm
- **WHEN** the bot displays a time or duration
- **THEN** it is formatted as `HH:mm` (e.g. `08:15`, `09:30`), with balances signed (e.g. `+02:15`, `-01:20`)

#### Scenario: Error explains next action
- **WHEN** a command cannot be completed
- **THEN** the bot message explains what happened and what the user should do next
