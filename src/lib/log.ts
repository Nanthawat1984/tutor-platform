// Structured server-side logging (P1 reliability).
// Single JSON line per event so Cloud Logging / App Hosting picks up severity
// and searchable fields. Never log PII, file contents, tokens, or secrets —
// pass IDs and counts only.

export type LogLevel = 'info' | 'warn' | 'error';

export function logEvent(
  level: LogLevel,
  event: string,
  fields: Record<string, string | number | boolean | null | undefined> = {},
): void {
  try {
    const line = JSON.stringify({
      severity: level.toUpperCase(),
      event,
      service: 'tutor-platform',
      at: new Date().toISOString(),
      ...fields,
    });
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  } catch {
    // Logging must never break the request path.
  }
}
