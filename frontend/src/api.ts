/**
 * Hermes Agent Studio - Frontend API Client
 * Provides strictly-typed REST fetch wrappers and Server-Sent Event (SSE) streaming utilities.
 */

export const API_BASE = 'http://127.0.0.1:8790/api';

export function getAuthToken(): string | null {
  return localStorage.getItem('hermes_token');
}

export function setAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem('hermes_token', token);
  } else {
    localStorage.removeItem('hermes_token');
  }
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> || {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    let errorMessage = await response.text();
    try {
      const parsed = JSON.parse(errorMessage);
      errorMessage = parsed.detail || parsed.message || errorMessage;
    } catch {
      // Keep raw string
    }
    throw new Error(errorMessage || `Request failed with status ${response.status}`);
  }

  return response.json();
}

export interface StreamCallbacks {
  onToken?: (token: string) => void;
  onMeta?: (meta: any) => void;
  onAction?: (action: any) => void;
  onError?: (error: string) => void;
  onDone?: () => void;
}

export async function stream(
  path: string,
  body: any,
  callbacksOrTokenHandler: ((token: string) => void) | StreamCallbacks
): Promise<void> {
  const callbacks: StreamCallbacks = typeof callbacksOrTokenHandler === 'function'
    ? { onToken: callbacksOrTokenHandler }
    : callbacksOrTokenHandler;

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text();
    let msg = errText;
    try {
      msg = JSON.parse(errText).detail || errText;
    } catch {}
    if (callbacks.onError) callbacks.onError(msg);
    throw new Error(msg);
  }

  // If response is regular JSON (e.g. direct NLP action taken by Help Bot)
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json();
    if (callbacks.onAction) callbacks.onAction(data);
    if (callbacks.onDone) callbacks.onDone();
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('ReadableStream not supported by browser.');

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const part of parts) {
        const line = part.split('\n').find(l => l.startsWith('data:'));
        if (!line) continue;

        try {
          const event = JSON.parse(line.slice(5).trim());
          if (event.type === 'token' && callbacks.onToken) {
            callbacks.onToken(event.text);
          } else if (event.type === 'meta' && callbacks.onMeta) {
            callbacks.onMeta(event);
          } else if (event.type === 'error' && callbacks.onError) {
            callbacks.onError(event.message);
          } else if (event.type === 'done' && callbacks.onDone) {
            callbacks.onDone();
          }
        } catch {
          // Ignore partial or unparsable frames
        }
      }
    }
  } finally {
    if (callbacks.onDone) callbacks.onDone();
  }
}

// ==========================================
// Strongly-Typed API Helpers & Contracts
// ==========================================

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  name: string;
  settings: Record<string, any>;
  created_at?: string;
}

export interface ScheduleItem {
  id: string;
  user_id: string;
  agent_id: string;
  name: string;
  cron_expression: string;
  task_prompt: string;
  enabled: boolean;
  last_run?: string;
  next_run?: string;
  last_status: string;
  last_run_id?: string;
  last_result?: string;
  created_at?: string;
}

export interface ObsidianNote {
  name: string;
  title: string;
  size: number;
  mtime: string;
  preview: string;
}

export const authApi = {
  getMe: () => api<UserProfile>('/auth/me'),
  login: (username_or_email: string, password: string) =>
    api<{ status: string; token: string; user: UserProfile }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username_or_email, password })
    }),
  signup: (username: string, email: string, password: string, name?: string) =>
    api<{ status: string; token: string; user: UserProfile }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, name })
    }),
  updateSettings: (name?: string, settings?: Record<string, any>) =>
    api<UserProfile>('/auth/settings', {
      method: 'PATCH',
      body: JSON.stringify({ name, settings })
    }),
  logout: () => {
    setAuthToken(null);
    return api('/auth/logout', { method: 'POST' });
  }
};

export const scheduleApi = {
  list: () => api<ScheduleItem[]>('/schedules'),
  create: (data: { agent_id: string; name: string; cron_expression: string; task_prompt: string; enabled?: boolean }) =>
    api<ScheduleItem>('/schedules', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, patch: Partial<ScheduleItem>) =>
    api<ScheduleItem>(`/schedules/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  delete: (id: string) => api(`/schedules/${id}`, { method: 'DELETE' }),
  runNow: (id: string) => api<{ status: string; run_id: string; schedule_id: string }>(`/schedules/${id}/run-now`, { method: 'POST' })
};

export const obsidianApi = {
  getInfo: () => api<{ vault_path: string; note_count: number; total_bytes: number; is_custom: boolean }>('/obsidian/vault-info'),
  listNotes: () => api<ObsidianNote[]>('/obsidian/notes'),
  getNote: (name: string) => api<{ name: string; content: string; path: string }>(`/obsidian/notes/${encodeURIComponent(name)}`),
  saveNote: (title: string, content: string, tags?: string[]) =>
    api<{ status: string; name: string; path: string }>('/obsidian/notes', {
      method: 'POST',
      body: JSON.stringify({ title, content, tags })
    }),
  deleteNote: (name: string) => api(`/obsidian/notes/${encodeURIComponent(name)}`, { method: 'DELETE' })
};
