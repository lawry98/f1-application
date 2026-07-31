'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { streamBriefing } from '@/lib/api';
import { GENERIC_BRIEFING_ERROR } from '@/lib/constants';
import type { ToolResult } from '@/types';

export interface BriefingState {
  query: string;
  loading: boolean;
  race: string;
  briefing: string;
  toolTrace: ToolResult[];
  error: string;
  statusMessage: string;
}

export interface UseBriefingReturn extends BriefingState {
  setQuery: (query: string) => void;
  submit: (searchQuery?: string) => Promise<void>;
}

export function useBriefing(): UseBriefingReturn {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [race, setRace] = useState('');
  const [briefing, setBriefing] = useState('');
  const [toolTrace, setToolTrace] = useState<ToolResult[]>([]);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const submit = useCallback(
    async (searchQuery?: string): Promise<void> => {
      const searchTerm = searchQuery ?? query;
      if (!searchTerm.trim()) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError('');
      setBriefing('');
      setRace('');
      setToolTrace([]);
      setStatusMessage('');

      try {
        const stream = streamBriefing(searchTerm, controller.signal);
        const tools: ToolResult[] = [];

        for await (const event of stream) {
          if (event.type === 'status') {
            setStatusMessage(event.data.message);
          } else if (event.type === 'race_info') {
            setRace(event.data.name);
          } else if (event.type === 'tool_result') {
            tools.push({ tool: event.data.tool, success: event.data.success });
            setToolTrace([...tools]);
          } else if (event.type === 'briefing') {
            setBriefing(event.data.content);
            setStatusMessage('');
          } else if (event.type === 'error') {
            setError(event.data.message);
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error('Briefing request failed:', err);
          setError(GENERIC_BRIEFING_ERROR);
        }
      } finally {
        if (abortRef.current === controller) {
          setLoading(false);
          setStatusMessage('');
        }
      }
    },
    [query],
  );

  return {
    query,
    loading,
    race,
    briefing,
    toolTrace,
    error,
    statusMessage,
    setQuery,
    submit,
  };
}
