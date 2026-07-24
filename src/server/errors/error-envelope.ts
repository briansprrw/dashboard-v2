export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
    requestId: string;
  };
}

export function errorEnvelope(
  code: string,
  message: string,
  requestId: string,
  fields?: Record<string, string>
): ErrorEnvelope {
  return { error: { code, message, requestId, ...(fields ? { fields } : {}) } };
}
