'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { BriefingRequestError, streamBriefing } from '@/lib/api';
import { isRejectionCode, type BriefingNotice } from '@/lib/briefing-notice';
import { BRIEFING_DEADLINE_ERROR, GENERIC_BRIEFING_ERROR } from '@/lib/constants';
import type { RaceInfo, ToolResult } from '@/types';

/** How often a pending notice's countdown repaints. */
const COUNTDOWN_TICK_MS = 1000;

/**
 * How long deltas pile up in the buffer before the accumulated prose is painted.
 *
 * Coalescing lives here rather than on the wire because batching is a rendering
 * concern: retuning the feel should not need a backend deploy. A briefing is an
 * estimated 500–1500 deltas, and every paint re-parses the whole accumulated
 * markdown string — so painting one delta at a time is quadratic in the length
 * of the briefing. Roughly ten flushes a second is perceptually identical to
 * continuous.
 */
const FLUSH_INTERVAL_MS = 80;

export interface BriefingState {
  query: string;
  /**
   * What the latest run asked for, as submitted — not the field, which the visitor may have
   * edited since. A failed run's saved example is matched on it when no `race_info` arrived.
   */
  lastQuery: string;
  loading: boolean;
  race: string;
  /**
   * The whole `race_info` payload, not just its name.
   *
   * `race` is kept alongside it rather than derived from it because every existing consumer
   * reads `race` and expects `''` — not `null` — before the event lands, and because the two
   * answer different questions: `race` is "what am I generating", which the loader shows from
   * the moment it resolves, while `raceInfo` is the record the circuit band draws from and is
   * meaningless in part.
   */
  raceInfo: RaceInfo | null;
  briefing: string;
  /** Whether synthesis stopped partway, leaving `briefing` unfinished. */
  truncated: boolean;
  /**
   * The stream ended before its terminal event — `briefing` or `error` — arrived: the connection
   * dropped. `briefing` keeps whatever prose had arrived, which may be none. Not `truncated`,
   * which is the server *knowing* the prose stopped short (ADR-0002); here nobody told the page
   * anything, so the run is neither finished nor failed.
   */
  interrupted: boolean;
  toolTrace: ToolResult[];
  /** The tools the planner chose, in its order. Empty until the `tool_plan` event lands. */
  toolPlan: string[];
  error: string;
  statusMessage: string;
  /** The graph stage the run is in: resolving | planning | gathering | synthesizing. */
  step: string;
  /** Epoch ms the current request began. Zero before the first submit. */
  startedAt: number;
  /**
   * The server refused to start a run — busy, or a limit spent — and says when to ask again.
   * While it is set, `submit` does nothing; it clears itself when the wait runs out.
   */
  notice: BriefingNotice | null;
  /** Whole seconds until `notice` clears; zero when there is none. */
  retryInSeconds: number;
}

export interface UseBriefingReturn extends BriefingState {
  setQuery: (query: string) => void;
  submit: (searchQuery?: string) => Promise<void>;
  /**
   * Ask again for the race the last run was for, whatever the field says now. Unlike `submit`,
   * the interrupted run stays on screen until the new one has started, so a refusal from the
   * cost guard leaves the reader the prose they had, with the countdown beside it.
   */
  retry: () => Promise<void>;
}

