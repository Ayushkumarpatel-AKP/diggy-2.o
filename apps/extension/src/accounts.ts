/**
 * Unified account readers with graceful fallbacks.
 *
 * Gmail:  OAuth (full API)  →  browser session feed (zero setup)
 * Calendar: OAuth (API)      →  ICS "secret address" URL (zero setup)
 *
 * The UI's "simple connect" toggles the session/ICS sources, so a user can be
 * up and running without ever touching Google Cloud Console.
 *
 * NOTE: this module reads the three account flags defensively from the
 * `diggy:settings` storage key instead of importing the core-owned settings
 * store, so it keeps working before/after core wires its own `Settings`.
 *
 * // INTERFACE FOR INTEGRATION
 * accountSources(): Promise<AccountSources>
 * readInboxSmart(options?): Promise<InboxItem[]>
 * readCalendarSmart(options?): Promise<CalendarItem[]>
 * // END INTERFACE FOR INTEGRATION
 */
import { browser } from "wxt/browser";
import { googleStatus, listInbox, listUpcoming } from './google';
import { fetchInboxFeed } from './gmail-session';
import { fetchIcsEvents } from './ics';

export interface InboxItem {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
}

export interface CalendarItem {
  id: string;
  summary: string;
  start: string;
  location?: string;
}

export interface AccountSources {
  oauth: boolean;
  gmailSession: boolean;
  calendarIcs: boolean;
}

/** The subset of extension settings this module needs. */
export interface AccountSettings {
  gmailSession: boolean;
  gmailAccount: number;
  calendarIcsUrl: string;
}

const SETTINGS_KEY = 'diggy:settings';

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Read the account flags from `diggy:settings`. Never throws — missing keys
 * fall back to "nothing connected".
 */
export async function readAccountSettings(): Promise<AccountSettings> {
  try {
    const store = (await browser.storage.local.get(SETTINGS_KEY)) as Record<string, unknown>;
    const raw = store[SETTINGS_KEY];
    if (!raw || typeof raw !== 'object') {
      return { gmailSession: false, gmailAccount: 0, calendarIcsUrl: '' };
    }
    const settings = raw as Record<string, unknown>;
    return {
      gmailSession: asBoolean(settings.gmailSession),
      gmailAccount: asNumber(settings.gmailAccount, 0),
      calendarIcsUrl: asString(settings.calendarIcsUrl),
    };
  } catch {
    return { gmailSession: false, gmailAccount: 0, calendarIcsUrl: '' };
  }
}

export async function accountSources(): Promise<AccountSources> {
  const settings = await readAccountSettings();
  const oauth = (await googleStatus()).connected;
  return {
    oauth,
    gmailSession: settings.gmailSession,
    calendarIcs: Boolean(settings.calendarIcsUrl?.trim()),
  };
}

/** Read the inbox from whichever source is configured. */
export async function readInboxSmart(options: { query?: string; max?: number } = {}): Promise<InboxItem[]> {
  const settings = await readAccountSettings();
  const max = options.max ?? 8;

  if ((await googleStatus()).connected) {
    const messages = await listInbox({ query: options.query, max });
    return messages.map(({ id, from, subject, snippet, date }) => ({ id, from, subject, snippet, date }));
  }

  if (settings.gmailSession) {
    const feed = await fetchInboxFeed(settings.gmailAccount);
    return feed.messages.slice(0, max).map(({ id, from, subject, snippet, date }) => ({
      id,
      from,
      subject,
      snippet,
      date,
    }));
  }

  throw new Error(
    'Gmail is not connected. Open ⚙ → Apps and press “Connect Gmail (no setup)”.',
  );
}

/** Read upcoming events from whichever source is configured. */
export async function readCalendarSmart(options: { days?: number; max?: number } = {}): Promise<CalendarItem[]> {
  const settings = await readAccountSettings();
  const days = options.days ?? 7;
  const max = options.max ?? 10;

  if ((await googleStatus()).connected) {
    const events = await listUpcoming(days, max);
    return events.map(({ id, summary, start, location }) => ({ id, summary, start, location }));
  }

  const icsUrl = settings.calendarIcsUrl?.trim();
  if (icsUrl) {
    const events = await fetchIcsEvents(icsUrl, { days, max });
    return events.map(({ id, summary, start, location }) => ({ id, summary, start, location }));
  }

  throw new Error(
    'Calendar is not connected. Open ⚙ → Apps and paste your “Secret address in iCal format”.',
  );
}
