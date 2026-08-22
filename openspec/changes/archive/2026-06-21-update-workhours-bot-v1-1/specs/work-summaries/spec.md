## MODIFIED Requirements

### Requirement: Weekly Summary
The system SHALL return the current-week summary via `/week` (`GET /summaries/week/:telegramId`), reporting `workdaysCount`, `requiredMinutes`, `workedMinutes`, and `balanceMinutes` for the current week determined by the current date in the user's timezone and the user's configured workdays. The summary SHALL iterate the real calendar dates in the week, count only configured workdays, and credit absence records by their type.

#### Scenario: Weekly totals returned
- **WHEN** a user with settings requests their week summary
- **THEN** the response includes `period: "week"`, `startDate`, `endDate`, `workdaysCount`, `requiredMinutes`, `workedMinutes`, and `balanceMinutes = workedMinutes - requiredMinutes`

#### Scenario: Missing workdays count as zero worked
- **WHEN** a configured workday in the week has no record
- **THEN** it contributes its required minutes but `0` worked minutes to the totals

#### Scenario: Absence days credited by type
- **WHEN** a configured workday in the week has an absence record
- **THEN** it contributes credited minutes according to the absence credit rule

#### Scenario: Open current day uses worked-so-far
- **WHEN** the current day has an active open record
- **THEN** that day's contribution is computed from worked time so far

#### Scenario: Blocked by previous unfinished workday
- **WHEN** the user has an open record from a previous local date
- **THEN** the response is `409` with `error.code = "PREVIOUS_RECORD_STILL_OPEN"`
- **AND** the bot asks the user to fix it with `/edit dd-mm`

#### Scenario: Settings missing
- **WHEN** the user has no settings
- **THEN** the response is `404` with `error.code = "USER_SETTINGS_NOT_FOUND"`

### Requirement: Monthly Summary
The system SHALL return the current-month summary via `/month` (`GET /summaries/month/:telegramId`), reporting `workdaysCount`, `requiredMinutes`, `workedMinutes`, and `balanceMinutes` across the configured workdays in the current month (current date in the user's timezone). The summary SHALL iterate every real calendar date in the month, count only configured workdays, and credit absence records by their type.

#### Scenario: Monthly totals returned
- **WHEN** a user with settings requests their month summary
- **THEN** the response includes `period: "month"`, `month`, `workdaysCount`, `requiredMinutes`, `workedMinutes`, and `balanceMinutes`

#### Scenario: Missing workdays count as zero worked
- **WHEN** a configured workday in the month has no record
- **THEN** it contributes its required minutes but `0` worked minutes to the totals

#### Scenario: Absence days credited by type
- **WHEN** a configured workday in the month has an absence record
- **THEN** it contributes credited minutes according to the absence credit rule

#### Scenario: Open current day uses worked-so-far
- **WHEN** the current day has an active open record
- **THEN** that day's contribution is computed from worked time so far

#### Scenario: Blocked by previous unfinished workday
- **WHEN** the user has an open record from a previous local date
- **THEN** the response is `409` with `error.code = "PREVIOUS_RECORD_STILL_OPEN"`
- **AND** the bot asks the user to fix it with `/edit dd-mm`
