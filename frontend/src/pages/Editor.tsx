import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ReactFlow, 
  MiniMap, 
  Controls, 
  Background, 
  BackgroundVariant,
  addEdge, 
  useNodesState, 
  useEdgesState,
  Connection,
  Handle,
  Position,
  NodeProps
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { api } from '../api';
import { 
  Save, Sparkles, FlaskConical, ScanSearch, 
  Play, BrainCircuit, ShieldCheck, Wrench, CheckCircle2
} from 'lucide-react';

const TONES = [
  'general', 
  'professional', 
  'customer_support', 
  'technical', 
  'friendly', 
  'executive'
];

interface ToolGroupDef {
  name: string;
  label: string;
  tools: string[];
}

const TOOL_GROUPS: ToolGroupDef[] = [
  {
    name: 'web',
    label: 'WEB CONNECTORS',
    tools: ['web.search', 'web.fetch']
  },
  {
    name: 'email',
    label: 'EMAIL CONNECTORS',
    tools: ['email.search', 'email.send', 'email.create_draft', 'gmail.search', 'gmail.create_draft']
  },
  {
    name: 'whatsapp',
    label: 'WHATSAPP CONNECTORS',
    tools: ['whatsapp.send']
  },
  {
    name: 'telegram',
    label: 'TELEGRAM CONNECTORS',
    tools: ['telegram.send']
  },
  {
    name: 'discord',
    label: 'DISCORD CONNECTORS',
    tools: ['discord.send']
  },
  {
    name: 'slack',
    label: 'SLACK CONNECTORS',
    tools: ['slack.send']
  },
  {
    name: 'coding',
    label: 'CODING & SYSTEM CONNECTORS',
    tools: ['system.terminal_exec', 'files.list', 'files.read', 'files.write', 'system.troubleshoot', 'deploy.netlify']
  },
  {
    name: 'obsidian',
    label: 'SECOND BRAIN CONNECTORS',
    tools: ['obsidian.read_note', 'obsidian.write_note', 'obsidian.sync', 'agent.delegate']
  },
  {
    name: 'automation',
    label: 'AUTOMATION CONNECTORS',
    tools: ['scheduler.cron_job', 'notify.briefing']
  },
  {
    name: 'developer',
    label: 'DEVELOPER CONNECTORS',
    tools: ['http.request']
  }
];

const DEFAULT_TOOL_RISKS: Record<string, 'medium' | 'high'> = {
  'web.search': 'medium',
  'web.fetch': 'medium',
  'email.search': 'high',
  'email.send': 'high',
  'email.create_draft': 'medium',
  'gmail.search': 'high',
  'gmail.create_draft': 'high',
  'whatsapp.send': 'high',
  'telegram.send': 'high',
  'discord.send': 'high',
  'slack.send': 'high',
  'system.terminal_exec': 'high',
  'files.list': 'medium',
  'files.read': 'medium',
  'files.write': 'high',
  'system.troubleshoot': 'medium',
  'deploy.netlify': 'high',
  'obsidian.read_note': 'medium',
  'obsidian.write_note': 'high',
  'obsidian.sync': 'medium',
  'agent.delegate': 'high',
  'scheduler.cron_job': 'medium',
  'notify.briefing': 'medium',
  'http.request': 'high'
};

// ==========================================
// Custom React Flow Node Components
// ==========================================

