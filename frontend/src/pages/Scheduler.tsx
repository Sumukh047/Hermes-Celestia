import React, { useEffect, useState } from 'react';
import { api, scheduleApi, ScheduleItem } from '../api';
import { 
  Clock, Plus, Play, Trash2, Power, CheckCircle2, 
  AlertCircle, RefreshCw, Calendar, Sparkles, X, ChevronRight, Zap
} from 'lucide-react';

interface AgentBasic {
  id: string;
  name: string;
  model: string;
  tone: string;
}

export const Scheduler: React.FC = () => {
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [agents, setAgents] = useState<AgentBasic[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [agentId, setAgentId] = useState('');
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
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

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
      showToast(`Dispatched automation execution! Run ID: ${res.run_id}`);
      loadData();
    } catch (err: any) {
      showToast(`Trigger failed: ${err.message}`);
    } finally {
      setTimeout(() => setRunningId(null), 1500);
    }
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
            Automate daily email briefings, hourly web price scrapers, market research pulses,
            and Obsidian vault memory syncs with zero human intervention.
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
              return (
                <div
                  key={s.id}
                  style={{
                    padding: '20px 24px',
                    borderBottom: '1px solid #2B2D31',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '16px',
                    opacity: s.enabled ? 1 : 0.65,
                    transition: 'opacity 0.2s'
                  }}
                >
                  <div style={{ flex: 1, minWidth: '280px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                      <b style={{ color: '#fff', fontSize: '16px' }}>{s.name}</b>
                      <span style={{
                        background: '#2B2D31',
                        border: '1px solid #383A40',
                        color: '#B5BAC1',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 600
                      }}>
                        {s.cron_expression}
                      </span>
                      <span style={{
                        background: s.enabled ? 'rgba(87, 242, 135, 0.15)' : 'rgba(148, 155, 164, 0.15)',
                        color: s.enabled ? '#57F287' : '#949BA4',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 700
                      }}>
                        {s.enabled ? 'ACTIVE' : 'PAUSED'}
                      </span>
                    </div>

                    <div style={{ fontSize: '13px', color: '#949BA4', marginBottom: '8px', lineHeight: 1.4 }}>
                      <b style={{ color: '#B5BAC1' }}>Prompt: </b>{s.task_prompt}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px', color: '#949BA4' }}>
                      <span>
                        Agent: <b style={{ color: '#5865F2' }}>{assignedAgent ? assignedAgent.name : s.agent_id}</b>
                      </span>
                      <span>
                        Last run: {s.last_run ? new Date(s.last_run).toLocaleString() : 'Never'}
                      </span>
                      {s.last_status && (
                        <span>
                          Status: <b style={{ color: '#B5BAC1' }}>{s.last_status}</b>
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={() => handleRunNow(s.id)}
                      disabled={runningId === s.id}
                      title="Trigger execution immediately"
                      style={{
                        background: '#2B2D31',
                        border: '1px solid #5865F2',
                        color: '#5865F2',
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
                      <Zap size={14} /> {runningId === s.id ? 'Running...' : 'Run Now'}
                    </button>

                    <button
                      onClick={() => handleToggle(s)}
                      title={s.enabled ? 'Pause automation' : 'Enable automation'}
                      style={{
                        background: s.enabled ? '#35373C' : '#2B2D31',
                        border: '1px solid #383A40',
                        color: s.enabled ? '#57F287' : '#949BA4',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Power size={14} /> {s.enabled ? 'Active' : 'Paused'}
                    </button>

                    <button
                      onClick={() => handleDelete(s.id)}
                      title="Delete automation"
                      style={{
                        background: 'transparent',
                        border: 'none',
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
              );
            })}
          </div>
        )}
      </div>

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
            maxWidth: '520px',
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
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.tone} | {a.model || 'Default Model'})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#B5BAC1', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 700 }}>
                  Schedule Interval (Natural language or Cron)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. every 1 hour, @daily, every 30 minutes, 0 9 * * *"
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
                    boxSizing: 'border-box',
                    marginBottom: '8px'
                  }}
                />
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {['every 30 minutes', 'every 1 hour', 'every 6 hours', '@daily'].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCronExpr(preset)}
                      style={{
                        background: '#2B2D31',
                        border: '1px solid #383A40',
                        color: '#949BA4',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        cursor: 'pointer'
                      }}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#B5BAC1', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 700 }}>
                  Autonomous Goal / Instruction
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="e.g. Scrape the latest top headlines on AI agents, summarize them in 3 bullet points, and push a WhatsApp message to my personal chat."
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
    </div>
  );
};