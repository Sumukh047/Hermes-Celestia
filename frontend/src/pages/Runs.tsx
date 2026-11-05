import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import {
  PlayCircle, RefreshCw, Search, CheckCircle2, AlertTriangle,
  Clock, Zap, Terminal, Activity, ArrowRight, Trash2, Eye, Filter
} from 'lucide-react';

interface RunItem {
  id: string;
  agent_id: string;
  status: 'running' | 'completed' | 'failed' | 'stopped' | 'queued';
  duration_ms: number;
  tokens: number;
  tool_calls: number;
  started_at: string;
  finished_at?: string;
  result?: string;
  error?: string;
}

interface RunEventItem {
  id: number;
  ts: string;
  kind: string;
  message: string;
  payload: any;
}

export default function Runs({ analytics = false }: { analytics?: boolean }) {
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [agents, setAgents] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRun, setSelectedRun] = useState<RunItem | null>(null);
  const [events, setEvents] = useState<RunEventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [runsData, agentsData] = await Promise.all([
        api<RunItem[]>('/runs'),
        api<any[]>('/agents').catch(() => [])
      ]);
      setRuns(runsData);
      const agentMap: Record<string, string> = {};
      for (const a of agentsData) {
        agentMap[a.id] = a.name;
      }
      setAgents(agentMap);
    } catch (e) {
      console.error('Failed to load runs', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, []);

  const openRunDetails = async (run: RunItem) => {
    setSelectedRun(run);
    setIsLoadingEvents(true);
    try {
      const evs = await api<RunEventItem[]>(`/runs/${run.id}/events`);
      setEvents(evs);
    } catch (e) {
      console.error('Failed to load run events', e);
      setEvents([]);
    } finally {
      setIsLoadingEvents(false);
    }
  };

  const handleDeleteRun = async (runId: string) => {
    try {
      await api(`/runs/${runId}`, { method: 'DELETE' });
      if (selectedRun?.id === runId) setSelectedRun(null);
      await loadData();
    } catch (e: any) {
      alert(`Could not delete run: ${e.message}`);
    }
  };

  const filteredRuns = runs.filter(r => {
    const agentName = agents[r.agent_id] || '';
    const matchesSearch =
      r.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.agent_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agentName.toLowerCase().includes(searchQuery.toLowerCase());

    if (statusFilter === 'all') return matchesSearch;
    return matchesSearch && r.status === statusFilter;
  });

  // Analytics Computations
  const totalTokens = runs.reduce((acc, r) => acc + (r.tokens || 0), 0);
  const totalToolCalls = runs.reduce((acc, r) => acc + (r.tool_calls || 0), 0);
  const completedRuns = runs.filter(r => r.status === 'completed').length;
  const successRate = runs.length > 0 ? Math.round((completedRuns / runs.length) * 100) : 0;
  const avgDurationMs = runs.length > 0
    ? Math.round(runs.reduce((acc, r) => acc + (r.duration_ms || 0), 0) / runs.length)
    : 0;

  return (
    <>
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span className="eyebrow">{analytics ? 'Telemetry & Analytics' : 'Observability'}</span>
          <h2>{analytics ? 'Fleet Analytics & Token Metrics' : 'Agent Execution History & Audit Logs'}</h2>
          <p>
            Immutable event audit logs and X-Ray execution traces captured by the local runtime environment.
          </p>
        </div>
        <button className="secondary" onClick={loadData} disabled={isLoading} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <RefreshCw size={15} className={isLoading ? 'spin' : ''} />
          Refresh Runs
        </button>
      </div>

      {/* Analytics KPI Summary Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', margin: '24px 0' }}>
        <div style={{ background: '#1E1F22', border: '1px solid #333', borderRadius: '12px', padding: '20px' }}>
          <div style={{ color: '#888', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Total Invocations</div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#fff' }}>{runs.length}</div>
        </div>
        <div style={{ background: '#1E1F22', border: '1px solid #333', borderRadius: '12px', padding: '20px' }}>
          <div style={{ color: '#888', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Execution Success Rate</div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#57F287' }}>{successRate}%</div>
        </div>
        <div style={{ background: '#1E1F22', border: '1px solid #333', borderRadius: '12px', padding: '20px' }}>
          <div style={{ color: '#888', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Total Compute Tokens</div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#FEE75C' }}>{totalTokens.toLocaleString()}</div>
        </div>
        <div style={{ background: '#1E1F22', border: '1px solid #333', borderRadius: '12px', padding: '20px' }}>
          <div style={{ color: '#888', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Tool Executions</div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#EB459E' }}>{totalToolCalls.toLocaleString()}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '280px', display: 'flex', alignItems: 'center', gap: '8px', background: '#1E1F22', border: '1px solid #333', borderRadius: '8px', padding: '10px 14px' }}>
          <Search size={16} color="#888" />
          <input
            placeholder="Search by Run ID, Agent Name, or Agent UUID..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ border: 'none', background: 'transparent', color: '#fff', width: '100%', outline: 'none' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '6px', background: '#1E1F22', padding: '4px', borderRadius: '8px', border: '1px solid #333' }}>
          {['all', 'completed', 'running', 'failed', 'stopped'].map(st => (
            <button
              key={st}
              className={`secondary ${statusFilter === st ? 'active' : ''}`}
              onClick={() => setStatusFilter(st)}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                textTransform: 'capitalize',
                background: statusFilter === st ? '#5865F2' : 'transparent',
                color: '#fff'
              }}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Runs Table */}
      <div className="table" style={{ background: '#1E1F22', border: '1px solid #333', borderRadius: '12px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#2B2D31', borderBottom: '1px solid #383A40' }}>
              <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 600, color: '#B5BAC1', textTransform: 'uppercase' }}>Run ID</th>
              <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 600, color: '#B5BAC1', textTransform: 'uppercase' }}>Agent</th>
              <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 600, color: '#B5BAC1', textTransform: 'uppercase' }}>Status</th>
              <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 600, color: '#B5BAC1', textTransform: 'uppercase' }}>Tools</th>
              <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 600, color: '#B5BAC1', textTransform: 'uppercase' }}>Tokens</th>
              <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 600, color: '#B5BAC1', textTransform: 'uppercase' }}>Duration</th>
              <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 600, color: '#B5BAC1', textTransform: 'uppercase' }}>Started</th>
              <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 600, color: '#B5BAC1', textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRuns.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#888' }}>
                  No execution runs found.
                </td>
              </tr>
            ) : (
              filteredRuns.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #2B2D31', cursor: 'pointer' }} onClick={() => openRunDetails(r)}>
                  <td className="mono" style={{ padding: '14px 16px', fontSize: '13px', color: '#5865F2' }}>{r.id}</td>
                  <td style={{ padding: '14px 16px', fontWeight: 500, color: '#fff' }}>
                    {agents[r.agent_id] || `Agent [${r.agent_id}]`}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <StatusBadge status={r.status} />
                  </td>
                  <td style={{ padding: '14px 16px', color: '#B5BAC1' }}>{r.tool_calls || 0}</td>
                  <td style={{ padding: '14px 16px', color: '#B5BAC1' }}>{r.tokens ? r.tokens.toLocaleString() : 0}</td>
                  <td style={{ padding: '14px 16px', color: '#B5BAC1' }}>
                    {r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : '---'}
                  </td>
                  <td style={{ padding: '14px 16px', color: '#888', fontSize: '13px' }}>
                    {new Date(r.started_at).toLocaleTimeString()}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                    <button
                      className="secondary"
                      onClick={() => openRunDetails(r)}
                      style={{ padding: '6px 10px', marginRight: '6px' }}
                      title="Inspect Run X-Ray"
                    >
                      <Eye size={13} /> Inspect
                    </button>
                    <button
                      className="secondary"
                      onClick={() => handleDeleteRun(r.id)}
                      style={{ padding: '6px 10px', color: '#ED4245' }}
                      title="Delete run record"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Run Inspection Modal (X-Ray Event Timeline) */}
      {selectedRun && (
        <div className="overlay" onClick={() => setSelectedRun(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #333', paddingBottom: '14px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Terminal size={20} color="#5865F2" /> Run X-Ray: {selectedRun.id}
                </h3>
                <small style={{ color: '#888' }}>
                  Agent: <strong>{agents[selectedRun.agent_id] || selectedRun.agent_id}</strong> &middot; {selectedRun.started_at}
                </small>
              </div>
              <button className="secondary" onClick={() => setSelectedRun(null)}>✕</button>
            </div>

            {/* Run Stats Ribbon */}
            <div style={{ display: 'flex', gap: '16px', background: '#111', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px' }}>
              <div>Status: <StatusBadge status={selectedRun.status} /></div>
              <div style={{ color: '#fff' }}>Tokens: <strong>{selectedRun.tokens}</strong></div>
              <div style={{ color: '#fff' }}>Tool Invocations: <strong>{selectedRun.tool_calls}</strong></div>
              <div style={{ color: '#fff' }}>Duration: <strong>{(selectedRun.duration_ms / 1000).toFixed(1)}s</strong></div>
            </div>

            {/* Event Timeline */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontWeight: 600, color: '#aaa', fontSize: '13px', textTransform: 'uppercase' }}>Execution Event Log</div>

              {isLoadingEvents ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#888' }}>Loading timeline events...</div>
              ) : events.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#888', background: '#111', borderRadius: '8px' }}>
                  No intermediate event traces recorded for this run.
                </div>
              ) : (
                events.map(ev => (
                  <div
                    key={ev.id}
                    style={{
                      background: '#2B2D31',
                      borderLeft: `4px solid ${getEventColor(ev.kind)}`,
                      padding: '12px 14px',
                      borderRadius: '0 6px 6px 0',
                      fontSize: '13px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 700, color: getEventColor(ev.kind), textTransform: 'uppercase', fontSize: '11px' }}>
                        {ev.kind}
                      </span>
                      <span style={{ color: '#888', fontSize: '11px' }}>
                        {new Date(ev.ts).toLocaleTimeString()}
                      </span>
                    </div>
                    <div style={{ color: '#fff', lineHeight: 1.5 }}>{ev.message}</div>
                    {ev.payload && Object.keys(ev.payload).length > 0 && (
                      <pre style={{ margin: '8px 0 0 0', background: '#111', padding: '8px', borderRadius: '4px', fontSize: '11px', color: '#B5BAC1', overflowX: 'auto' }}>
                        {JSON.stringify(ev.payload, null, 2)}
                      </pre>
                    )}
                  </div>
                ))
              )}

              {/* Final Agent Response Box */}
              {selectedRun.result && (
                <div style={{ marginTop: '16px', background: '#111', border: '1px solid #333', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#57F287', textTransform: 'uppercase', marginBottom: '8px' }}>
                    Final Assistant Output
                  </div>
                  <div style={{ color: '#fff', fontSize: '14px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {selectedRun.result}
                  </div>
                </div>
              )}

              {selectedRun.error && (
                <div style={{ marginTop: '16px', background: 'rgba(237, 66, 69, 0.15)', border: '1px solid #ED4245', borderRadius: '8px', padding: '16px', color: '#ED4245' }}>
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>Fatal Error Message</div>
                  <div>{selectedRun.error}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  let bg = '#333';
  let color = '#fff';

  switch (status) {
    case 'completed': bg = 'rgba(87, 242, 135, 0.15)'; color = '#57F287'; break;
    case 'failed': bg = 'rgba(237, 66, 69, 0.15)'; color = '#ED4245'; break;
    case 'running': bg = 'rgba(88, 101, 242, 0.15)'; color = '#5865F2'; break;
    case 'stopped': bg = 'rgba(254, 231, 92, 0.15)'; color = '#FEE75C'; break;
  }

  return (
    <span style={{
      background: bg,
      color,
      padding: '4px 10px',
      borderRadius: '100px',
      fontSize: '11px',
      fontWeight: 700,
      textTransform: 'uppercase',
      display: 'inline-block'
    }}>
      {status}
    </span>
  );
}

function getEventColor(kind: string): string {
  switch (kind) {
    case 'status': return '#5865F2';
    case 'tool_start': return '#EB459E';
    case 'tool_result': return '#57F287';
    case 'approval_required': return '#FEE75C';
    case 'error': return '#ED4245';
    case 'simulation': return '#99AAB5';
    default: return '#5865F2';
  }
}