const TriggerNode = ({ data }: NodeProps) => (
  <div style={{ background: '#2B2D31', border: '1px solid #1E1F22', borderRadius: '8px', padding: '12px 16px', minWidth: '180px', color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
      <div style={{ background: '#5865F2', padding: '6px', borderRadius: '4px' }}><Play size={14} color="#fff" /></div>
      <b style={{ fontSize: '14px' }}>Trigger</b>
    </div>
    <div style={{ fontSize: '12px', color: '#B5BAC1' }}>{data.label as string}</div>
    <Handle type="source" position={Position.Right} style={{ background: '#5865F2', border: 'none', width: '8px', height: '8px' }} />
  </div>
);

const AINode = ({ data }: NodeProps) => (
  <div style={{ background: '#2B2D31', border: '1px solid #1E1F22', borderRadius: '8px', padding: '12px 16px', minWidth: '180px', color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
    <Handle type="target" position={Position.Left} style={{ background: '#EB459E', border: 'none', width: '8px', height: '8px' }} />
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
      <div style={{ background: '#EB459E', padding: '6px', borderRadius: '4px' }}><BrainCircuit size={14} color="#fff" /></div>
      <b style={{ fontSize: '14px' }}>AI Engine</b>
    </div>
    <div style={{ fontSize: '12px', color: '#B5BAC1' }}>{data.label as string}</div>
    <Handle type="source" position={Position.Right} style={{ background: '#EB459E', border: 'none', width: '8px', height: '8px' }} />
  </div>
);

const LogicNode = ({ data }: NodeProps) => (
  <div style={{ background: '#2B2D31', border: '1px solid #1E1F22', borderRadius: '8px', padding: '12px 16px', minWidth: '180px', color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
    <Handle type="target" position={Position.Left} style={{ background: '#FEE75C', border: 'none', width: '8px', height: '8px' }} />
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
      <div style={{ background: '#FEE75C', padding: '6px', borderRadius: '4px' }}><ShieldCheck size={14} color="#000" /></div>
      <b style={{ fontSize: '14px' }}>Logic Gate</b>
    </div>
    <div style={{ fontSize: '12px', color: '#B5BAC1' }}>{data.label as string}</div>
    <Handle type="source" position={Position.Right} style={{ background: '#FEE75C', border: 'none', width: '8px', height: '8px' }} />
  </div>
);

const ToolNode = ({ data }: NodeProps) => (
  <div style={{ background: '#2B2D31', border: '1px solid #1E1F22', borderRadius: '8px', padding: '12px 16px', minWidth: '180px', color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
    <Handle type="target" position={Position.Left} style={{ background: '#57F287', border: 'none', width: '8px', height: '8px' }} />
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
      <div style={{ background: '#57F287', padding: '6px', borderRadius: '4px' }}><Wrench size={14} color="#000" /></div>
      <b style={{ fontSize: '14px' }}>Tool Exec</b>
    </div>
    <div style={{ fontSize: '12px', color: '#B5BAC1' }}>{data.label as string}</div>
    <Handle type="source" position={Position.Right} style={{ background: '#57F287', border: 'none', width: '8px', height: '8px' }} />
  </div>
);

const DefaultNode = ({ data }: NodeProps) => (
  <div style={{ background: '#2B2D31', border: '1px solid #1E1F22', borderRadius: '8px', padding: '12px 16px', minWidth: '180px', color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
    <Handle type="target" position={Position.Left} style={{ background: '#99AAB5', border: 'none', width: '8px', height: '8px' }} />
    <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '4px' }}>{data.label as string}</div>
    <Handle type="source" position={Position.Right} style={{ background: '#99AAB5', border: 'none', width: '8px', height: '8px' }} />
  </div>
);

// ==========================================
// Main Editor Component
// ==========================================

export default function Editor() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [models, setModels] = useState<any[]>([]);
  const [availableTools, setAvailableTools] = useState<any[]>([]);
  const [toolSearch, setToolSearch] = useState('');
  
  const [agent, setAgent] = useState<any>({
    name: 'New Agent',
    goal: '',
    system_prompt: 'You are a helpful local AI agent.',
    tone: 'general',
    model: '',
    autonomy: 'approval',
    tools: [],
    workflow: [],
    memory: { short_term: true, long_term: true }
  });
  
  // Custom node types registry
  const nodeTypes = useMemo(() => ({
    trigger: TriggerNode,
    ai: AINode,
    logic: LogicNode,
    tool: ToolNode,
    default: DefaultNode
  }), []);

  const [nodes, setNodes, onNodesChange] = useNodesState<any>([
    { id: 'trigger', type: 'trigger', position: { x: 50, y: 150 }, data: { label: 'Manual Trigger' } },
    { id: 'ai', type: 'ai', position: { x: 350, y: 150 }, data: { label: 'AI Reasoning' } },
    { id: 'approval', type: 'logic', position: { x: 650, y: 150 }, data: { label: 'Human Approval' } }
  ]);
  
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([
    { id: 'e1-2', source: 'trigger', target: 'ai', animated: true, style: { stroke: '#5865F2', strokeWidth: 2 } },
    { id: 'e2-3', source: 'ai', target: 'approval', animated: true, style: { stroke: '#EB459E', strokeWidth: 2 } }
  ]);
  
  const [note, setNote] = useState('');

  // Initial Data Fetch
  useEffect(() => {
    const fetchData = async () => {
      try {
        const modelsRes = await api<any>('/models');
        setModels(modelsRes.models || []);
      } catch (e) {
        console.error("Failed to load models");
      }
      
      try {
        const toolsRes = await api<any[]>('/tools');
        setAvailableTools(toolsRes);
      } catch (e) {
        console.error("Failed to load tools");
      }
      
      if (id) {
        try {
          const agentData = await api<any>('/agents/' + id);
          setAgent(agentData);
          if (agentData.workflow?.length) {
            // Re-apply nice styling properties to edges loaded from DB just in case they lack it
            const styledEdges = (agentData.workflow.edges || []).map((e: any) => ({
              ...e, 
              animated: true, 
              style: e.style || { stroke: '#B5BAC1', strokeWidth: 2 }
            }));
            const mappedNodes = (agentData.workflow.nodes || agentData.workflow).filter((n: any) => n.id);
            if (mappedNodes.length > 0) setNodes(mappedNodes);
            if (styledEdges.length > 0) setEdges(styledEdges);
          }
        } catch (e) {
          console.error("Failed to load agent", e);
        }
      }
    };
    
    fetchData();
  }, [id, setNodes, setEdges]);

  // Handle Connecting Nodes in the Graph
  const onConnect = (connection: Connection) => {
    setEdges((eds) => addEdge({ ...connection, animated: true, style: { stroke: '#99AAB5', strokeWidth: 2 } }, eds));
  };

  const handleSave = async () => {
    // We save the full layout (nodes and edges) inside the workflow property
    const payload = { ...agent, workflow: { nodes, edges } };
    try {
      const response = id 
        ? await api<any>('/agents/' + id, { method: 'PATCH', body: JSON.stringify(payload) })
        : await api<any>('/agents', { method: 'POST', body: JSON.stringify(payload) });
        
      setNote('Saved Successfully');
      navigate('/agents/' + response.id);
    } catch (e: any) {
      setNote(`Error: ${e.message}`);
    }
  };

  const handleGenerateWorkflow = async () => {
    setNote('Generating workflow using AI...');
    try {
      const generated = await api<any>('/workflows/generate', {
        method: 'POST',
        body: JSON.stringify({ goal: agent.goal, model: agent.model })
      });
      
      const newNodes = (generated.nodes || []).map((n: any, i: number) => ({
        id: n.id || String(i),
        type: n.type || 'default',
        position: { x: 50 + (i * 300), y: 150 },
        data: { label: n.title || n.type }
      }));
      
      const newEdges = (generated.edges || []).map((e: any, i: number) => ({
        id: 'e' + i,
        source: e.source,
        target: e.target,
        animated: true,
        style: { stroke: '#5865F2', strokeWidth: 2 }
      }));
      
      setNodes(newNodes);
      setEdges(newEdges);
      
      const requiredTools = generated.required_tools || [];
      const updatedTools = Array.from(new Set([...(agent.tools || []), ...requiredTools]));
      
      setAgent((prev: any) => ({ ...prev, tools: updatedTools }));
      setNote('AI workflow generated successfully');
    } catch (e: any) {
      setNote(`Workflow generation failed: ${e.message}`);
    }
  };

  const toggleTool = (toolName: string) => {
    setAgent((prev: any) => {
      const hasTool = prev.tools.includes(toolName);
      return {
        ...prev,
        tools: hasTool 
          ? prev.tools.filter((t: string) => t !== toolName)
          : [...prev.tools, toolName]
      };
    });
  };

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">{id ? 'Edit agent' : 'Create agent'}</span>
          <h2>{agent.name}</h2>
          <p>{id ? 'ID: ' + id : 'A unique ID will be assigned automatically upon saving.'}</p>
        </div>
        
        <div className="actions">
          <button className="secondary" onClick={handleGenerateWorkflow}>
            <Sparkles size={15} /> Generate AI workflow
          </button>
          
          {id && (
            <button className="secondary" onClick={() => {
              api(`/agents/${id}/simulate`, { method: 'POST', body: '{}' })
                .then(() => setNote('Simulation started in Sandbox Mode.'))
                .catch(e => setNote(`Simulation error: ${e.message}`));
            }}>
              <FlaskConical size={15} /> Simulate Sandbox
            </button>
          )}
          
          {id && (
            <button className="secondary" onClick={() => navigate('/runs')}>
              <ScanSearch size={15} /> Inspect Logs
            </button>
          )}
          
          <button className="primary" onClick={handleSave}>
            <Save size={15} /> Save Configuration
          </button>
        </div>
      </div>
      
      <div className="grid2">
        <div className="card form">
          <Field label="Agent Name">
            <input 
              value={agent.name} 
              onChange={e => setAgent({ ...agent, name: e.target.value })} 
              placeholder="e.g. Daily Briefing Assistant"
            />
          </Field>
          
          <Field label="Objective / Goal">
            <textarea 
              rows={4} 
              value={agent.goal} 
              onChange={e => setAgent({ ...agent, goal: e.target.value })} 
              placeholder="Describe exactly what this agent should accomplish autonomously..."
            />
          </Field>
          
          <Field label="System Prompt (Instructions)">
            <textarea 
              rows={5} 
              value={agent.system_prompt} 
              onChange={e => setAgent({ ...agent, system_prompt: e.target.value })} 
            />
          </Field>
          
          <div className="grid2">
            <Field label="LLM Inference Model">
              <select value={agent.model} onChange={e => setAgent({ ...agent, model: e.target.value })}>
                <option value="">Select LM Studio model...</option>
                {models.map(m => (
                  <option key={m.id} value={m.id}>{m.id}</option>
                ))}
              </select>
            </Field>
            
            <Field label="Agent Persona Tone">
              <select value={agent.tone} onChange={e => setAgent({ ...agent, tone: e.target.value })}>
                {TONES.map(t => (
                  <option key={t} value={t}>{t.replace('_', ' ')}</option>
                ))}
              </select>
            </Field>
          </div>
          
          <Field label="Autonomy & Safety Level">
            <select value={agent.autonomy} onChange={e => setAgent({ ...agent, autonomy: e.target.value })}>
              <option value="suggest">Suggest only (Read-only)</option>
              <option value="approval">Human-in-the-loop (Ask before risky actions)</option>
              <option value="low_risk">Auto execute low-risk only</option>
              <option value="autonomous">Fully autonomous (Use with extreme caution)</option>
            </select>
          </Field>
        </div>
        
        <div className="card" style={{ background: '#12151B', border: '1px solid #202731', borderRadius: '13px', padding: '24px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
            Tools &amp; Execution Permissions
          </div>
          <p style={{ fontSize: '13px', color: '#9097A3', lineHeight: 1.5, margin: '0 0 18px 0' }}>
            High-risk tools (like Email or WhatsApp) can be held for approval based on the Autonomy Level above.
          </p>

          {TOOL_GROUPS.map((group, groupIdx) => {
            const filteredTools = group.tools.filter(t =>
              !toolSearch || t.toLowerCase().includes(toolSearch.toLowerCase())
            );
            if (filteredTools.length === 0) return null;

            return (
              <div 
                key={group.name} 
                style={{ 
                  paddingTop: groupIdx > 0 ? '16px' : '0', 
                  marginTop: groupIdx > 0 ? '14px' : '0', 
                  borderTop: groupIdx > 0 ? '1px solid #1C212A' : 'none' 
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#616B7B', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '8px' }}>
                  {group.label}
                </div>
                {filteredTools.map(toolName => {
                  const toolMeta = availableTools.find(x => x.name === toolName);
                  const isChecked = agent.tools.includes(toolName);
                  const riskLevel = toolMeta?.risk || DEFAULT_TOOL_RISKS[toolName] || 'medium';
                  
                  return (
                    <label 
                      key={toolName} 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between', 
                        padding: '7px 0', 
                        cursor: 'pointer',
                        userSelect: 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <input 
                          type="checkbox" 
                          checked={isChecked} 
                          onChange={() => toggleTool(toolName)} 
                          style={{ 
                            width: '15px', 
                            height: '15px', 
                            accentColor: '#5865F2', 
                            cursor: 'pointer', 
                            margin: 0,
                            borderRadius: '3px'
                          }} 
                        />
                        <span style={{ fontSize: '13px', color: '#D5DAE3', fontFamily: 'Consolas, Monaco, monospace' }}>
                          {toolName}
                        </span>
                      </div>
                      <span style={{ fontSize: '12px', color: '#5C6675', fontWeight: 400 }}>
                        {riskLevel} risk
                      </span>
                    </label>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      
      <div className="card flow" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="section" style={{ padding: '24px 24px 0 24px' }}>
          <div>
            <b>Visual Agent Pipeline</b>
            <p>Think &rarr; Plan &rarr; Tool Selection &rarr; Execute &rarr; Observe &rarr; Decide</p>
          </div>
          <span className="pill" style={{ backgroundColor: '#1E1F22', border: '1px solid #333' }}>
            <CheckCircle2 size={14} color="#4ade80" style={{ marginRight: '6px' }}/> {nodes.length} Configured Nodes
          </span>
        </div>
        
        {/* React Flow Workspace styled for Dark Mode */}
        <div className="flowbox" style={{ height: '500px', width: '100%', marginTop: '16px' }}>
          <ReactFlow 
            nodes={nodes} 
            edges={edges} 
            onNodesChange={onNodesChange} 
            onEdgesChange={onEdgesChange} 
            onConnect={onConnect} 
            nodeTypes={nodeTypes}
            colorMode="dark"
            fitView
          >
            <Background color="#3f3f46" variant={BackgroundVariant.Dots} gap={24} size={2} />
            <MiniMap 
              nodeColor={(node) => {
                switch (node.type) {
                  case 'trigger': return '#5865F2';
                  case 'ai': return '#EB459E';
                  case 'logic': return '#FEE75C';
                  case 'tool': return '#57F287';
                  default: return '#99AAB5';
                }
              }}
              style={{ backgroundColor: '#1E1F22', border: '1px solid #333', borderRadius: '8px' }}
              maskColor="rgba(0, 0, 0, 0.4)"
            />
            <Controls style={{ backgroundColor: '#1E1F22', border: '1px solid #333', borderRadius: '8px', fill: '#fff' }} />
          </ReactFlow>
        </div>
      </div>
      
      <div className="savebar">
        {note && <span className="status-note">{note}</span>}
        <button className="primary" onClick={handleSave}>
          <Save size={15} /> Save Configured Agent
        </button>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
