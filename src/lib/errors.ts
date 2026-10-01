export class AppError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "UNAUTHORIZED"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "VALIDATION"
      | "CONFLICT"
      | "INTERNAL" = "INTERNAL",
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "غير مصرح لك بتنفيذ هذا الإجراء") {
    super(message, "FORBIDDEN", 403);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "يجب تسجيل الدخول") {
    super(message, "UNAUTHORIZED", 401);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "السجل غير موجود") {
    super(message, "NOT_FOUND", 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, "VALIDATION", 400);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "CONFLICT", 409);
  }
}

/** Narrows a nullable value after the call (throws NotFoundError when absent). */
export function assertFound<T>(value: T | null | undefined, message?: string): asserts value is NonNullable<T> {
  if (value === null || value === undefined) throw new NotFoundError(message);
}

/** Returns the value when present (throws NotFoundError when absent). */
export function mustFind<T>(value: T | null | undefined, message?: string): NonNullable<T> {
  if (value === null || value === undefined) throw new NotFoundError(message);
  return value;
}

/** Serializes an error to a safe client-facing message (never leaks internals). */
export function toClientError(e: unknown): string {
  if (e instanceof AppError) return e.message;
  if (e instanceof Error) return process.env.NODE_ENV === "production" ? "حدث خطأ غير متوقع" : e.message;
  return "حدث خطأ غير متوقع";
}
