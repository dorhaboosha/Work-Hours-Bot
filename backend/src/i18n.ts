import botLabels from "@/lang/botLabels.json";
import type { Weekday } from "@shared/types/CoreTypes";

type Labels = Record<string, unknown>;

/** Resolves a dot-notation key (e.g. "edit.openRecord") against the labels object. */
function resolve(key: string): string {
  const parts = key.split(".");
  let node: unknown = botLabels;
  for (const part of parts) {
    if (typeof node !== "object" || node === null) return key;
    node = (node as Labels)[part];
  }
  return typeof node === "string" ? node : key;
}

/** Replaces {{varName}} placeholders with values from `vars`. */
function interpolate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    String(vars[name] ?? `{{${name}}}`)
  );
}

/** Returns the English label for `key`, with optional variable interpolation. */
export function t(key: string, vars?: Record<string, unknown>): string {
  const template = resolve(key);
  return vars ? interpolate(template, vars) : template;
}

/** Formats an array of weekday numbers as a comma-separated English string. */
export function formatWorkdays(workdays: Weekday[]): string {
  return workdays.map((d) => t(`weekday.${d}`)).join(", ");
}
