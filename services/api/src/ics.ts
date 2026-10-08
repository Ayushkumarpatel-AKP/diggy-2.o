/**
 * `.ics` calendar export (RFC 5545).
 *
 * Pure builder: turns Diggy calendar events into a `VCALENDAR` document the
 * user can import anywhere (Google Calendar, Outlook, Apple Calendar). Used by
 * `google/calendar.export` and `GET /calendar/export`. Events with unparseable
 * start dates are skipped so the file is always valid.
 *
 * // INTERFACE FOR INTEGRATION
 * buildIcs(events: IcsEventInput[], options?: IcsOptions): string
 * // END INTERFACE FOR INTEGRATION
 */

export interface IcsEventInput {
  /** Stable id; generated when omitted. */
  id?: string;
  summary: string;
  /** ISO date-time (`2026-03-01T10:00:00Z`) or date-only (`2026-03-01`, all-day). */
  start: string;
  /** Defaults to start + 1 hour (date-times) or the same day (all-day). */
  end?: string;
  location?: string;
  /** Attached URL (emitted as `URL`). */
  url?: string;
}

export interface IcsOptions {
  prodId?: string;
  calName?: string;
}

const DEFAULT_PROD_ID = '-//Diggy//Diggy Calendar Export//EN';
const DEFAULT_CAL_NAME = 'Diggy Calendar';

/** Escape `TEXT` values per RFC 5545 §3.3.11. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n/g, '\\n')
    .replace(/\n/g, '\\n');
}

/** Fold a content line at 75 octets (naive char-based fold; ASCII-safe). */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 0) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  return parts.join('\r\n');
}

const DATE_ONLY = /^(\d{4})-?(\d{2})-?(\d{2})$/;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function toUtcStamp(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`
  );
}

interface ParsedDate {
  allDay: boolean;
  /** `DTSTART`/`DTEND` value (with `;VALUE=DATE` handled by the caller). */
  value: string;
}

function parseDate(value: string): ParsedDate | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const dateOnly = DATE_ONLY.exec(trimmed);
  if (dateOnly) {
    return { allDay: true, value: `${dateOnly[1]}${dateOnly[2]}${dateOnly[3]}` };
  }
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return undefined;
  return { allDay: false, value: toUtcStamp(new Date(ms)) };
}

/**
 * Build a valid `VCALENDAR` document. Never throws on bad events — they are
 * skipped. Returns at minimum a valid empty calendar.
 */
export function buildIcs(events: IcsEventInput[], options: IcsOptions = {}): string {
  const prodId = options.prodId ?? DEFAULT_PROD_ID;
  const calName = options.calName ?? DEFAULT_CAL_NAME;
  const stamp = toUtcStamp(new Date());

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${prodId}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calName)}`,
  ];

  events.forEach((event, index) => {
    const start = parseDate(event.start);
    if (!start) return;
    const summary = event.summary?.trim() ? event.summary.trim() : '(no title)';

    let end = event.end ? parseDate(event.end) : undefined;
    if (!end) {
      end = start.allDay
        ? { ...start }
        : { allDay: false, value: toUtcStamp(new Date(Date.parse(event.start) + 3_600_000)) };
    }

    const uid = event.id?.trim() ? event.id.trim() : `diggy-${stamp}-${index}@diggy`;
    const vevent: string[] = [
      'BEGIN:VEVENT',
      `UID:${escapeText(uid)}`,
      `DTSTAMP:${stamp}`,
      start.allDay ? `DTSTART;VALUE=DATE:${start.value}` : `DTSTART:${start.value}`,
      end.allDay ? `DTEND;VALUE=DATE:${end.value}` : `DTEND:${end.value}`,
      `SUMMARY:${escapeText(summary)}`,
    ];
    if (event.location?.trim()) vevent.push(`LOCATION:${escapeText(event.location.trim())}`);
    if (event.url?.trim()) vevent.push(`URL:${escapeText(event.url.trim())}`);
    vevent.push('END:VEVENT');
    lines.push(...vevent);
  });

  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
