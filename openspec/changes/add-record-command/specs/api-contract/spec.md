## MODIFIED Requirements

### Requirement: Telegram Command Mapping
Each V1.1 Telegram command SHALL map to a defined backend endpoint, and the bot SHALL identify the user by `telegramId` extracted from the Telegram message.

#### Scenario: Commands route to endpoints
- **WHEN** a user sends a supported command
- **THEN** it is routed as follows: `/setup` → `POST /settings/setup`; `/settings` → `GET /settings/:telegramId`; `/settings_edit` → `PATCH /settings/:telegramId`; `/start` → `POST /workdays/start`; `/status` → `GET /workdays/status/:telegramId`; `/end` → `POST /workdays/end`; `/record dd-mm` → `GET /workdays/record/:telegramId/:date`; `/edit dd-mm` → `GET /workdays/edit/:telegramId/:date` and `PATCH /workdays/edit/:telegramId/:date`; `/week` → `GET /summaries/week/:telegramId`; `/month` → `GET /summaries/month/:telegramId`

#### Scenario: Help command is bot-only
- **WHEN** a user sends `/help`
- **THEN** the bot lists the available commands without requiring a backend endpoint

#### Scenario: User identified by telegramId
- **WHEN** the bot handles any command
- **THEN** it extracts the sender's `telegramId` and uses it as the user identifier for the backend call
