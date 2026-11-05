import React, { useEffect, useState } from 'react';
import { api, scheduleApi, ScheduleItem } from '../api';
import { 
  Clock, Plus, Play, Trash2, Power, Edit2, CheckCircle2, 
  AlertCircle, RefreshCw, Calendar, Sparkles, X, ChevronRight, Zap,
  FileText, Copy, Check, Eye, AlertTriangle, ArrowRight, Bot
} from 'lucide-react';

interface AgentBasic {
  id: string;
  name: string;
  model: string;
  tone: string;
  tools?: string[];
}

const AUTOMATION_TEMPLATES = [
  {
    title: 'Daily Email Digest',
    agentNameMatch: 'mail',
    cron: 'every 1 hour',
    prompt: 'Search recent unread emails in my inbox, summarize the top 3 priority threads with key action items, and provide a clean briefing.'
  },
  {
    title: 'Market & Price Pulse',
    agentNameMatch: 'market',
    cron: 'every 4 hours',
    prompt: 'Perform web search on latest market and tech news in AI agents, summarize the top 3 headlines, and extract actionable takeaways.'
  },
  {
    title: 'Obsidian Second Brain Sync',
    agentNameMatch: 'obsidian',
    cron: 'every 2 hours',
    prompt: 'Review active notes and tasks in my Obsidian second brain vault, check for uncompleted action items, and write a summary update.'
  },
  {
    title: 'Fast Check & WhatsApp Alert',
    agentNameMatch: 'whatsapp',
    cron: 'every minute',
    prompt: 'Check for high-priority updates or notifications and send a short status alert to my personal WhatsApp notes chat.'
  }
];

