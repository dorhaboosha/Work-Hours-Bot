// --- Error codes ---

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "USER_SETTINGS_NOT_FOUND"
  | "SETUP_ALREADY_COMPLETED"
  | "DAILY_RECORD_NOT_FOUND"
  | "ACTIVE_RECORD_NOT_FOUND"
  | "DAILY_RECORD_ALREADY_EXISTS"
  | "PREVIOUS_RECORD_STILL_OPEN"
  | "DAILY_RECORD_ALREADY_CLOSED"
  | "INVALID_DATE_FORMAT"
  | "INVALID_TIME_FORMAT"
  | "INVALID_TIME_RANGE"
  | "INVALID_RECORD_TYPE"
  | "CONFLICT"
  | "INTERNAL_ERROR";

// --- Response envelope ---

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
