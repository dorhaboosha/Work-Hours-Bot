/**
 * In-memory conversation session store.
 * Each user can have at most one active session at a time.
 * Sessions are cleared when a command is received or when a flow completes/cancels.
 * A periodic sweep (see startSessionCleanup) also evicts sessions abandoned
 * mid-flow so the store doesn't grow unbounded while the process is running.
 * On bot restart all sessions are lost; users simply re-run the command.
 */

export type SessionStep =
  // /setup multi-step
  | "setup:hours"
  | "setup:workdays"
  | "setup:workdays_custom"
  | "setup:timezone"
  | "setup:timezone_custom"
  | "setup:vacation_rate"
  | "setup:sick_rate"
  // /settings_edit multi-step
  | "settings_edit:choose_field"
  | "settings_edit:hours"
  | "settings_edit:workdays"
  | "settings_edit:workdays_custom"
  | "settings_edit:timezone"
  | "settings_edit:timezone_custom"
  | "settings_edit:vacation_rate"
  | "settings_edit:sick_rate"
  | "settings_edit:vacation_balance"
  | "settings_edit:sick_balance"
  // /edit dd-mm multi-step
  | "edit:choose_action"
  | "edit:set_end_hour"
  | "edit:set_start_end"
  | "edit:choose_absence"
  | "edit:choose_debit_amount";

export interface SessionData {
  /** Collected during /setup flow */
  hours?: number;
  workdays?: number[];
  timezone?: string;
  vacationAccrualRate?: number;
  sickAccrualRate?: number;
  /** Preserved during /edit flow */
  ddMm?: string;
  /** EditRecordState string from the initial getEditDayOptions call */
  editState?: string;
  /** AbsenceRecordType string, set while awaiting a debit amount for MARK_ABSENCE */
  absenceType?: string;
}

export interface Session {
  step: SessionStep;
  data: SessionData;
}

interface StoredSession extends Session {
  /** Timestamp (ms) of the last set/update, used by the idle sweep. */
  updatedAt: number;
}

const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_SWEEP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

const store = new Map<string, StoredSession>();

export const SessionStore = {
  get(userId: string): Session | undefined {
    const stored = store.get(userId);
    if (!stored) return undefined;
    // Strip the internal updatedAt bookkeeping field so callers only ever see Session.
    return { step: stored.step, data: stored.data };
  },
  set(userId: string, session: Session): void {
    store.set(userId, { ...session, updatedAt: Date.now() });
  },
  update(userId: string, partial: Partial<Session>): void {
    const existing = store.get(userId);
    if (existing) {
      store.set(userId, {
        ...existing,
        ...partial,
        data: { ...existing.data, ...partial.data },
        updatedAt: Date.now(),
      });
    }
  },
  clear(userId: string): void {
    store.delete(userId);
  },
  has(userId: string): boolean {
    return store.has(userId);
  },
  /** Number of sessions currently held (mainly for tests/observability). */
  size(): number {
    return store.size;
  },
  /** Deletes every session last touched more than maxIdleMs ago. Returns the count evicted. */
  evictIdle(maxIdleMs: number = DEFAULT_IDLE_TIMEOUT_MS, now: number = Date.now()): number {
    let evicted = 0;
    for (const [userId, session] of store) {
      if (now - session.updatedAt > maxIdleMs) {
        store.delete(userId);
        evicted++;
      }
    }
    return evicted;
  },
};

/**
 * Starts the periodic idle-session sweep and returns the interval handle.
 * Call once during bootstrap, alongside the other background jobs.
 */
export function startSessionCleanup(
  intervalMs: number = DEFAULT_SWEEP_INTERVAL_MS,
  idleTimeoutMs: number = DEFAULT_IDLE_TIMEOUT_MS
): NodeJS.Timeout {
  return setInterval(() => {
    const evicted = SessionStore.evictIdle(idleTimeoutMs);
    if (evicted > 0) {
      console.log(`[SessionCleanup] Evicted ${evicted} idle session(s).`);
    }
  }, intervalMs);
}
