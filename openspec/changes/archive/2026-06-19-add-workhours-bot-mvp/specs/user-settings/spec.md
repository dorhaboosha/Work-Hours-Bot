## ADDED Requirements

### Requirement: Configure User Work Settings
The system SHALL allow a user to create or update their work settings via the `/setup` command (`POST /settings/setup`). Settings consist of `dailyRequiredMinutes` (integer > 0), `timezone`, and `workdays` (weekday numbers 0–6, where 0 = Sunday). Settings are keyed by `telegramId`, and a user has at most one settings record.

#### Scenario: Create new settings
- **WHEN** a user without existing settings submits valid setup input
- **THEN** a `user_settings` record is created for their `telegramId`
- **AND** the response returns the stored settings with `success: true`

#### Scenario: Update existing settings
- **WHEN** a user who already has settings submits valid setup input
- **THEN** their existing settings are updated rather than duplicated
- **AND** the response returns the updated settings

#### Scenario: Decimal hours converted to minutes
- **WHEN** the user provides required daily work hours as decimal hours (e.g. `8.8`)
- **THEN** the system converts them to minutes using `round(hours * 60)` (e.g. `528`) before storing
- **AND** decimal hours are never stored directly

### Requirement: Setup Defaults
When the user does not specify workdays or timezone during setup, the system SHALL apply MVP defaults: workdays default to Sunday–Thursday (`[0,1,2,3,4]`) and timezone defaults to `Asia/Jerusalem`.

#### Scenario: Default workdays applied
- **WHEN** the user completes setup without choosing custom workdays
- **THEN** the stored `workdays` is `[0,1,2,3,4]`

#### Scenario: Default timezone applied
- **WHEN** the user completes setup without choosing a timezone
- **THEN** the stored `timezone` is `Asia/Jerusalem`

### Requirement: Retrieve User Settings
The system SHALL allow retrieval of a user's work settings via `GET /settings/:telegramId`, used before running work-hour commands.

#### Scenario: Settings found
- **WHEN** a request is made for a `telegramId` that has settings
- **THEN** the response returns the settings with `success: true`

#### Scenario: Settings not found
- **WHEN** a request is made for a `telegramId` that has no settings
- **THEN** the response is `404` with `error.code = "USER_SETTINGS_NOT_FOUND"`
- **AND** the bot prompts the user to run `/setup` first

### Requirement: Settings Validation
The system SHALL validate setup input and reject invalid values with `VALIDATION_ERROR`.

#### Scenario: dailyRequiredMinutes must be a positive integer
- **WHEN** `dailyRequiredMinutes` is missing, non-integer, or not greater than `0`
- **THEN** the response is `400` with `error.code = "VALIDATION_ERROR"`

#### Scenario: workdays must contain valid weekday numbers
- **WHEN** `workdays` is empty or contains a value outside `0`–`6`
- **THEN** the response is `400` with `error.code = "VALIDATION_ERROR"`

#### Scenario: timezone must be non-empty
- **WHEN** `timezone` is missing or empty
- **THEN** the response is `400` with `error.code = "VALIDATION_ERROR"`
