/**
 * The words and numbers on the busy / limit notice. Pure functions, so no timers here — the
 * countdown's ticking is the hook's, and `use-briefing.test.tsx` covers it.
 */

import { describe, expect, it } from 'vitest';
import {
  formatClockTime,
  formatCountdown,
  isRejectionCode,
  noticeAnnouncement,
  noticeMessage,
  type BriefingNotice,
} from '@/lib/briefing-notice';

describe('formatCountdown', () => {
  it.each([
    [0, '0s'],
    [9, '9s'],
    [59, '59s'],
    [60, '1:00'],
    [125, '2:05'],
    [3599, '59:59'],
    [3600, '1:00:00'],
    [82698, '22:58:18'],
  ])('%is reads %s', (seconds, expected) => {
    expect(formatCountdown(seconds)).toBe(expected);
  });
});

describe('isRejectionCode', () => {
  it('knows the three codes the guard sends and nothing else', () => {
    expect(['busy', 'rate_limited', 'daily_cap'].every(isRejectionCode)).toBe(true);
    expect(isRejectionCode('deadline')).toBe(false);
    expect(isRejectionCode(null)).toBe(false);
  });
});

const AT = Date.UTC(2026, 9, 1, 0, 0, 0); // a 00:00 UTC, as a daily cap would name it

/**
 * Instants built from *local* components, so "same local day" and "next local day" hold in any
 * time zone the suite runs in — CI is UTC, a laptop is not, and a UTC-built pair can fall on
 * either side of local midnight depending on which.
 */
const localTime = (day: number, hour: number, minute = 0) =>
  new Date(2026, 8, day, hour, minute).getTime();

/** A notice refused at `refusedAt` and good again at `retryAt`. */
function notice(
  code: BriefingNotice['code'],
  refusedAt: number,
  retryAt: number,
  limit: number | null = 5,
): BriefingNotice {
  return { code, retryAt, waitSeconds: Math.round((retryAt - refusedAt) / 1000), limit };
}

describe('noticeMessage', () => {
  it('counts a busy wait down in seconds', () => {
    const busy: BriefingNotice = { code: 'busy', retryAt: AT, waitSeconds: 10, limit: 2 };

    expect(noticeMessage(busy, 7)).toBe('Another briefing is being generated. Try again in 7s.');
  });

  it('names the hourly limit the server sent, and the local time of the next one', () => {
    const limited = notice('rate_limited', localTime(30, 14, 0), localTime(30, 14, 40), 3);

    expect(noticeMessage(limited, 2400)).toBe(
      `You've used your 3 briefings for this hour. Next one at ${formatClockTime(limited.retryAt)}.`,
    );
  });

  it('does not invent a number when the server sent none', () => {
    const limited = notice('rate_limited', localTime(30, 14, 0), localTime(30, 14, 40), null);

    expect(noticeMessage(limited, 2400)).toBe(
      `You've used your briefings for this hour. Next one at ${formatClockTime(limited.retryAt)}.`,
    );
  });

  it('says when the daily budget resets, in local time', () => {
    const capped = notice('daily_cap', localTime(30, 10, 0), localTime(30, 19, 0));

    expect(noticeMessage(capped, 9 * 3600)).toBe(
      `Today's briefing budget is used up. It resets at ${formatClockTime(capped.retryAt)}.`,
    );
  });

  it('says "tomorrow" when the reset falls on the next local day', () => {
    // Refused at 20:17 west of UTC: 00:00 UTC is 19:00 *tomorrow* here, and "It resets at
    // 7:00 PM" read at 8:17 PM looked like a time already gone — seen live.
    const capped = notice('daily_cap', localTime(30, 20, 17), localTime(31, 19, 0));

    expect(noticeMessage(capped, 22 * 3600)).toBe(
      `Today's briefing budget is used up. It resets tomorrow at ${formatClockTime(capped.retryAt)}.`,
    );
  });

  it('says "tomorrow" when the next hourly slot is past local midnight', () => {
    const limited = notice('rate_limited', localTime(30, 23, 50), localTime(31, 0, 20), 5);

    expect(noticeMessage(limited, 1800)).toBe(
      `You've used your 5 briefings for this hour. Next one tomorrow at ${formatClockTime(limited.retryAt)}.`,
    );
  });
});

describe('formatClockTime', () => {
  it('is an hour and minute, not a date', () => {
    expect(formatClockTime(AT)).toMatch(/^\d{1,2}[:.]\d{2}(\s?[AaPp]\.?[Mm]\.?)?$/);
  });
});

describe('noticeAnnouncement', () => {
  it('states a busy wait once, in words, instead of the ticking number', () => {
    const busy: BriefingNotice = { code: 'busy', retryAt: AT, waitSeconds: 10, limit: 2 };

    expect(noticeAnnouncement(busy)).toBe(
      'Another briefing is being generated. Try again in 10 seconds.',
    );
  });

  it('is the visible text for a limit, which names a clock time and so never ticks', () => {
    const capped = notice('daily_cap', localTime(30, 10, 0), localTime(30, 19, 0));

    expect(noticeAnnouncement(capped)).toBe(noticeMessage(capped, 3600));
  });
});
