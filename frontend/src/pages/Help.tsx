import React, { useEffect, useState, useRef } from 'react';
import { api, stream } from '../api';
import {
  Sparkles, Send, Bot, Play, Square, RefreshCw, Terminal,
  CheckCircle2, AlertTriangle, Copy, Trash2, ArrowRight, CornerDownLeft
} from 'lucide-react';

interface AgentInfo {
  id: string;
  name: string;
  enabled: boolean;
  tone: string;
  model: string;
  goal: string;
  tools: string[];
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  action?: string;
}

export default function Help() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Hello! I am your Hermes Control Bot. I run locally on your LM Studio model and have real-time visibility into all your configured agents. You can ask me questions about your fleet, or command me to start, stop, or reconfigure any agent using their name or unique ID.'
    }
  ]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadAgents = async () => {
    setIsLoadingAgents(true);
    try {
      const data = await api<AgentInfo[]>('/agents');
      setAgents(data);
    } catch (e) {
      console.error('Failed to load agents in HelpBot', e);
    } finally {
      setIsLoadingAgents(false);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const handleSend = async (customPrompt?: string) => {
    const textToSend = customPrompt || input;
    if (!textToSend.trim() || isStreaming) return;

    setInput('');
    const userMsg: Message = { role: 'user', content: textToSend };
    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);

    let assistantResponse = '';
    const currentAssistantMsg: Message = { role: 'assistant', content: '' };
    setMessages(prev => [...prev, currentAssistantMsg]);

    try {
      await stream('/helpbot', { message: textToSend }, {
        onToken: (tok) => {
          assistantResponse += tok;
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: 'assistant',
              content: assistantResponse
            };
            return updated;
          });
        },
        onAction: (actionData) => {
          // If the bot executed a direct command
          const actionText = actionData.message || (actionData.status ? `Action status: ${actionData.status}` : 'Action executed');
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: 'assistant',
              content: `✓ Command executed: ${actionText}`,
              action: actionText
            };
            return updated;
          });
          loadAgents(); // Refresh fleet status
        },
        onError: (err) => {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: 'assistant',
              content: `[Error: ${err}]`
            };
            return updated;
          });
        },
        onDone: () => {
          setIsStreaming(false);
          loadAgents();
        }
      });
    } catch (e: any) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: `Failed to communicate with local model: ${e.message}`
        };
        return updated;
      });
      setIsStreaming(false);
    }
  };

  const toggleAgent = async (agent: AgentInfo) => {
    const action = agent.enabled ? 'stop' : 'run';
    try {
      await api(`/agents/${agent.id}/${action}`, { method: 'POST', body: '{}' });
      await loadAgents();
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `Manual trigger: ${action === 'run' ? 'Started' : 'Stopped'} agent '${agent.name}' (ID: ${agent.id}).`
        }
      ]);
    } catch (e: any) {
      alert(`Could not toggle agent: ${e.message}`);
    }
  };

  const insertPrompt = (text: string) => {
    setInput(text);
  };

  return (
    <>
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span className="eyebrow">Local Fleet AI</span>
          <h2>AI Help Bot & Control Room</h2>
          <p>
            An autonomous conversational operator connected to your running model. It can start, stop, or re-tune agents,
            answer technical questions, and guide you through tool setups.
          </p>
        </div>
        <button
          className="secondary"
          onClick={() => setMessages([{ role: 'assistant', content: 'Chat history cleared. How can I assist you with your agent fleet?' }])}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Trash2 size={15} /> Clear Chat
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px', height: 'calc(100vh - 280px)', minHeight: '560px' }}>
        {/* Left Column: Chat Conversation Stream */}
        <div style={{ display: 'flex', flexDirection: 'column', background: '#1E1F22', border: '1px solid #333', borderRadius: '12px', overflow: 'hidden' }}>
          {/* Messages Scroll Area */}
          <div style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: '12px',
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: msg.role === 'user' ? '80%' : '90%'
                }}
              >
                {msg.role !== 'user' && (
                  <div style={{ background: '#2B2D31', color: '#5865F2', width: '34px', height: '34px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Sparkles size={18} />
                  </div>
                )}
                <div style={{
                  background: msg.role === 'user' ? '#5865F2' : '#2B2D31',
                  color: '#fff',
                  padding: '14px 18px',
                  borderRadius: msg.role === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                  fontSize: '14px',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                }}>
                  {msg.action && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(87, 242, 135, 0.2)', color: '#57F287', padding: '4px 10px', borderRadius: '4px', marginBottom: '8px', fontSize: '12px', fontWeight: 600 }}>
                      <CheckCircle2 size={14} /> Action Triggered
                    </div>
                  )}
                  {msg.content || (isStreaming && i === messages.length - 1 ? <span style={{ color: '#888' }}>Thinking...</span> : '')}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Preset Suggestion Chips */}
          <div style={{ padding: '8px 16px', background: '#17181A', borderTop: '1px solid #2B2D31', display: 'flex', gap: '8px', overflowX: 'auto', whiteSpace: 'nowrap' }}>
            <button
              className="secondary"
              onClick={() => handleSend("What agents are currently configured?")}
              style={{ fontSize: '12px', padding: '4px 10px', background: '#2B2D31' }}
            >
              📋 List all agents
            </button>
            <button
              className="secondary"
              onClick={() => handleSend("How do I set up WhatsApp QR code?")}
              style={{ fontSize: '12px', padding: '4px 10px', background: '#2B2D31' }}
            >
              📱 How to link WhatsApp?
            </button>
            <button
              className="secondary"
              onClick={() => handleSend("How do I set up Email with an App Password?")}
              style={{ fontSize: '12px', padding: '4px 10px', background: '#2B2D31' }}
            >
              ✉️ Email App Password guide
            </button>
          </div>

          {/* Chat Input Bar */}
          <div style={{ padding: '16px', background: '#1E1F22', borderTop: '1px solid #333', display: 'flex', gap: '12px' }}>
            <input
              type="text"
              placeholder="Command the bot, e.g. 'Start agent 4a9f', 'Change tone of Bob to professional'..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
              style={{ flex: 1, padding: '12px 16px', background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff', outline: 'none' }}
              disabled={isStreaming}
            />
            <button
              className="primary"
              onClick={() => handleSend()}
              disabled={isStreaming || !input.trim()}
              style={{ padding: '0 20px', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Send size={16} />
              {isStreaming ? 'Streaming...' : 'Send'}
            </button>
          </div>
        </div>

        {/* Right Column: Running Agent Fleet Monitor with Unique IDs */}
        <div style={{ background: '#1E1F22', border: '1px solid #333', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bot size={18} color="#5865F2" /> Agent Fleet Roster
            </h3>
            <button className="secondary" onClick={loadAgents} style={{ padding: '4px 8px' }} title="Refresh agents">
              <RefreshCw size={13} className={isLoadingAgents ? 'spin' : ''} />
            </button>
          </div>
          <p style={{ color: '#888', fontSize: '12px', margin: '0 0 16px 0', lineHeight: 1.4 }}>
            Click an agent's UUID to query the bot directly about that specific agent.
          </p>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {agents.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#888', padding: '30px 10px', background: '#111', borderRadius: '8px' }}>
                No agents configured yet.
              </div>
            ) : (
              agents.map(a => (
                <div
                  key={a.id}
                  style={{
                    background: '#2B2D31',
                    border: a.enabled ? '1px solid #57F287' : '1px solid #383A40',
                    borderRadius: '8px',
                    padding: '12px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                    <div>
                      <b style={{ color: '#fff', fontSize: '14px', display: 'block' }}>{a.name}</b>
                      <button
                        onClick={() => insertPrompt(`What is the status of agent ${a.id}?`)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#5865F2',
                          fontFamily: 'monospace',
                          fontSize: '12px',
                          cursor: 'pointer',
                          padding: 0,
                          textAlign: 'left'
                        }}
                        title="Click to query bot about this ID"
                      >
                        ID: {a.id}
                      </button>
                    </div>

                    <span
                      className={a.enabled ? 'dot on' : 'dot'}
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: a.enabled ? '#57F287' : '#666',
                        boxShadow: a.enabled ? '0 0 8px #57F287' : 'none'
                      }}
                    />
                  </div>

                  <div style={{ fontSize: '12px', color: '#B5BAC1', marginBottom: '10px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {a.goal || 'No objective configured'}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', background: '#1E1F22', padding: '2px 6px', borderRadius: '4px', color: '#aaa' }}>
                      Tone: {a.tone.replace('_', ' ')}
                    </span>
                    <button
                      className="secondary"
                      onClick={() => toggleAgent(a)}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 600,
                        background: a.enabled ? 'rgba(237, 66, 69, 0.2)' : 'rgba(87, 242, 135, 0.2)',
                        color: a.enabled ? '#ED4245' : '#57F287',
                        border: 'none'
                      }}
                    >
                      {a.enabled ? 'Stop' : 'Run'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
