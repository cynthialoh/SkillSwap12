type LogLevel = "info" | "warn" | "error";
type LogFields = Record<string, string | number | boolean | null | undefined>;

const secretLikeKey = /(authorization|cookie|password|secret|token|api[-_]?key|email|message)/i;

function redact(fields: LogFields) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      secretLikeKey.test(key) ? "[REDACTED]" : value,
    ]),
  );
}

export function log(level: LogLevel, event: string, fields: LogFields = {}) {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...redact(fields),
  };
  const serialized = JSON.stringify(record);

  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.info(serialized);
}
