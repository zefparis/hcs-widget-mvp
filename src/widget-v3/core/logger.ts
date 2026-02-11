/**
 * HCS-U7 Widget v3 — Logger
 * Debug logs stored in memory, only emitted to console if debug=true.
 */

export interface LogEntry {
  t: number;
  cat: string;
  data: unknown;
}

const MAX_ENTRIES = 200;
const logs: LogEntry[] = [];
let debugEnabled = false;

export function setDebug(enabled: boolean): void {
  debugEnabled = enabled;
}

export function isDebug(): boolean {
  return debugEnabled;
}

export function log(category: string, data: unknown): void {
  if (!debugEnabled) return;
  const entry: LogEntry = { t: Date.now(), cat: category, data };
  logs.push(entry);
  if (logs.length > MAX_ENTRIES) logs.shift();
  console.debug('[HCS-U7][' + category + ']', data);
}

export function logError(msg: string): void {
  console.error('[HCS-U7] ' + msg);
}

export function logWarn(msg: string): void {
  if (!debugEnabled) return;
  console.warn('[HCS-U7] ' + msg);
}

export function getLogs(): LogEntry[] {
  return logs.slice();
}
