import type { BriefingRejectionCode } from '@/types';

/**
 * The cost guard turned a briefing away, and until `retryAt` the page should not ask again.
 *
 * A notice, not an error: nothing went wrong, the service is busy or a limit is spent, so it
 * renders in the neutral status box rather than the red alert one.
 */
export interface BriefingNotice {
  code: BriefingRejectionCode;
  /** Epoch ms after which a new request can be made. */
  retryAt: number;
  /** The wait as the server stated it, in seconds — what a screen reader is told, once. */
  waitSeconds: number;
  /** The limit that was hit, as the server sent it; `null` when it did not. */
  limit: number | null;
}

const REJECTION_CODES: readonly string[] = ['busy', 'rate_limited', 'daily_cap'];

export function isRejectionCode(code: string | null): code is BriefingRejectionCode {
  return code !== null && REJECTION_CODES.includes(code);
}

/** `45` → `45s`, `125` → `2:05`, `3725` → `1:02:05`. */
export function formatCountdown(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const s = String(seconds % 60).padStart(2, '0');
  const totalMinutes = Math.floor(seconds / 60);
  if (seconds < 3600) return `${totalMinutes}:${s}`;
  const m = String(totalMinutes % 60).padStart(2, '0');
  return `${Math.floor(totalMinutes / 60)}:${m}:${s}`;
}

/** The reader's own clock time for an instant — the daily reset is 00:00 UTC, not their midnight. */
export function formatClockTime(epochMs: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(
    new Date(epochMs),
  );
}

/**
 * "at 7:00 PM", or "tomorrow at 7:00 PM" when the retry falls on a later local day than the
 * refusal. The daily cap resets at 00:00 UTC, which west of UTC is the *evening*: refused at
 * 8:17 PM, "It resets at 7:00 PM" reads as a time already gone. Every wait is under 24h, so the
 * only other day it can be is tomorrow.
 */
function retryPhrase(notice: BriefingNotice): string {
  const refusedAt = notice.retryAt - notice.waitSeconds * 1000;
  const sameDay = new Date(refusedAt).toDateString() === new Date(notice.retryAt).toDateString();
  const time = formatClockTime(notice.retryAt);
  return sameDay ? `at ${time}` : `tomorrow at ${time}`;
}

/**
 * What the status region announces. The same as the visible text except for a busy wait,
 * whose visible number ticks every second: a live region re-announces every change, so the
 * ticking copy is hidden from assistive technology and this states the wait once instead.
 */
export function noticeAnnouncement(notice: BriefingNotice): string {
  if (notice.code !== 'busy') return noticeMessage(notice, notice.waitSeconds);
  const unit = notice.waitSeconds === 1 ? 'second' : 'seconds';
  return `Another briefing is being generated. Try again in ${notice.waitSeconds} ${unit}.`;
}

/** The notice's visible text. `secondsLeft` is the live countdown. */
export function noticeMessage(notice: BriefingNotice, secondsLeft: number): string {
  switch (notice.code) {
    case 'busy':
      return `Another briefing is being generated. Try again in ${secondsLeft}s.`;
    case 'rate_limited': {
      const count = notice.limit === null ? 'your briefings' : `your ${notice.limit} briefings`;
      return `You've used ${count} for this hour. Next one ${retryPhrase(notice)}.`;
    }
    case 'daily_cap':
      return `Today's briefing budget is used up. It resets ${retryPhrase(notice)}.`;
  }
}
