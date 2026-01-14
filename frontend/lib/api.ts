const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface BriefingResponse {
  race: string;
  briefing: string;
  tool_trace: Array<{
    tool: string;
    success: boolean;
    summary: string;
  }>;
}

export interface Race {
  name: string;
  location: string;
  country: string;
  date: string;
  round: number | null;
}

export async function generateBriefing(query: string): Promise<BriefingResponse> {
  const response = await fetch(`${API_BASE_URL}/api/briefing`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error('Failed to generate briefing');
  }

  return response.json();
}

export async function getRaces(year: number): Promise<Race[]> {
  const response = await fetch(`${API_BASE_URL}/api/races/${year}`);

  if (!response.ok) {
    throw new Error('Failed to fetch races');
  }

  const data = await response.json();
  return data.races;
}

export interface StreamEvent {
  type: 'status' | 'race_info' | 'tool_result' | 'briefing' | 'complete' | 'error';
  data: any;
}

export async function* streamBriefing(query: string): AsyncGenerator<StreamEvent> {
  const response = await fetch(`${API_BASE_URL}/api/briefing/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error('Failed to start briefing stream');
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) {
    throw new Error('No response body');
  }

  const buffer: string[] = [];
  let eventType = '';

  while (true) {
    const { done, value } = await reader.read();
    
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    buffer.push(chunk);
    
    const lines = buffer.join('').split('\n');
    buffer.length = 0;

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventType = line.substring(6).trim();
        continue;
      }
      
      if (line.startsWith('data:')) {
        const dataStr = line.substring(5).trim();
        
        if (dataStr) {
          try {
            const data = JSON.parse(dataStr);
            
            if (data.step) {
              yield { type: 'status', data };
            } else if (data.name) {
              yield { type: 'race_info', data };
            } else if (data.tool) {
              yield { type: 'tool_result', data };
            } else if (data.content) {
              yield { type: 'briefing', data };
            } else if (data.message === 'Briefing complete') {
              yield { type: 'complete', data };
            } else if (data.message && eventType !== 'status') {
              yield { type: 'error', data };
            }
          } catch (e) {
            buffer.push(line);
          }
        }
      } else if (line.trim()) {
        buffer.push(line);
      }
    }
  }
}