export function useBriefing(): UseBriefingReturn {
  const [query, setQuery] = useState('');
  const [lastQuery, setLastQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [race, setRace] = useState('');
  const [raceInfo, setRaceInfo] = useState<RaceInfo | null>(null);
  const [briefing, setBriefing] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const [toolTrace, setToolTrace] = useState<ToolResult[]>([]);
  const [toolPlan, setToolPlan] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [step, setStep] = useState('');
  const [startedAt, setStartedAt] = useState(0);
  const [notice, setNotice] = useState<BriefingNotice | null>(null);
  // The clock the countdown is read against, held in state so render stays pure: it is set when
  // a refusal lands and by the tick, never read off `Date.now()` during render.
  const [now, setNow] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  // The race the last run asked for — what `retry` asks for again.
  const lastQueryRef = useRef('');
  // The prose accumulated so far, including deltas not yet painted.
  const bufferRef = useRef('');
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelFlush = useCallback((): void => {
    if (flushTimerRef.current !== null) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      cancelFlush();
    };
  }, [cancelFlush]);

  useEffect(() => {
    if (notice === null) return;
    const id = setInterval(() => {
      const tickedAt = Date.now();
      setNow(tickedAt);
      // Clearing it is what re-enables the controls: nothing else has to watch the clock.
      if (tickedAt >= notice.retryAt) setNotice(null);
    }, COUNTDOWN_TICK_MS);
    return () => clearInterval(id);
  }, [notice]);

  const run = useCallback(
    async (searchTerm: string, keepView: boolean): Promise<void> => {
      if (!searchTerm.trim()) return;
      // The controls are locked while a wait is pending, but Enter in the field still calls
      // this; asking again before `retryAt` only earns the same refusal.
      if (notice !== null) return;

      abortRef.current?.abort();
      cancelFlush();
      bufferRef.current = '';
      const controller = new AbortController();
      abortRef.current = controller;
      lastQueryRef.current = searchTerm;

      // What the previous run left on screen. A retry keeps it until its own run has sent a
      // first event — the server admitted it — so a refused or failed retry takes nothing away.
      let viewCleared = false;
      const clearView = (): void => {
        if (viewCleared) return;
        viewCleared = true;
        setBriefing('');
        setTruncated(false);
        setInterrupted(false);
        setRace('');
        setRaceInfo(null);
        setToolTrace([]);
        setToolPlan([]);
      };

      setLoading(true);
      setLastQuery(searchTerm);
      setError('');
      setStatusMessage('');
      setStep('');
      setStartedAt(Date.now());
      if (!keepView) clearView();

      try {
        const stream = streamBriefing(searchTerm, controller.signal);
        const tools: ToolResult[] = [];

        for await (const event of stream) {
          // A superseded request can surface one last buffered event between the
          // abort and the reader rejecting. Dropping it matters more than it used
          // to: `bufferRef` is shared across requests, so a stale delta would not
          // just paint late, it would prepend itself to the next briefing.
          if (abortRef.current !== controller) break;
          clearView();

          if (event.type === 'status') {
            setStatusMessage(event.data.message);
            setStep(event.data.step);
          } else if (event.type === 'race_info') {
            setRace(event.data.name);
            setRaceInfo(event.data);
          } else if (event.type === 'tool_plan') {
            setToolPlan(event.data.tools);
          } else if (event.type === 'tool_result') {
            tools.push({ tool: event.data.tool, success: event.data.success });
            setToolTrace([...tools]);
          } else if (event.type === 'briefing_delta') {
            bufferRef.current += event.data.content;
            if (flushTimerRef.current === null) {
              flushTimerRef.current = setTimeout(() => {
                flushTimerRef.current = null;
                setBriefing(bufferRef.current);
              }, FLUSH_INTERVAL_MS);
            }
          } else if (event.type === 'briefing') {
            // The terminal event is the authoritative full text, not one more
            // increment: painting it *replaces* the accumulated prose, which is
            // what makes a delta lost to a malformed frame recoverable. It also
            // doubles as the final flush, so pending deltas are never stranded.
            //
            // Nothing reads the buffer after this — deltas always precede the
            // terminal event, and the next submit() resets it — so it is left
            // alone rather than resynced.
            cancelFlush();
            setBriefing(event.data.content);
            setTruncated(Boolean(event.data.truncated));
            setStatusMessage('');
            setStep('');
          } else if (event.type === 'error') {
            // The deadline is keyed on its code, so the page owns its wording; every other
            // error event's message is already written for a reader.
            setError(event.data.code === 'deadline' ? BRIEFING_DEADLINE_ERROR : event.data.message);
          } else if (event.type === 'interrupted') {
            // No terminal event is coming to do the final flush, so this does it: the timer may
            // still be holding the last deltas, and cancelling it unpainted would strand them.
            cancelFlush();
            setBriefing(bufferRef.current);
            setInterrupted(true);
            setStatusMessage('');
            setStep('');
          }
        }
      } catch (err) {
        if (controller.signal.aborted) {
          // Superseded or unmounted: nothing to report.
        } else if (
          err instanceof BriefingRequestError &&
          isRejectionCode(err.code) &&
          err.retryAfterSeconds !== null
        ) {
          // Busy or a limit spent: not a failure, and not worth a console error. A refusal
          // that names no wait cannot drive a countdown, so it falls through to the generic
          // error below rather than locking the page for an unknown time.
          const refusedAt = Date.now();
          setNow(refusedAt);
          setNotice({
            code: err.code,
            retryAt: refusedAt + err.retryAfterSeconds * 1000,
            waitSeconds: err.retryAfterSeconds,
            limit: err.limit,
          });
        } else {
          console.error('Briefing request failed:', err);
          setError(GENERIC_BRIEFING_ERROR);
        }
      } finally {
        if (abortRef.current === controller) {
          setLoading(false);
          setStatusMessage('');
          // Belt-and-braces, not a reachable case: the `briefing` event already clears
          // `step`, and on the error path the loader unmounts in the same batch. Kept
          // because `step` and `statusMessage` are meant to move together — the invariant
          // is the point, not this specific line.
          setStep('');
        }
      }
    },
    [notice, cancelFlush],
  );

  const submit = useCallback(
    (searchQuery?: string): Promise<void> => run(searchQuery ?? query, false),
    [run, query],
  );

  const retry = useCallback((): Promise<void> => run(lastQueryRef.current, true), [run]);

  const retryInSeconds =
    notice === null ? 0 : Math.max(0, Math.ceil((notice.retryAt - now) / 1000));

  return {
    query,
    lastQuery,
    loading,
    race,
    raceInfo,
    briefing,
    truncated,
    interrupted,
    toolTrace,
    toolPlan,
    error,
    statusMessage,
    step,
    startedAt,
    notice,
    retryInSeconds,
    setQuery,
    submit,
    retry,
  };
}
