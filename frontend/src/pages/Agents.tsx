import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus, Search, Bot, Play, Square, Edit, Copy, Trash2,
  Sparkles, Shield, Wrench, RefreshCw, AlertCircle, CheckCircle2,
  SlidersHorizontal, TerminalSquare
} from 'lucide-react';
import { api } from '../api';

interface AgentItem {
  id: string;
  name: string;
  goal: string;
  system_prompt: string;
  tone: string;
  model: string;
  autonomy: string;
  tools: string[];
  workflow: any;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export default function Agents() {
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'idle'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<AgentItem | null>(null);
  const navigate = useNavigate();

  const loadAgents = async () => {
    setIsLoading(true);
    try {
      const data = await api<AgentItem[]>('/agents');
      setAgents(data);
    } catch (e) {
      console.error('Failed to load agents', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const toggleRun = async (agent: AgentItem) => {
    setProcessingId(agent.id);
    const action = agent.enabled ? 'stop' : 'run';
    try {
      await api(`/agents/${agent.id}/${action}`, { method: 'POST', body: '{}' });
      await loadAgents();
    } catch (e: any) {
      alert(`Could not ${action} agent: ${e.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleClone = async (agent: AgentItem) => {
    setProcessingId(agent.id);
    try {
      const cloned = await api<AgentItem>(`/agents/${agent.id}/clone`, { method: 'POST' });
      await loadAgents();
      navigate(`/agents/${cloned.id}`);
    } catch (e: any) {
      alert(`Clone failed: ${e.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteCandidate) return;
    try {
      await api(`/agents/${deleteCandidate.id}`, { method: 'DELETE' });
      setDeleteCandidate(null);
      await loadAgents();
    } catch (e: any) {
      alert(`Delete failed: ${e.message}`);
    }
  };

  const filtered = agents.filter(a => {
    const matchesSearch =
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.goal.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.model || '').toLowerCase().includes(searchQuery.toLowerCase());

    if (statusFilter === 'running') return matchesSearch && a.enabled;
    if (statusFilter === 'idle') return matchesSearch && !a.enabled;
    return matchesSearch;
  });

  const runningCount = agents.filter(a => a.enabled).length;

  return (
    <>
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span className="eyebrow">Local Agent Fleet</span>
          <h2>Autonomous AI Agents</h2>
          <p>
            Manage multi-agent instances on the same loaded model. Each agent has an isolated prompt, personality tone,
            distinct tools, and a unique UUID ID for precise Control Bot commands.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="secondary" onClick={loadAgents} title="Refresh fleet">
            <RefreshCw size={15} /> Refresh
          </button>
          <Link className="primary" to="/agents/new" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={16} /> Create Agent
          </Link>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', margin: '24px 0', flexWrap: 'wrap' }}>
        <div className="searchbar" style={{ flex: 1, minWidth: '280px', display: 'flex', alignItems: 'center', gap: '8px', background: '#1E1F22', border: '1px solid #333', borderRadius: '8px', padding: '10px 14px' }}>
          <Search size={16} color="#888" />
          <input
            placeholder="Search agents by name, goal, ID, or model..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ border: 'none', background: 'transparent', color: '#fff', width: '100%', outline: 'none' }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer' }}>✕</button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '6px', background: '#1E1F22', padding: '4px', borderRadius: '8px', border: '1px solid #333' }}>
          <button
            className={`secondary ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
            style={{ padding: '6px 14px', fontSize: '13px', background: statusFilter === 'all' ? '#5865F2' : 'transparent', color: '#fff' }}
          >
            All ({agents.length})
          </button>
          <button
            className={`secondary ${statusFilter === 'running' ? 'active' : ''}`}
            onClick={() => setStatusFilter('running')}
            style={{ padding: '6px 14px', fontSize: '13px', background: statusFilter === 'running' ? '#5865F2' : 'transparent', color: '#fff' }}
          >
            Running ({runningCount})
          </button>
          <button
            className={`secondary ${statusFilter === 'idle' ? 'active' : ''}`}
            onClick={() => setStatusFilter('idle')}
            style={{ padding: '6px 14px', fontSize: '13px', background: statusFilter === 'idle' ? '#5865F2' : 'transparent', color: '#fff' }}
          >
            Idle ({agents.length - runningCount})
          </button>
        </div>
      </div>

      {/* Agents Cards Grid */}
      {isLoading && agents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#888' }}>
          <RefreshCw size={32} className="spin" style={{ marginBottom: '12px', color: '#5865F2' }} />
          <div>Loading Agent Fleet...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#1E1F22', border: '1px dashed #333', borderRadius: '12px' }}>
          <Bot size={48} color="#5865F2" style={{ marginBottom: '16px' }} />
          <h3 style={{ margin: '0 0 8px 0', color: '#fff' }}>No agents match your criteria</h3>
          <p style={{ color: '#888', margin: '0 0 20px 0' }}>
            {searchQuery ? 'Try clearing your search query.' : 'Create your first local agent to begin automating workflows.'}
          </p>
          <Link className="primary" to="/agents/new" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px' }}>
            <Plus size={16} /> Create Agent
          </Link>
        </div>
      ) : (
        <div className="cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
          {filtered.map(agent => (
            <div
              className="agent card-hover"
              key={agent.id}
              style={{
                background: '#1E1F22',
                border: agent.enabled ? '1px solid #57F287' : '1px solid #333',
                borderRadius: '12px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                transition: 'border 0.2s, box-shadow 0.2s'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div style={{ background: agent.enabled ? 'rgba(87, 242, 135, 0.15)' : '#2B2D31', padding: '10px', borderRadius: '8px', color: agent.enabled ? '#57F287' : '#5865F2' }}>
                    <Bot size={22} />
                  </div>
                  <div>
                    <b style={{ fontSize: '17px', color: '#fff', display: 'block' }}>{agent.name}</b>
                    <small className="mono" style={{ color: '#888', fontSize: '12px' }}>
                      UUID: <span style={{ color: '#5865F2' }}>{agent.id}</span>
                    </small>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    className={agent.enabled ? 'dot on' : 'dot'}
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: agent.enabled ? '#57F287' : '#666',
                      boxShadow: agent.enabled ? '0 0 10px #57F287' : 'none'
                    }}
                  />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: agent.enabled ? '#57F287' : '#888' }}>
                    {agent.enabled ? 'RUNNING' : 'IDLE'}
                  </span>
                </div>
              </div>

              <p style={{ color: '#B5BAC1', fontSize: '14px', lineHeight: 1.5, margin: '0 0 16px 0', flexGrow: 1 }}>
                {agent.goal || 'No specific objective configured.'}
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
                <span style={{ background: '#2B2D31', color: '#fff', padding: '4px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 500 }}>
                  Tone: {agent.tone.replace('_', ' ')}
                </span>
                <span style={{ background: '#2B2D31', color: '#fff', padding: '4px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 500 }}>
                  <Shield size={12} style={{ display: 'inline', marginRight: '4px' }} />
                  {agent.autonomy}
                </span>
                <span style={{ background: '#2B2D31', color: '#fff', padding: '4px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 500 }}>
                  <Wrench size={12} style={{ display: 'inline', marginRight: '4px' }} />
                  {agent.tools.length} Tools
                </span>
                {agent.model && (
                  <span style={{ background: '#2B2D31', color: '#B5BAC1', padding: '4px 10px', borderRadius: '4px', fontSize: '12px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {agent.model}
                  </span>
                )}
              </div>

              {/* Action Buttons Row */}
              <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '14px', borderTop: '1px solid #2B2D31' }}>
                <button
                  className="secondary"
                  onClick={() => toggleRun(agent)}
                  disabled={processingId === agent.id}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    fontWeight: 600,
                    background: agent.enabled ? 'rgba(237, 66, 69, 0.15)' : 'rgba(87, 242, 135, 0.15)',
                    color: agent.enabled ? '#ED4245' : '#57F287',
                    border: `1px solid ${agent.enabled ? '#ED4245' : '#57F287'}`
                  }}
                >
                  {agent.enabled ? <Square size={14} /> : <Play size={14} />}
                  {processingId === agent.id ? 'Wait...' : (agent.enabled ? 'Stop' : 'Run')}
                </button>

                <Link
                  className="secondary"
                  to={`/agents/${agent.id}`}
                  style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none', color: '#fff' }}
                  title="Edit agent pipeline"
                >
                  <Edit size={14} />
                </Link>

                <button
                  className="secondary"
                  onClick={() => handleClone(agent)}
                  style={{ padding: '8px 12px' }}
                  title="Duplicate agent"
                >
                  <Copy size={14} />
                </button>

                <button
                  className="secondary"
                  onClick={() => setDeleteCandidate(agent)}
                  style={{ padding: '8px 12px', color: '#ED4245' }}
                  title="Delete agent"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteCandidate && (
        <div className="overlay" onClick={() => setDeleteCandidate(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ background: 'rgba(237, 66, 69, 0.2)', padding: '12px', borderRadius: '50%', color: '#ED4245' }}>
                <AlertCircle size={24} />
              </div>
              <div>
                <h3 style={{ margin: 0 }}>Delete Agent?</h3>
                <p style={{ margin: '4px 0 0 0', color: '#888', fontSize: '13px' }}>
                  Are you sure you want to delete <strong>{deleteCandidate.name}</strong> ({deleteCandidate.id})? This will also remove all its execution audit logs.
                </p>
              </div>
            </div>

            <div className="actions right" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
              <button className="secondary" onClick={() => setDeleteCandidate(null)}>Cancel</button>
              <button
                className="primary"
                onClick={handleDelete}
                style={{ background: '#ED4245', border: 'none' }}
              >
                Delete Agent
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
