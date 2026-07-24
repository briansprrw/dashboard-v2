// Shared structured (JSON) server-side log line, safe for any log sink:
// request id/route/status/coarse code plus optional non-sensitive detail.
// Never includes headers, cookies, request/response bodies, task content,
// or stack traces. Every caller is responsible for passing only fixed or
// allowlisted values into `detail` — this function does not redact.
export function logEvent(input: {
  requestId: string;
  path: string;
  method: string;
  status: number;
  code: string;
  detail?: unknown;
}): void {
  console.error(
    JSON.stringify({
      level: 'error',
      requestId: input.requestId,
      method: input.method,
      path: input.path,
      status: input.status,
      code: input.code,
      detail: input.detail,
    })
  );
}
