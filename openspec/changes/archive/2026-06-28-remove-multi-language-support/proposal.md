# Change: Remove Multi-Language Support (English-Only Bot Labels)

## Why
The V1.1 spec (`docs/Spec.md` §2.5, §3.3) and the updated `openspec/project.md` now mandate an English-only bot whose messages live in a single `botLabels.json` file. The deployed specs still describe multi-language support (a `language` setting of `en`/`he`, language selection in `/setup`, language editing in `/settings_edit`, and rendering messages in the user's configured language), so the specs no longer reflect the intended V1.1 scope.

## What Changes
- **BREAKING**: Remove the `language` field from user settings (no longer collected in `/setup`, returned by `/settings`, validated, or editable via `/settings_edit`).
- `/setup` collects only `dailyRequiredMinutes`, `timezone`, and `workdays`.
- Bot messages are English-only and sourced from a single `botLabels.json` labels file instead of being hardcoded or language-switched.
- Drop the `language must be supported` validation scenario.

## Impact
- Affected specs: `user-settings`, `api-contract`
- Affected code:
  - `backend/prisma/schema.prisma` (remove `language` column) + a Prisma migration to drop it
  - `backend/src/validators/SettingsSchemas.ts` (remove `language` from setup/edit schemas)
  - settings service + repository (stop reading/writing `language`)
  - `backend/src/bot/` setup and settings-edit flows (remove language step)
  - `botLabels.json` (central English labels) and bot message helpers
  - `shared/` types/schemas referencing `language`
