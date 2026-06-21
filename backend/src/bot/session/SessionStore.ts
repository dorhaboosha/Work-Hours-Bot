/**
 * In-memory conversation session store.
 * Each user can have at most one active session at a time.
 * Sessions are cleared when a command is received or when a flow completes/cancels.
 * On bot restart all sessions are lost; users simply re-run the command.
 */

export type SessionStep =
  // /setup multi-step
  | "setup:hours"
  | "setup:workdays"
  | "setup:workdays_custom"
  | "setup:timezone"
  | "setup:timezone_custom"
  | "setup:language"
  // /settings_edit multi-step
  | "settings_edit:choose_field"
  | "settings_edit:hours"
  | "settings_edit:workdays"
  | "settings_edit:workdays_custom"
  | "settings_edit:timezone"
  | "settings_edit:timezone_custom"
  | "settings_edit:language"
  // /edit dd-mm multi-step
  | "edit:choose_action"
  | "edit:set_end_hour"
  | "edit:set_start_end"
  | "edit:choose_absence";

export interface SessionData {
  /** Collected during /setup flow */
  hours?: number;
  workdays?: number[];
  timezone?: string;
  /** Preserved during /edit flow */
  ddMm?: string;
  /** EditRecordState string from the initial getEditDayOptions call */
  editState?: string;
}

export interface Session {
  step: SessionStep;
  data: SessionData;
}

const store = new Map<string, Session>();

export const SessionStore = {
  get(userId: string): Session | undefined {
    return store.get(userId);
  },
  set(userId: string, session: Session): void {
    store.set(userId, session);
  },
  update(userId: string, partial: Partial<Session>): void {
    const existing = store.get(userId);
    if (existing) {
      store.set(userId, { ...existing, ...partial, data: { ...existing.data, ...partial.data } });
    }
  },
  clear(userId: string): void {
    store.delete(userId);
  },
  has(userId: string): boolean {
    return store.has(userId);
  },
};
