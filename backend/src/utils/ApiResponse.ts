import type { ApiError, ApiSuccess, ErrorCode } from "@shared/types/ApiTypes";

export function success<T>(data: T): ApiSuccess<T> {
  return { success: true, data };
}

export function error(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): ApiError {
  return {
    success: false,
    error: { code, message, ...(details !== undefined && { details }) },
  };
}
