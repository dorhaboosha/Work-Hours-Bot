# user-settings Specification

## Purpose
TBD - created by archiving change add-workhours-bot-mvp. Update Purpose after archive.
## Requirements
### Requirement: Configure User Work Settings
The system SHALL allow a user to create their work settings via the `/setup` command (`POST /settings/setup`). Settings consist of `dailyRequiredMinutes` (integer > 0), `timezone`, and `workdays` (weekday numbers 0–6, where 0 = Sunday). Settings are keyed by `telegramId`, and a user has at most one settings record. `/setup` is first-time setup only and SHALL NOT overwrite existing settings.

#### Scenario: Create new settings
- **WHEN** a user without existing settings submits valid setup input
- **THEN** a `user_settings` record is created for their `telegramId`
- **AND** the response is `201` with the stored settings and `success: true`

#### Scenario: Setup already completed
- **WHEN** a user who already has settings runs `/setup`
- **THEN** the response is `409` with `error.code = "SETUP_ALREADY_COMPLETED"`
- **AND** the existing settings are not overwritten
- **AND** the bot directs the user to `/settings_edit`

#### Scenario: Decimal hours converted to minutes
- **WHEN** the user provides required daily work hours as decimal hours (e.g. `8.8`)
- **THEN** the system converts them to minutes using `round(hours * 60)` (e.g. `528`) before storing
- **AND** decimal hours are never stored directly

#### Scenario: User chooses workdays and timezone
- **WHEN** the bot guides the user through setup
- **THEN** it requires the user to choose or confirm workdays and timezone
- **AND** it does not silently assume fixed workdays or timezone

### Requirement: Retrieve User Settings
The system SHALL allow retrieval of a user's work settings via `/settings` (`GET /settings/:telegramId`), returning `dailyRequiredMinutes`, `timezone`, and `workdays`.

#### Scenario: Settings found
- **WHEN** a request is made for a `telegramId` that has settings
- **THEN** the response returns the settings with `success: true`

#### Scenario: Settings not found
- **WHEN** a request is made for a `telegramId` that has no settings
- **THEN** the response is `404` with `error.code = "USER_SETTINGS_NOT_FOUND"`
- **AND** the bot prompts the user to run `/setup` first

### Requirement: Settings Validation
The system SHALL validate setup and settings-edit input and reject invalid values with `VALIDATION_ERROR`.

#### Scenario: dailyRequiredMinutes must be a positive integer
- **WHEN** `dailyRequiredMinutes` is provided but is non-integer or not greater than `0`
- **THEN** the response is `400` with `error.code = "VALIDATION_ERROR"`

#### Scenario: workdays must contain valid weekday numbers
- **WHEN** `workdays` is provided but is empty or contains a value outside `0`–`6`
- **THEN** the response is `400` with `error.code = "VALIDATION_ERROR"`

#### Scenario: timezone must be non-empty
- **WHEN** `timezone` is provided but is empty
- **THEN** the response is `400` with `error.code = "VALIDATION_ERROR"`

### Requirement: Edit User Settings
The system SHALL allow a user to update existing settings via `/settings_edit` (`PATCH /settings/:telegramId`). Any subset of `dailyRequiredMinutes`, `timezone`, and `workdays` MAY be provided, and at least one field MUST be present. The user SHALL NOT need to re-run `/setup` to change settings.

#### Scenario: Update a single setting
- **WHEN** a user with existing settings submits a valid partial update (e.g. `timezone`)
- **THEN** only the provided fields are updated and the response returns the updated settings with `success: true`

#### Scenario: No editable fields provided
- **WHEN** a settings-edit request contains no editable fields
- **THEN** the response is `400` with `error.code = "VALIDATION_ERROR"`

#### Scenario: Settings missing
- **WHEN** the user has no settings
- **THEN** the response is `404` with `error.code = "USER_SETTINGS_NOT_FOUND"`
- **AND** the bot prompts the user to run `/setup` first

