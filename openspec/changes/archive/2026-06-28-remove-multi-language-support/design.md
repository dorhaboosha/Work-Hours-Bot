## Context
V1.1 was re-scoped to be English-only (`docs/Spec.md` §2.5, §3.3). The deployed `user-settings` and `api-contract` specs still carry a `language` setting (`en`/`he`) and language-aware message rendering. This change removes that capability. The only non-trivial aspect is a breaking schema change: dropping the `language` column from `user_settings`.

## Goals / Non-Goals
- Goals: Remove the `language` field everywhere (DB, validation, services, bot flows); standardize all bot output on a single English `botLabels.json`.
- Non-Goals: Building an i18n framework, deleting existing data rows, or changing any other setting (`dailyRequiredMinutes`, `timezone`, `workdays`).

## Decisions
- Decision: Drop the `language` column rather than keep it unused. The field is user-facing (collected in setup, editable) and leaving it would keep dead UI/validation paths that contradict the spec.
- Decision: Keep `botLabels.json` as a flat English labels file (no locale keys). This avoids reintroducing multi-language structure while still removing hardcoded strings.
- Alternatives considered: Keep `language` nullable/defaulted to `en` — rejected because it leaves contradictory validation and flow code and an unused column.

## Risks / Trade-offs
- Risk: Existing rows have a `language` value → dropping the column discards it. Mitigation: acceptable for V1.1 personal-use scope; the value is no longer used.
- Risk: Re-adding multi-language later requires a new migration. Mitigation: documented as a planned future feature; out of scope now.

## Migration Plan
1. Edit `schema.prisma` to remove the field.
2. Generate a Prisma migration that drops `user_settings.language` and apply it locally (Docker Compose Postgres).
3. Deploy code that no longer reads/writes `language`.
Rollback: revert the migration (re-add a nullable `language` column) and restore the prior code if needed.

## Open Questions
- None.
