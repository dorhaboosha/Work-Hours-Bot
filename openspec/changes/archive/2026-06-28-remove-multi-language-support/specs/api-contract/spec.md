## MODIFIED Requirements

### Requirement: User-Friendly Bot Messages
The bot SHALL present short, clear, friendly messages in English only, sourced from a single labels file (`botLabels.json`) rather than hardcoded strings, displaying times and durations in `HH:mm` format, and SHALL include a next action when a command cannot be completed. V1.1 does not support multiple bot languages.

#### Scenario: Times displayed in HH:mm
- **WHEN** the bot displays a time or duration
- **THEN** it is formatted as `HH:mm` (e.g. `08:15`, `09:30`), with balances signed (e.g. `+02:15`, `-01:20`)

#### Scenario: Messages sourced from labels file
- **WHEN** the bot replies to a user
- **THEN** the message text is in English and resolved from the central `botLabels.json` labels file
- **AND** message text is not hardcoded inside individual handlers

#### Scenario: Error explains next action
- **WHEN** a command cannot be completed
- **THEN** the bot message explains what happened and what the user should do next
