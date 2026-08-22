## ADDED Requirements

### Requirement: Weekly Summary
The system SHALL return a current-week summary via `/week` (`GET /summaries/week/:telegramId`), reporting `workdaysCount`, `requiredMinutes`, `workedMinutes`, and `balanceMinutes` for the week determined by the user's configured workdays. An optional `date` query parameter (`YYYY-MM-DD`) selects the reference week; otherwise the current date in the user's timezone is used.

#### Scenario: Weekly totals returned
- **WHEN** a user with settings requests their week summary
- **THEN** the response includes `period: "week"`, `startDate`, `endDate`, `workdaysCount`, `requiredMinutes`, `workedMinutes`, and `balanceMinutes = workedMinutes - requiredMinutes`

#### Scenario: Missing workdays count as zero worked
- **WHEN** a configured workday in the week has no record
- **THEN** it contributes its required minutes but `0` worked minutes to the totals

#### Scenario: Open current day uses worked-so-far
- **WHEN** the current day has an active open record
- **THEN** that day's contribution is computed from worked time so far

#### Scenario: Blocked by previous unfinished workday
- **WHEN** the user has an open record from a previous local date
- **THEN** the response is `409` with `error.code = "PREVIOUS_RECORD_STILL_OPEN"`
- **AND** the bot asks the user to close it first with `/end HH:mm`

#### Scenario: Settings missing
- **WHEN** the user has no settings
- **THEN** the response is `404` with `error.code = "USER_SETTINGS_NOT_FOUND"`

### Requirement: Monthly Summary
The system SHALL return a current-month summary via `/month` (`GET /summaries/month/:telegramId`), reporting `workdaysCount`, `requiredMinutes`, `workedMinutes`, and `balanceMinutes` across the configured workdays in the month. An optional `month` query parameter (`YYYY-MM`) selects the month; otherwise the current month in the user's timezone is used.

#### Scenario: Monthly totals returned
- **WHEN** a user with settings requests their month summary
- **THEN** the response includes `period: "month"`, `month`, `workdaysCount`, `requiredMinutes`, `workedMinutes`, and `balanceMinutes`

#### Scenario: Missing workdays count as zero worked
- **WHEN** a configured workday in the month has no record
- **THEN** it contributes its required minutes but `0` worked minutes to the totals

#### Scenario: Open current day uses worked-so-far
- **WHEN** the current day has an active open record
- **THEN** that day's contribution is computed from worked time so far

#### Scenario: Blocked by previous unfinished workday
- **WHEN** the user has an open record from a previous local date
- **THEN** the response is `409` with `error.code = "PREVIOUS_RECORD_STILL_OPEN"`
