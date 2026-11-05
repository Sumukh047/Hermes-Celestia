import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
  Plus, ArrowRight, Sparkles, Activity, Clock, Cpu, 
  TerminalSquare, Server, AlertTriangle, CheckCircle2, PieChart as PieChartIcon 
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell
} from 'recharts';
import { api } from '../api';

// Types for better robustness
interface AgentData {
  id: string;
  name: string;
  enabled: boolean;
  goal: string;
  tone: string;
  tools: string[];
  model: string;
  created_at?: string;
  updated_at?: string;
}

interface RunData {
  id: string;
  agent_id: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  duration_ms: number;
  tokens: number;
  tool_calls: number;
  started_at: string;
  error?: string;
}

interface HealthData {
  lmstudio?: { connected: boolean };
  app?: string;
  hermes?: any;
}

const COLORS = ['#5865F2', '#EB459E', '#57F287', '#FEE75C', '#ED4245'];

export default function Dashboard() {
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [runs, setRuns] = useState<RunData[]>([]);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [aData, rData, hData] = await Promise.all([
        api<AgentData[]>('/agents').catch(() => []),
        api<RunData[]>('/runs').catch(() => []),
        api<HealthData>('/health').catch(() => ({}))
      ]);
      setAgents(aData);
      setRuns(rData);
      setHealth(hData);
    } catch (e: any) {
      setError(e.message || "Failed to load dashboard data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Auto-refresh the dashboard every 30 seconds for live monitoring
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Compute metrics for charts safely
  const chartData = useMemo(() => {
    if (!runs || runs.length === 0) return [];
    
    // Group runs by date (ignoring time) to build a time-series
    const grouped = runs.reduce((acc, run) => {
      const date = new Date(run.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      if (!acc[date]) {
        acc[date] = { date, tokens: 0, tool_calls: 0, runs: 0 };
      }
      acc[date].tokens += (run.tokens || 0);
      acc[date].tool_calls += (run.tool_calls || 0);
      acc[date].runs += 1;
      return acc;
    }, {} as Record<string, any>);

    // Convert back to array and sort by chronological order (approx based on keys)
    return Object.values(grouped).reverse().slice(-10); // Last 10 days of data
  }, [runs]);

  const statusPieData = useMemo(() => {
    if (!runs || runs.length === 0) return [];
    const counts = runs.reduce((acc, run) => {
      acc[run.status] = (acc[run.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [runs]);

  // General KPIs
  const activeAgentsCount = agents.filter(x => x.enabled).length;
  const totalToolCalls = runs.reduce((acc, r) => acc + (r.tool_calls || 0), 0);
  const totalTokens = runs.reduce((acc, r) => acc + (r.tokens || 0), 0);
  const isOnline = !!health?.lmstudio?.connected;

  if (isLoading && agents.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px', flexDirection: 'column', gap: '16px' }}>
        <Sparkles size={32} className="spin" color="#5865F2" />
        <p style={{ color: '#888' }}>Initializing Analytics Workspace...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-container" style={{ animation: 'fadeIn 0.5s ease-out' }}>
      {/* Hero Banner Section */}
      <div className="hero" style={{ background: 'linear-gradient(145deg, #1A1B1E, #232529)', borderRadius: '12px', border: '1px solid #333', padding: '40px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '600px' }}>
          <span className="badge" style={{ alignSelf: 'flex-start', background: '#303238', padding: '4px 10px', borderRadius: '100px', fontSize: '11px', letterSpacing: '1px', color: '#B5BAC1', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={12} color="#5865F2" /> VISUAL AI AGENT WORKBENCH
          </span>
          <h2 style={{ fontSize: '36px', margin: 0, fontWeight: 800, lineHeight: 1.2 }}>Build, run and understand your AI agents.</h2>
          <p style={{ color: '#B5BAC1', fontSize: '16px', lineHeight: 1.6, margin: 0 }}>
            {"Orchestrate complex natural language workflows. Give each agent its own unique UUID, specialized persona, and secure sandbox permissions \u2014 all powered locally via LM Studio."}
          </p>
          <div className="actions" style={{ marginTop: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Link 
              className="primary" 
              to="/agents/new" 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                padding: '12px 20px', 
                fontSize: '14px', 
                borderRadius: '8px', 
                background: '#5865F2', 
                color: '#fff', 
                fontWeight: 700,
                textDecoration: 'none'
              }}
            >
              <Plus size={16}/> Create Agent with AI
            </Link>
            <Link 
              className="secondary" 
              to="/help" 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                padding: '12px 20px', 
                fontSize: '14px', 
                borderRadius: '8px',
                background: '#1E1F22',
                border: '1px solid #333',
                color: '#fff',
                fontWeight: 600,
                textDecoration: 'none'
              }}
            >
              Open Control Bot <ArrowRight size={16} />
            </Link>
            <Link 
              className="secondary" 
              to="/multimodal" 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                padding: '12px 18px', 
                fontSize: '14px', 
                borderRadius: '8px',
                background: '#2B2D31',
                border: '1px solid #4E5058',
                color: '#fff',
                fontWeight: 600,
                textDecoration: 'none'
              }}
            >
              <Sparkles size={16} color="#EB459E" /> Multimodal Inference
            </Link>
            <Link 
              className="secondary" 
              to="/scheduler" 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                padding: '12px 18px', 
                fontSize: '14px', 
                borderRadius: '8px',
                background: '#2B2D31',
                border: '1px solid #4E5058',
                color: '#fff',
                fontWeight: 600,
                textDecoration: 'none'
              }}
            >
              <Clock size={16} color="#57F287" /> Automations
            </Link>
          </div>
        </div>
        
        {/* Right side artistic element */}
        <div className="hero-core" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px', opacity: 0.8 }}>
          <div style={{ padding: '24px', background: '#2B2D31', borderRadius: '50%', boxShadow: '0 0 40px rgba(88,101,242,0.2)' }}>
            <Server size={48} color="#5865F2" />
          </div>
          <div style={{ display: 'flex', gap: '16px', fontWeight: 600, color: '#B5BAC1', fontSize: '14px', letterSpacing: '2px' }}>
            <span>THINK</span> &rarr; <span>ACT</span> &rarr; <span>OBSERVE</span>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ margin: '24px 0', padding: '16px', background: 'rgba(237, 66, 69, 0.1)', border: '1px solid #ED4245', borderRadius: '8px', color: '#ED4245', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <AlertTriangle size={18} /> {error}
        </div>
      )}

      {/* KPI Stats Row */}
      <div className="stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', margin: '32px 0' }}>
        <StatCard icon={<Cpu />} label="Local LM Studio" value={isOnline ? 'ONLINE' : 'OFFLINE'} color={isOnline ? '#57F287' : '#ED4245'} />
        <StatCard icon={<Activity />} label="Active Agents" value={activeAgentsCount} color="#5865F2" />
        <StatCard icon={<TerminalSquare />} label="Total Tool Executions" value={totalToolCalls} color="#EB459E" />
        <StatCard icon={<Clock />} label="Compute Tokens Generated" value={totalTokens.toLocaleString()} color="#FEE75C" />
      </div>

      {/* Analytics Charts Section */}
      {runs.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', marginBottom: '40px' }}>
          <div className="card" style={{ padding: '24px', background: '#1E1F22', border: '1px solid #333', borderRadius: '12px' }}>
            <h3 style={{ margin: '0 0 24px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={18} /> Token Generation Over Time
            </h3>
            <div style={{ height: '280px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#5865F2" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#5865F2" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis dataKey="date" stroke="#888" tick={{ fill: '#888', fontSize: 12 }} />
                  <YAxis stroke="#888" tick={{ fill: '#888', fontSize: 12 }} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: '#2B2D31', border: '1px solid #444', borderRadius: '8px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Area type="monotone" dataKey="tokens" stroke="#5865F2" fillOpacity={1} fill="url(#colorTokens)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card" style={{ padding: '24px', background: '#1E1F22', border: '1px solid #333', borderRadius: '12px' }}>
            <h3 style={{ margin: '0 0 24px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <PieChartIcon size={18} /> Run Status Distribution
            </h3>
            <div style={{ height: '280px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {statusPieData.map((entry, index) => {
                      let color = COLORS[index % COLORS.length];
                      if (entry.name === 'completed') color = '#57F287';
                      if (entry.name === 'failed') color = '#ED4245';
                      if (entry.name === 'running') color = '#5865F2';
                      if (entry.name === 'stopped') color = '#FEE75C';
                      return <Cell key={`cell-${index}`} fill={color} />;
                    })}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: '#2B2D31', border: '1px solid #444', borderRadius: '8px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Active Agents Fleet Row */}
      <div className="section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '20px' }}>Agent Fleet Overview</h3>
          <p style={{ margin: '4px 0 0 0', color: '#888' }}>Unique IDs make precise Control Bot commands easy.</p>
        </div>
        <Link to="/agents" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#5865F2', textDecoration: 'none', fontWeight: 600 }}>
          View all fleet <ArrowRight size={16}/>
        </Link>
      </div>

      <div className="cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px', marginBottom: '40px' }}>
        {agents.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', background: '#1E1F22', border: '1px dashed #444', borderRadius: '12px' }}>
            <p style={{ color: '#888', marginBottom: '16px' }}>No agents configured yet.</p>
            <Link className="primary" to="/agents/new" style={{ padding: '10px 20px', display: 'inline-block' }}>Create your first agent</Link>
          </div>
        ) : (
          agents.slice(0, 4).map(agent => (
            <AgentCard key={agent.id} agent={agent} refresh={loadData} />
          ))
        )}
      </div>

      {/* Execution Audit Log / Recent Runs */}
      <div className="section" style={{ marginBottom: '20px' }}>
        <h3 style={{ margin: 0, fontSize: '20px' }}>Recent Audit Logs</h3>
        <p style={{ margin: '4px 0 0 0', color: '#888' }}>Immutable execution history from the local runtime environment.</p>
      </div>

      <div className="table" style={{ background: '#1E1F22', border: '1px solid #333', borderRadius: '12px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#2B2D31', borderBottom: '1px solid #444' }}>
              <th style={{ padding: '16px', color: '#B5BAC1', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase' }}>Run ID</th>
              <th style={{ padding: '16px', color: '#B5BAC1', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase' }}>Agent</th>
              <th style={{ padding: '16px', color: '#B5BAC1', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase' }}>Status</th>
              <th style={{ padding: '16px', color: '#B5BAC1', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase' }}>Tool Invocations</th>
              <th style={{ padding: '16px', color: '#B5BAC1', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase' }}>Token Usage</th>
              <th style={{ padding: '16px', color: '#B5BAC1', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase' }}>Duration</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: '#888' }}>
                  No execution history available. Run an agent to populate audit logs.
                </td>
              </tr>
            ) : (
              runs.slice(0, 8).map(run => {
                const associatedAgent = agents.find(v => v.id === run.agent_id);
                return (
                  <tr key={run.id} style={{ borderBottom: '1px solid #333' }} className="table-row-hover">
                    <td className="mono" style={{ padding: '16px', fontSize: '13px', color: '#888' }}>{run.id}</td>
                    <td style={{ padding: '16px', fontWeight: 500 }}>
                      <Link to={`/agents/${run.agent_id}`} style={{ color: '#E3E5E8', textDecoration: 'none' }}>
                        {associatedAgent?.name || `Agent [${run.agent_id.substring(0,6)}]`}
                      </Link>
                    </td>
                    <td style={{ padding: '16px' }}>
                      <StatusPill status={run.status} />
                    </td>
                    <td style={{ padding: '16px', color: '#B5BAC1' }}>{run.tool_calls || 0} calls</td>
                    <td style={{ padding: '16px', color: '#B5BAC1' }}>{run.tokens?.toLocaleString() || 0} tks</td>
                    <td style={{ padding: '16px', color: '#B5BAC1' }}>
                      {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : '---'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Helper Components (Decoupled for clean architecture)
// -------------------------------------------------------------

function StatCard({ icon, label, value, color }: { icon: React.ReactNode, label: string, value: string | number, color: string }) {
  return (
    <div style={{ background: '#1E1F22', border: '1px solid #333', borderRadius: '12px', padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
      <div style={{ background: `${color}20`, padding: '12px', borderRadius: '50%', color: color }}>
        {icon}
      </div>
      <div>
        <div style={{ color: '#B5BAC1', fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>{label}</div>
        <div style={{ color: '#fff', fontSize: '24px', fontWeight: 800 }}>{value}</div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  let bg = '#333';
  let color = '#fff';
  
  switch(status) {
    case 'completed': bg = 'rgba(87, 242, 135, 0.1)'; color = '#57F287'; break;
    case 'failed': bg = 'rgba(237, 66, 69, 0.1)'; color = '#ED4245'; break;
    case 'running': bg = 'rgba(88, 101, 242, 0.1)'; color = '#5865F2'; break;
    case 'stopped': bg = 'rgba(254, 231, 92, 0.1)'; color = '#FEE75C'; break;
  }

  return (
    <span style={{ 
      background: bg, color, padding: '4px 10px', 
      borderRadius: '100px', fontSize: '12px', fontWeight: 600, 
      textTransform: 'uppercase', display: 'inline-block' 
    }}>
      {status}
    </span>
  );
}

function AgentCard({ agent, refresh }: { agent: AgentData, refresh: () => void }) {
  const [isProcessing, setIsProcessing] = useState(false);

  const toggleRunState = async () => {
    setIsProcessing(true);
    try {
      await api(`/agents/${agent.id}/${agent.enabled ? 'stop' : 'run'}`, {
        method: 'POST', body: '{}'
      });
      refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="agent" style={{ background: '#1E1F22', border: '1px solid #333', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
      <div className="row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ background: '#2B2D31', padding: '10px', borderRadius: '8px', color: '#5865F2' }}>
            <Sparkles size={20} />
          </div>
          <div>
            <b style={{ display: 'block', fontSize: '16px', color: '#fff' }}>{agent.name}</b>
            <small className="mono" style={{ color: '#888', fontSize: '12px' }}>ID {agent.id}</small>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className={agent.enabled ? 'dot on' : 'dot'} style={{ width: '8px', height: '8px', borderRadius: '50%', background: agent.enabled ? '#57F287' : '#888', boxShadow: agent.enabled ? '0 0 8px #57F287' : 'none' }}></span>
        </div>
      </div>
      
      <p style={{ color: '#B5BAC1', fontSize: '14px', lineHeight: 1.5, margin: '0 0 20px 0', flexGrow: 1 }}>
        {agent.goal || 'No primary objective configured yet.'}
      </p>
      
      <div className="meta" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
        <span style={{ background: '#2B2D31', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', color: '#ccc' }}>
          {agent.tone.replace('_', ' ')}
        </span>
        <span style={{ background: '#2B2D31', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', color: '#ccc' }}>
          {agent.tools.length} Tools
        </span>
        <span style={{ background: '#2B2D31', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', color: '#ccc' }}>
          {agent.model || 'No model'}
        </span>
      </div>
      
      <div className="actions" style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
        <button 
          className="secondary" 
          onClick={toggleRunState}
          disabled={isProcessing}
          style={{ flex: 1, padding: '8px', background: agent.enabled ? 'rgba(237, 66, 69, 0.1)' : 'rgba(88, 101, 242, 0.1)', color: agent.enabled ? '#ED4245' : '#5865F2', border: `1px solid ${agent.enabled ? '#ED4245' : '#5865F2'}`, borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
        >
          {isProcessing ? 'Wait...' : (agent.enabled ? 'Stop Execution' : 'Run Agent')}
        </button>
        <Link 
          className="secondary" 
          to={`/agents/${agent.id}`}
          style={{ padding: '8px 16px', background: '#2B2D31', border: '1px solid #444', color: '#fff', borderRadius: '6px', textDecoration: 'none', textAlign: 'center', fontWeight: 600 }}
        >
          Edit Configuration
        </Link>
      </div>
    </div>
  );
}