export const Scheduler: React.FC = () => {
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [agents, setAgents] = useState<AgentBasic[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<{ title: string; result: string; runId?: string } | null>(null);

  // Edit Modal State
  const [editingSchedule, setEditingSchedule] = useState<ScheduleItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editAgentId, setEditAgentId] = useState('');
  const [editIntervalType, setEditIntervalType] = useState('every 1 hour');
  const [editCronExpr, setEditCronExpr] = useState('every 1 hour');
  const [editTaskPrompt, setEditTaskPrompt] = useState('');

  // Form State
  const [name, setName] = useState('');
  const [agentId, setAgentId] = useState('');
  const [intervalType, setIntervalType] = useState('every 1 hour');
  const [cronExpr, setCronExpr] = useState('every 1 hour');
  const [taskPrompt, setTaskPrompt] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [schedList, agentList] = await Promise.all([
        scheduleApi.list(),
        api<AgentBasic[]>('/agents')
      ]);
      setSchedules(schedList);
      setAgents(agentList);
      if (agentList.length > 0 && !agentId) {
        setAgentId(agentList[0].id);
      }
    } catch (e: any) {
      console.error('Failed to load scheduler data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Fast polling if any schedule is currently running
    const hasRunning = schedules.some(s => s.last_status === 'running' || s.id === runningId);
    const interval = setInterval(loadData, hasRunning ? 3000 : 10000);
    return () => clearInterval(interval);
  }, [schedules, runningId]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name || !agentId || !taskPrompt) {
      setFormError('Please fill out all required fields.');
      return;
    }

    try {
      await scheduleApi.create({
        name,
        agent_id: agentId,
        cron_expression: cronExpr,
        task_prompt: taskPrompt,
        enabled: true
      });
      setIsModalOpen(false);
      setName('');
      setTaskPrompt('');
      showToast('Automation job created successfully!');
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create automation');
    }
  };

  const handleToggle = async (sched: ScheduleItem) => {
    try {
      await scheduleApi.update(sched.id, { enabled: !sched.enabled });
      showToast(sched.enabled ? 'Automation paused' : 'Automation activated');
      loadData();
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleOpenEdit = (s: ScheduleItem) => {
    setEditingSchedule(s);
    setEditName(s.name);
    setEditAgentId(s.agent_id);
    setEditIntervalType(s.cron_expression);
    setEditCronExpr(s.cron_expression);
    setEditTaskPrompt(s.task_prompt);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSchedule) return;
    try {
      await scheduleApi.update(editingSchedule.id, {
        name: editName,
        agent_id: editAgentId,
        cron_expression: editCronExpr,
        task_prompt: editTaskPrompt
      });
      setEditingSchedule(null);
      showToast('Automation updated successfully!');
      loadData();
    } catch (err: any) {
      showToast(`Failed to update: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this scheduled automation?')) return;
    try {
      await scheduleApi.delete(id);
      showToast('Automation deleted');
      loadData();
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleRunNow = async (id: string) => {
    setRunningId(id);
    try {
      const res = await scheduleApi.runNow(id);
      showToast(`Execution triggered! Run ID: ${res.run_id}`);
      loadData();

      // Poll faster to capture the completion
      let attempts = 0;
      const pollInterval = setInterval(async () => {
        attempts++;
        await loadData();
        if (attempts >= 10) {
          clearInterval(pollInterval);
          setRunningId(null);
        }
      }, 2500);
    } catch (err: any) {
      showToast(`Trigger failed: ${err.message}`);
      setRunningId(null);
    }
  };

  const handleApplyTemplate = (tpl: typeof AUTOMATION_TEMPLATES[0]) => {
    setName(tpl.title);
    setCronExpr(tpl.cron);
    setIntervalType(tpl.cron);
    setTaskPrompt(tpl.prompt);
    // Auto-select best matching agent if possible
    const match = agents.find(a => {
      const toolStr = (a.tools || []).join(' ').toLowerCase();
      const nameStr = a.name.toLowerCase();
      if (tpl.agentNameMatch === 'mail' || tpl.agentNameMatch === 'gmail') {
        return toolStr.includes('email') || toolStr.includes('gmail') || nameStr.includes('gmail') || nameStr.includes('email');
      }
      return nameStr.includes(tpl.agentNameMatch) || toolStr.includes(tpl.agentNameMatch);
    });
    if (match) setAgentId(match.id);
  };

  const handleCopyResult = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const formatRelativeNextRun = (nextRunStr?: string) => {
    if (!nextRunStr) return null;
    const diffMs = new Date(nextRunStr).getTime() - Date.now();
    if (diffMs <= 0) return 'due shortly';
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) return 'in less than a min';
    if (mins === 1) return 'in 1 min';
    if (mins < 60) return `in ${mins} mins`;
    const hrs = Math.round(mins / 60);
    return `in ~${hrs} hr${hrs > 1 ? 's' : ''}`;
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: '#2B2D31',
          border: '1px solid #5865F2',
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          borderRadius: '10px',
          padding: '12px 20px',
          color: '#fff',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          zIndex: 9999
        }}>
          <Sparkles size={16} color="#5865F2" />
          {toast}
        </div>
      )}

      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #1E1F22 0%, #2B2D31 100%)',
        border: '1px solid #35373C',
        borderRadius: '16px',
        padding: '28px',
        marginBottom: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '20px'
      }}>
        <div>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(88, 101, 242, 0.15)',
            border: '1px solid rgba(88, 101, 242, 0.3)',
            color: '#5865F2',
            padding: '4px 10px',
            borderRadius: '20px',
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            marginBottom: '8px'
          }}>
            <Clock size={12} /> Autonomous Scheduler & Automations
          </div>
          <h2 style={{ fontSize: '26px', margin: '0 0 6px 0', color: '#fff', fontWeight: 800 }}>
            Scheduled Cron Jobs & Background Tasks
          </h2>
          <p style={{ color: '#949BA4', fontSize: '14px', margin: 0, maxWidth: '650px', lineHeight: 1.5 }}>
            Automate daily email briefings, periodic web market scrapers, and Obsidian second brain syncs with zero human intervention.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={loadData}
            style={{
              background: '#2B2D31',
              border: '1px solid #383A40',
              color: '#fff',
              padding: '10px 14px',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px'
            }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            style={{
              background: 'linear-gradient(135deg, #5865F2, #4752C4)',
              border: 'none',
              color: '#fff',
              padding: '10px 20px',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 700,
              fontSize: '14px',
              boxShadow: '0 4px 14px rgba(88, 101, 242, 0.4)'
            }}
          >
            <Plus size={16} /> New Automation
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#1E1F22', border: '1px solid #2B2D31', borderRadius: '12px', padding: '16px' }}>
          <div style={{ color: '#949BA4', fontSize: '12px', textTransform: 'uppercase', fontWeight: 700, marginBottom: '6px' }}>Total Automations</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#fff' }}>{schedules.length}</div>
        </div>
        <div style={{ background: '#1E1F22', border: '1px solid #2B2D31', borderRadius: '12px', padding: '16px' }}>
          <div style={{ color: '#949BA4', fontSize: '12px', textTransform: 'uppercase', fontWeight: 700, marginBottom: '6px' }}>Active Schedules</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#57F287' }}>
            {schedules.filter(s => s.enabled).length}
          </div>
        </div>
        <div style={{ background: '#1E1F22', border: '1px solid #2B2D31', borderRadius: '12px', padding: '16px' }}>
          <div style={{ color: '#949BA4', fontSize: '12px', textTransform: 'uppercase', fontWeight: 700, marginBottom: '6px' }}>Scheduler Loop</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', color: '#57F287', fontWeight: 600, marginTop: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#57F287', display: 'inline-block' }} />
            Active (15s Tick)
          </div>
        </div>
      </div>

      {/* Automations List */}
      <div style={{ background: '#1E1F22', border: '1px solid #2B2D31', borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #2B2D31', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b style={{ color: '#fff', fontSize: '16px' }}>Configured Jobs ({schedules.length})</b>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#949BA4' }}>
            <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '10px' }} />
            <div>Loading automations...</div>
          </div>
        ) : schedules.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#949BA4' }}>
            <Clock size={40} style={{ opacity: 0.4, marginBottom: '12px' }} />
            <div style={{ fontSize: '16px', color: '#fff', fontWeight: 600, marginBottom: '6px' }}>No Scheduled Tasks Yet</div>
            <p style={{ fontSize: '13px', maxWidth: '400px', margin: '0 auto 16px auto' }}>
              Create your first automation to have your agents perform routine research, email digests, or web scraping on a recurring timetable.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              style={{
                background: '#5865F2',
                border: 'none',
                color: '#fff',
                padding: '8px 16px',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              + Create First Automation
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {schedules.map(s => {
              const assignedAgent = agents.find(a => a.id === s.agent_id);
              const isExecuting = s.last_status === 'running' || runningId === s.id;
              const nextRunRelative = formatRelativeNextRun(s.next_run);

              return (
                <div
                  key={s.id}
                  style={{
                    padding: '22px 24px',
                    borderBottom: '1px solid #2B2D31',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    opacity: s.enabled ? 1 : 0.65,
                    background: isExecuting ? 'rgba(88, 101, 242, 0.05)' : 'transparent',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '16px'
                  }}>
                    <div style={{ flex: 1, minWidth: '280px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        <b style={{ color: '#fff', fontSize: '17px' }}>{s.name}</b>
                        
                        {/* Cron Interval Pill */}
                        <span style={{
                          background: '#2B2D31',
                          border: '1px solid #383A40',
                          color: '#E0E3EA',
                          padding: '3px 10px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 700
                        }}>
                          {s.cron_expression}
                        </span>

                        {/* Active / Paused Pill */}
                        <span style={{
                          background: s.enabled ? 'rgba(87, 242, 135, 0.15)' : 'rgba(148, 155, 164, 0.15)',
                          color: s.enabled ? '#57F287' : '#949BA4',
                          border: s.enabled ? '1px solid rgba(87, 242, 135, 0.3)' : '1px solid #383A40',
                          padding: '3px 10px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 700
                        }}>
                          {s.enabled ? 'ACTIVE' : 'PAUSED'}
                        </span>

                        {/* Real-time Execution Status Pill */}
                        {isExecuting ? (
                          <span style={{
                            background: 'rgba(88, 101, 242, 0.2)',
                            color: '#5865F2',
                            border: '1px solid #5865F2',
                            padding: '3px 10px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px'
                          }}>
                            <RefreshCw size={11} className="spin" /> RUNNING NOW
                          </span>
                        ) : s.last_status === 'completed' ? (
                          <span style={{
                            background: 'rgba(87, 242, 135, 0.12)',
                            color: '#57F287',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <CheckCircle2 size={11} /> COMPLETED
                          </span>
                        ) : s.last_status === 'failed' ? (
                          <span style={{
                            background: 'rgba(237, 66, 69, 0.15)',
                            color: '#ED4245',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <AlertTriangle size={11} /> FAILED
                          </span>
                        ) : (
                          <span style={{
                            background: 'rgba(148, 155, 164, 0.12)',
                            color: '#949BA4',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 600
                          }}>
                            READY
                          </span>
                        )}
                      </div>

                      {/* Prompt */}
                      <div style={{ fontSize: '13px', color: '#B5BAC1', marginBottom: '8px', lineHeight: 1.5 }}>
                        <b style={{ color: '#fff' }}>Prompt: </b>{s.task_prompt}
                      </div>

                      {/* Metadata Row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', color: '#949BA4', flexWrap: 'wrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Bot size={13} color="#5865F2" /> Agent: <b style={{ color: '#5865F2' }}>{assignedAgent ? assignedAgent.name : s.agent_id}</b>
                        </span>
                        <span>
                          Last run: <strong style={{ color: '#E0E3EA' }}>{s.last_run ? new Date(s.last_run).toLocaleString() : 'Never'}</strong>
                        </span>
                        {s.enabled && nextRunRelative && (
                          <span style={{ color: '#57F287', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={12} /> Next run: {nextRunRelative}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        onClick={() => handleRunNow(s.id)}
                        disabled={isExecuting}
                        title="Trigger execution immediately"
                        style={{
                          background: isExecuting ? 'rgba(88, 101, 242, 0.2)' : '#2B2D31',
                          border: '1px solid #5865F2',
                          color: '#5865F2',
                          padding: '8px 14px',
                          borderRadius: '8px',
                          cursor: isExecuting ? 'not-allowed' : 'pointer',
                          fontSize: '13px',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.2s'
                        }}
                      >
                        {isExecuting ? (
                          <>
                            <RefreshCw size={14} className="spin" /> Running...
                          </>
                        ) : (
                          <>
                            <Zap size={14} /> Run Now
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => handleToggle(s)}
                        title={s.enabled ? 'Pause automation' : 'Enable automation'}
                        style={{
                          background: s.enabled ? '#35373C' : '#2B2D31',
                          border: '1px solid #383A40',
                          color: s.enabled ? '#57F287' : '#949BA4',
                          padding: '8px 14px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <Power size={14} /> {s.enabled ? 'Active' : 'Paused'}
                      </button>

                      <button
                        onClick={() => handleOpenEdit(s)}
                        title="Edit automation configuration"
                        style={{
                          background: '#2B2D31',
                          border: '1px solid #383A40',
                          color: '#B5BAC1',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '13px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}
                      >
                        <Edit2 size={13} /> Edit
                      </button>

                      <button
                        onClick={() => handleDelete(s.id)}
                        title="Delete automation"
                        style={{
                          background: 'transparent',
                          border: '1px solid transparent',
                          color: '#ED4245',
                          padding: '8px',
                          cursor: 'pointer',
                          borderRadius: '6px'
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Latest Execution Outcome Box */}
                  {s.last_result && (
                    <div style={{
                      marginTop: '6px',
                      background: '#18191C',
                      border: '1px solid #2B2D31',
                      borderRadius: '8px',
                      padding: '12px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#5865F2', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <CheckCircle2 size={13} color="#57F287" /> Latest Run Output {s.last_run_id ? `(#${s.last_run_id})` : ''}:
                        </span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => handleCopyResult(s.id, s.last_result || '')}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: copiedId === s.id ? '#57F287' : '#949BA4',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px'
                            }}
                          >
                            {copiedId === s.id ? <Check size={12} /> : <Copy size={12} />}
                            {copiedId === s.id ? 'Copied' : 'Copy'}
                          </button>
                          <button
                            onClick={() => setSelectedResult({ title: s.name, result: s.last_result || '', runId: s.last_run_id })}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#5865F2',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px',
                              fontWeight: 600
                            }}
                          >
                            <Eye size={12} /> Expand
                          </button>
                        </div>
                      </div>
                      <div style={{
                        color: '#E0E3EA',
                        fontSize: '13px',
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                        maxHeight: '75px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {s.last_result}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Expanded Result Modal */}
      {selectedResult && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            background: '#1E1F22',
            border: '1px solid #35373C',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '650px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #2B2D31',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#2B2D31'
            }}>
              <b style={{ color: '#fff', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={18} color="#57F287" /> {selectedResult.title} Output
              </b>
              <button
                onClick={() => setSelectedResult(null)}
                style={{ background: 'transparent', border: 'none', color: '#949BA4', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              <pre style={{
                color: '#E0E3EA',
                fontSize: '13px',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                fontFamily: 'inherit',
                margin: 0
              }}>
                {selectedResult.result}
              </pre>
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #2B2D31', display: 'flex', justifyContent: 'flex-end', background: '#18191C' }}>
              <button
                onClick={() => setSelectedResult(null)}
                style={{
                  padding: '8px 18px',
                  background: '#5865F2',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Automation Modal */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            background: '#1E1F22',
            border: '1px solid #35373C',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '560px',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid #2B2D31',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#2B2D31'
            }}>
              <b style={{ color: '#fff', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={18} color="#5865F2" /> Schedule Autonomous Job
              </b>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#949BA4', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} style={{ padding: '24px' }}>
              {formError && (
                <div style={{
                  background: 'rgba(237, 66, 69, 0.15)',
                  border: '1px solid #ED4245',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  color: '#ED4245',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '16px'
                }}>
                  <AlertCircle size={16} /> {formError}
                </div>
              )}

              {/* 1-Click Templates */}
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: '#949BA4', marginBottom: '8px', textTransform: 'uppercase', fontWeight: 700 }}>
                  Popular 1-Click Templates
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {AUTOMATION_TEMPLATES.map(tpl => (
                    <button
                      key={tpl.title}
                      type="button"
                      onClick={() => handleApplyTemplate(tpl)}
                      style={{
                        background: '#2B2D31',
                        border: '1px solid #383A40',
                        color: '#E0E3EA',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 600,
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <span>{tpl.title}</span>
                      <ArrowRight size={12} color="#5865F2" />
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#B5BAC1', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 700 }}>
                  Automation Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Daily WhatsApp Email Briefing"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#111214',
                    border: '1px solid #383A40',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#B5BAC1', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 700 }}>
                  Assign AI Agent
                </label>
                <select
                  value={agentId}
                  onChange={e => setAgentId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#111214',
                    border: '1px solid #383A40',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                >
                  {agents.map(a => {
                    const toolPreview = a.tools && a.tools.length > 0 ? a.tools.slice(0, 2).join(', ') : 'no tools';
                    return (
                      <option key={a.id} value={a.id}>
                        {a.name} — Tools: [{toolPreview}] ({a.tone})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Schedule Interval Selection */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#B5BAC1', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 700 }}>
                  Schedule Interval
                </label>
                <select
                  value={intervalType}
                  onChange={e => {
                    const val = e.target.value;
                    setIntervalType(val);
                    if (val !== 'custom') setCronExpr(val);
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#111214',
                    border: '1px solid #383A40',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    marginBottom: '8px'
                  }}
                >
                  <option value="every minute">Every 1 minute (Fast Testing)</option>
                  <option value="every 5 minutes">Every 5 minutes</option>
                  <option value="every 15 minutes">Every 15 minutes</option>
                  <option value="every 30 minutes">Every 30 minutes</option>
                  <option value="every 1 hour">Every 1 hour (@hourly)</option>
                  <option value="every 4 hours">Every 4 hours</option>
                  <option value="every 6 hours">Every 6 hours</option>
                  <option value="@daily">Daily (@daily)</option>
                  <option value="custom">Custom Cron Expression...</option>
                </select>

                {intervalType === 'custom' && (
                  <input
                    type="text"
                    required
                    placeholder="e.g. */10 * * * *, @daily, every 2 hours"
                    value={cronExpr}
                    onChange={e => setCronExpr(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: '#111214',
                      border: '1px solid #383A40',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                )}
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#B5BAC1', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 700 }}>
                  Autonomous Instruction / Task
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="e.g. Scrape the latest top headlines on AI agents, summarize them in 3 bullet points, and write the briefing."
                  value={taskPrompt}
                  onChange={e => setTaskPrompt(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#111214',
                    border: '1px solid #383A40',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    padding: '10px 16px',
                    background: '#2B2D31',
                    border: '1px solid #383A40',
                    color: '#949BA4',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '10px 20px',
                    background: 'linear-gradient(135deg, #5865F2, #4752C4)',
                    border: 'none',
                    color: '#fff',
                    borderRadius: '8px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Sparkles size={14} /> Schedule Job
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    
      {/* Edit Automation Modal */}
      {editingSchedule && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            background: '#1E1F22',
            border: '1px solid #35373C',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '560px',
            boxShadow: '0 16px 40px rgba(0,0,0,0.8)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #2B2D31',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Edit2 size={18} color="#5865F2" />
                <b style={{ color: '#fff', fontSize: '16px' }}>Edit Automation Configuration</b>
              </div>
              <button
                onClick={() => setEditingSchedule(null)}
                style={{ background: 'transparent', border: 'none', color: '#949BA4', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} style={{ padding: '24px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#B5BAC1', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 700 }}>
                  Automation Title
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#111214',
                    border: '1px solid #383A40',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#B5BAC1', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 700 }}>
                  Assigned AI Agent
                </label>
                <select
                  value={editAgentId}
                  onChange={e => setEditAgentId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#111214',
                    border: '1px solid #383A40',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                >
                  {agents.map(a => {
                    const toolPreview = a.tools && a.tools.length > 0 ? a.tools.slice(0, 2).join(', ') : 'no tools';
                    return (
                      <option key={a.id} value={a.id}>
                        {a.name} — Tools: [{toolPreview}] ({a.tone})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#B5BAC1', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 700 }}>
                  Schedule Interval
                </label>
                <select
                  value={editIntervalType}
                  onChange={e => {
                    const val = e.target.value;
                    setEditIntervalType(val);
                    if (val !== 'custom') setEditCronExpr(val);
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#111214',
                    border: '1px solid #383A40',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    marginBottom: '8px'
                  }}
                >
                  <option value="every 1 minute">Every 1 Minute (High Frequency)</option>
                  <option value="every 5 minutes">Every 5 Minutes</option>
                  <option value="every 15 minutes">Every 15 Minutes</option>
                  <option value="every 1 hour">Every 1 Hour (Standard)</option>
                  <option value="every 4 hours">Every 4 Hours</option>
                  <option value="@daily">Daily (24 Hours)</option>
                  <option value="custom">Custom Interval / Cron</option>
                </select>

                {editIntervalType === 'custom' && (
                  <input
                    type="text"
                    required
                    placeholder="e.g. every 30 minutes or 0 */2 * * *"
                    value={editCronExpr}
                    onChange={e => setEditCronExpr(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: '#111214',
                      border: '1px solid #383A40',
                      borderRadius: '8px',
                      color: '#5865F2',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  />
                )}
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#B5BAC1', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 700 }}>
                  Autonomous Instruction / Task
                </label>
                <textarea
                  required
                  rows={4}
                  value={editTaskPrompt}
                  onChange={e => setEditTaskPrompt(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#111214',
                    border: '1px solid #383A40',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setEditingSchedule(null)}
                  style={{
                    padding: '10px 16px',
                    background: '#2B2D31',
                    border: '1px solid #383A40',
                    color: '#949BA4',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '10px 20px',
                    background: 'linear-gradient(135deg, #5865F2, #4752C4)',
                    border: 'none',
                    color: '#fff',
                    borderRadius: '8px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Sparkles size={14} /> Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
</div>
  );
};
