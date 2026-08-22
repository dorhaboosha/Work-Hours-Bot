## ADDED Requirements

### Requirement: Daily Record Types
The system SHALL support the daily record types `WORK`, `SICK`, `VACATION`, `HOLIDAY`, `HOLIDAY_EVE`, `UNPAID_ABSENCE`, and `ELECTION`. `WORK` records track actual worked time; the other types are absences or paid days off and SHALL have no `startTime`, `expectedEndTime`, or `endTime`.

#### Scenario: Work record tracks time
- **WHEN** a record has `recordType = WORK`
- **THEN** it has a `startTime`, and `workedMinutes` reflects actual worked time once the record is closed

#### Scenario: Absence record has no times
- **WHEN** a record has an absence `recordType` (`SICK`, `VACATION`, `HOLIDAY`, `HOLIDAY_EVE`, `UNPAID_ABSENCE`, or `ELECTION`)
- **THEN** `startTime`, `expectedEndTime`, and `endTime` are `null`
- **AND** `workedMinutes` holds the credited minutes for that type

#### Scenario: Unsupported record type rejected
- **WHEN** a record is created or updated with a `recordType` outside the supported set
- **THEN** the operation is rejected with `error.code = "INVALID_RECORD_TYPE"`

### Requirement: Absence Credit Rule
The system SHALL credit absence records toward worked minutes based on the user's `dailyRequiredMinutes`: `SICK`, `VACATION`, `HOLIDAY`, and `ELECTION` credit a full required day; `HOLIDAY_EVE` credits half a required day (`floor(dailyRequiredMinutes / 2)`); `UNPAID_ABSENCE` credits `0`.

#### Scenario: Full-day absence credit
- **WHEN** a date is marked `SICK`, `VACATION`, `HOLIDAY`, or `ELECTION`
- **THEN** its credited `workedMinutes` equals `dailyRequiredMinutes`

#### Scenario: Holiday eve credit
- **WHEN** a date is marked `HOLIDAY_EVE`
- **THEN** its credited `workedMinutes` equals `floor(dailyRequiredMinutes / 2)`

#### Scenario: Unpaid absence credit
- **WHEN** a date is marked `UNPAID_ABSENCE`
- **THEN** its credited `workedMinutes` is `0`
