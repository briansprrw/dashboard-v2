import type { ContentfulStatusCode } from 'hono/utils/http-status';

// Thrown by route handlers/middleware for expected, safe-to-reveal error
// conditions. The top-level onError handler maps `message`/`code`/`fields`
// straight to the client-facing stable error envelope — only put content
// there that is safe for any caller to see (e.g. field-validation detail).
// `logDetail` is server-log-only (structured, redacted logs) and is never
// serialized into the HTTP response. Anything else thrown (a bug, not an
// AppError) is treated as unexpected and never has its message/stack
// exposed to the client either.
export class AppError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly fields?: Record<string, string>;
  readonly logDetail?: Record<string, unknown>;

  constructor(
    status: ContentfulStatusCode,
    code: string,
    message: string,
    options?: { fields?: Record<string, string>; logDetail?: Record<string, unknown> }
  ) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.fields = options?.fields;
    this.logDetail = options?.logDetail;
  }
}
