import React, { useEffect, useState, useRef } from 'react';
import { api, API_BASE } from '../api';
import { 
  Sparkles, Paperclip, Send, X, FileText, Image as ImageIcon, 
  FileSpreadsheet, Presentation, CheckCircle2, ChevronDown, ChevronUp,
  Trash2, Copy, Check, Clock, Bot, User, RefreshCw, Cpu, Brain,
  Plus, Play, MessageSquare, ArrowRight, CornerDownRight
} from 'lucide-react';

interface WorkMode {
  id: string;
  title: string;
  description: string;
}

interface AttachedFile {
  name: string;
  type: string;
  size: number;
  content_base64: string;
  previewUrl?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thought?: string;
  isThinking?: boolean;
  mode?: string;
  files?: AttachedFile[];
  ttft?: number;
  timestamp: string;
}

interface PromptHistoryItem {
  id: string;
  prompt: string;
  mode: string;
  timestamp: string;
  filesCount: number;
}

interface ChatSession {
  id: string;
  title: string;
  prompt: string;
  mode: string;
  timestamp: string;
  updatedAt: number;
  messages: ChatMessage[];
  filesCount: number;
}

const DEFAULT_WORK_MODES: WorkMode[] = [
  { id: 'general', title: 'General', description: 'Use a task-focused local workflow' },
  { id: 'draft_approval', title: 'Draft approval note', description: 'Use a task-focused local workflow' },
  { id: 'official_letter', title: 'Letter / official correspondence', description: 'Use a task-focused local workflow' },
  { id: 'engineering_calc', title: 'Engineering calculation', description: 'Use a task-focused local workflow' },
  { id: 'inspection_review', title: 'Inspection report review', description: 'Use a task-focused local workflow' },
  { id: 'coding_verification', title: 'Coding & verification', description: 'Use a task-focused local workflow' },
  { id: 'document_summary', title: 'Document summarization', description: 'Use a task-focused local workflow' },
  { id: 'knowledge_research', title: 'Knowledge-base research', description: 'Use a task-focused local workflow' },
  { id: 'presentation_outline', title: 'Presentation outline', description: 'Use a task-focused local workflow' },
  { id: 'spreadsheet_analysis', title: 'Spreadsheet analysis', description: 'Use a task-focused local workflow' },
];

export const MultimodalInference: React.FC = () => {
  const [modes, setModes] = useState<WorkMode[]>(DEFAULT_WORK_MODES);
  const [activeMode, setActiveMode] = useState<string>('general');
  const [isModeModalOpen, setIsModeModalOpen] = useState(false);
  const [activeModel, setActiveModel] = useState<string>('Loading...');
  const [isOnline, setIsOnline] = useState(false);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Active Session & History State (Persisted in localStorage)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem('hermes_multimodal_chat_sessions');
      if (saved) return JSON.parse(saved);

      // Backward compatibility with legacy prompt history
      const legacy = localStorage.getItem('hermes_multimodal_prompt_history');
      if (legacy) {
        const parsedLegacy = JSON.parse(legacy);
        return parsedLegacy.map((item: any) => ({
          id: item.id || Date.now().toString(),
          title: (item.prompt || '').slice(0, 45) || 'Chat',
          prompt: item.prompt || '',
          mode: item.mode || 'general',
          timestamp: item.timestamp || '',
          updatedAt: Number(item.id) || Date.now(),
          messages: item.messages || [
            {
              id: (item.id || Date.now()) + '_u',
              role: 'user',
              content: item.prompt,
              mode: item.mode,
              timestamp: item.timestamp
            }
          ],
          filesCount: item.filesCount || 0
        }));
      }
      return [];
    } catch {
      return [];
    }
  });
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState('');

  const handleResumeChat = (session: ChatSession) => {
    setActiveSessionId(session.id);
    setActiveMode(session.mode || 'general');
    if (session.messages && session.messages.length > 0) {
      setMessages(session.messages);
    } else {
      setMessages([
        {
          id: session.id + '_u',
          role: 'user',
          content: session.prompt,
          mode: session.mode,
          timestamp: session.timestamp
        }
      ]);
    }
    setInputPrompt('');
    setAttachedFiles([]);
    setIsHistoryModalOpen(false);
  };

  const handleNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setInputPrompt('');
    setAttachedFiles([]);
  };

  const handleDeleteSession = (sessionId: string) => {
    setSessions(prev => {
      const updated = prev.filter(s => s.id !== sessionId);
      try {
        localStorage.setItem('hermes_multimodal_chat_sessions', JSON.stringify(updated));
        const promptHist = updated.map(u => ({
          id: u.id,
          prompt: u.prompt || u.title,
          mode: u.mode,
          timestamp: u.timestamp,
          filesCount: u.filesCount
        }));
        localStorage.setItem('hermes_multimodal_prompt_history', JSON.stringify(promptHist));
      } catch {}
      return updated;
    });
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
      setMessages([]);
    }
  };

  const handleClearAllSessions = () => {
    setSessions([]);
    setActiveSessionId(null);
    setMessages([]);
    try {
      localStorage.removeItem('hermes_multimodal_chat_sessions');
      localStorage.removeItem('hermes_multimodal_prompt_history');
    } catch {}
  };

  // Thinking Mode State (Active only if model supports it)
  const [supportsThinking, setSupportsThinking] = useState(false);
  const [thinkingEnabled, setThinkingEnabled] = useState(true);
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch Work Modes & Model status
  useEffect(() => {
    const fetchModesAndStatus = async () => {
      try {
        const [modeList, health, caps] = await Promise.all([
          api<WorkMode[]>('/multimodal/modes').catch(() => DEFAULT_WORK_MODES),
          api<any>('/health').catch(() => ({})),
          api<any>('/multimodal/capabilities').catch(() => ({ supports_thinking: false }))
        ]);
        setModes(modeList);
        const online = !!health?.lmstudio?.connected;
        setIsOnline(online);
        const models = health?.lmstudio?.models || [];
        if (models.length > 0) {
          setActiveModel(models[0].id);
        } else {
          setActiveModel('No model in VRAM');
        }
        setSupportsThinking(!!caps?.supports_thinking);
      } catch (e) {
        console.error('Failed to load multimodal metadata:', e);
      }
    };

    fetchModesAndStatus();
    const interval = setInterval(fetchModesAndStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  // Handle File Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      const isImg = file.type.startsWith('image/');

      reader.onload = () => {
        const base64String = reader.result as string;
        setAttachedFiles(prev => [
          ...prev,
          {
            name: file.name,
            type: file.type || file.name.split('.').pop() || '',
            size: file.size,
            content_base64: base64String,
            previewUrl: isImg ? base64String : undefined
          }
        ]);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Submit Prompt & Multimodal Files
  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!inputPrompt.trim() && attachedFiles.length === 0) || isStreaming) return;

    const currentPrompt = inputPrompt.trim();
    const currentFiles = [...attachedFiles];
    const currentSessionId = activeSessionId || ('session_' + Date.now());
    if (!activeSessionId) setActiveSessionId(currentSessionId);

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: currentPrompt || `Analyze the attached file(s): ${currentFiles.map(f => f.name).join(', ')}`,
      mode: activeMode,
      files: [...currentFiles],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const updatedMessagesWithUser = [...messages, userMessage];
    setMessages(updatedMessagesWithUser);
    setInputPrompt('');
    setAttachedFiles([]);
    setIsStreaming(true);

    const assistantMsgId = (Date.now() + 1).toString();
    const assistantMessage: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      thought: '',
      isThinking: supportsThinking && thinkingEnabled,
      mode: activeMode,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages([...updatedMessagesWithUser, assistantMessage]);

    // Format previous turns to pass full multi-turn conversation context to backend
    const historyPayload = messages
      .filter(m => m.content && m.content.trim())
      .map(m => ({ role: m.role, content: m.content }));

    abortControllerRef.current = new AbortController();

    let fullContent = '';
    let fullThought = '';

    try {
      const response = await fetch(`${API_BASE}/multimodal/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: currentPrompt || `Please analyze the attached files using ${activeMode} mode.`,
          mode: activeMode,
          files: currentFiles.map(f => ({
            name: f.name,
            type: f.type,
            content_base64: f.content_base64
          })),
          history: historyPayload
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No readable stream');

      const decoder = new TextDecoder();
      let streamBuffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        streamBuffer += decoder.decode(value, { stream: true });
        const lines = streamBuffer.split('\n\n');
        streamBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;

          try {
            const parsed = JSON.parse(trimmed.slice(5).trim());
            if (parsed.type === 'thought') {
              fullThought += parsed.text;
              setMessages(prev =>
                prev.map(m => m.id === assistantMsgId ? { ...m, thought: (m.thought || '') + parsed.text, isThinking: true } : m)
              );
              setExpandedThoughts(prev => ({ ...prev, [assistantMsgId]: true }));
            } else if (parsed.type === 'token') {
              fullContent += parsed.text;
              setMessages(prev =>
                prev.map(m => m.id === assistantMsgId ? { ...m, content: m.content + parsed.text, isThinking: false } : m)
              );
            } else if (parsed.type === 'meta') {
              setMessages(prev =>
                prev.map(m => m.id === assistantMsgId ? { ...m, ttft: parsed.ttft } : m)
              );
            } else if (parsed.type === 'error') {
              fullContent = `Error: ${parsed.message}`;
              setMessages(prev =>
                prev.map(m => m.id === assistantMsgId ? { ...m, content: fullContent } : m)
              );
            }
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        fullContent = `Failed: ${err.message}`;
        setMessages(prev =>
          prev.map(m => m.id === assistantMsgId ? { ...m, content: fullContent } : m)
        );
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;

      // Persist completed conversation session into history
      setSessions(prevSessions => {
        const completedAssistant: ChatMessage = {
          id: assistantMsgId,
          role: 'assistant',
          content: fullContent,
          thought: fullThought,
          isThinking: false,
          mode: activeMode,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        const fullConversation = [...updatedMessagesWithUser, completedAssistant];
        const title = currentPrompt.slice(0, 45) || (currentFiles[0] ? `File: ${currentFiles[0].name}` : 'Conversation');

        const sessionIdx = prevSessions.findIndex(s => s.id === currentSessionId);
        let updated: ChatSession[];
        if (sessionIdx >= 0) {
          updated = [...prevSessions];
          updated[sessionIdx] = {
            ...updated[sessionIdx],
            title: updated[sessionIdx].title || title,
            updatedAt: Date.now(),
            messages: fullConversation
          };
        } else {
          const newSession: ChatSession = {
            id: currentSessionId,
            title,
            prompt: currentPrompt,
            mode: activeMode,
            timestamp: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
            updatedAt: Date.now(),
            messages: fullConversation,
            filesCount: currentFiles.length
          };
          updated = [newSession, ...prevSessions].slice(0, 60);
        }

        try {
          localStorage.setItem('hermes_multimodal_chat_sessions', JSON.stringify(updated));
          const promptHist = updated.map(u => ({
            id: u.id,
            prompt: u.prompt || u.title,
            mode: u.mode,
            timestamp: u.timestamp,
            filesCount: u.filesCount
          }));
          localStorage.setItem('hermes_multimodal_prompt_history', JSON.stringify(promptHist));
        } catch {}

        return updated;
      });
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const activeModeDetails = modes.find(m => m.id === activeMode) || {
    id: 'general',
    title: 'General',
    description: 'Use a task-focused local workflow'
  };

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext || '')) return <ImageIcon size={15} color="#57F287" />;
    if (['pdf'].includes(ext || '')) return <FileText size={15} color="#ED4245" />;
    if (['ppt', 'pptx'].includes(ext || '')) return <Presentation size={15} color="#FEE75C" />;
    if (['csv', 'xlsx', 'xls'].includes(ext || '')) return <FileSpreadsheet size={15} color="#5865F2" />;
    return <FileText size={15} color="#B5BAC1" />;
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)' }}>
      {/* Top Banner / Controls */}
      <div style={{
        background: 'linear-gradient(135deg, #1E1F22 0%, #2B2D31 100%)',
        border: '1px solid #35373C',
        borderRadius: '16px',
        padding: '20px 24px',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            background: 'linear-gradient(135deg, #5865F2, #EB459E)',
            padding: '12px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(88, 101, 242, 0.4)'
          }}>
            <Sparkles size={22} color="#fff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ fontSize: '22px', margin: 0, color: '#fff', fontWeight: 800 }}>
                Multimodal Inference
              </h2>
              <span style={{
                background: isOnline ? 'rgba(87, 242, 135, 0.15)' : 'rgba(237, 66, 69, 0.15)',
                color: isOnline ? '#57F287' : '#ED4245',
                border: `1px solid ${isOnline ? 'rgba(87, 242, 135, 0.3)' : 'rgba(237, 66, 69, 0.3)'}`,
                padding: '2px 8px',
                borderRadius: '10px',
                fontSize: '11px',
                fontWeight: 700
              }}>
                {isOnline ? 'VRAM MODEL READY' : 'LM STUDIO OFFLINE'}
              </span>
            </div>
            <div style={{ fontSize: '13px', color: '#949BA4', marginTop: '2px' }}>
              Active Model: <code style={{ color: '#fff' }}>{activeModel}</code>
            </div>
          </div>
        </div>

        {/* Work Mode & Controls Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Work Mode Trigger Button */}
          <button
            onClick={() => setIsModeModalOpen(true)}
            style={{
              background: '#2B2D31',
              border: '1px solid #5865F2',
              color: '#fff',
              padding: '10px 18px',
              borderRadius: '10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 4px 12px rgba(88, 101, 242, 0.2)'
            }}
          >
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '11px', color: '#5865F2', fontWeight: 700, textTransform: 'uppercase' }}>Current Mode</div>
              <b style={{ fontSize: '14px', color: '#fff' }}>{activeModeDetails.title}</b>
            </div>
            <ChevronDown size={16} color="#949BA4" />
          </button>

          {/* Thinking Mode Option - Active only if loaded LLM supports thinking */}
          {supportsThinking && (
            <button
              onClick={() => setThinkingEnabled(!thinkingEnabled)}
              style={{
                background: thinkingEnabled ? 'rgba(88, 101, 242, 0.2)' : '#2B2D31',
                border: `1px solid ${thinkingEnabled ? '#5865F2' : '#383A40'}`,
                color: thinkingEnabled ? '#5865F2' : '#949BA4',
                padding: '10px 16px',
                borderRadius: '10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: 600,
                fontSize: '13px'
              }}
              title="Toggle deep chain-of-thought reasoning mode"
            >
              <Brain size={16} color={thinkingEnabled ? '#5865F2' : '#949BA4'} />
              <span>Thinking: {thinkingEnabled ? 'ON' : 'OFF'}</span>
            </button>
          )}

          {/* New Chat Button */}
          <button
            onClick={handleNewChat}
            style={{
              background: '#5865F2',
              border: 'none',
              color: '#fff',
              padding: '10px 16px',
              borderRadius: '10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              fontWeight: 600,
              boxShadow: '0 4px 12px rgba(88, 101, 242, 0.25)'
            }}
            title="Start a fresh chat session"
          >
            <Plus size={16} />
            <span>New Chat</span>
          </button>

          {/* History Button */}
          <button
            onClick={() => setIsHistoryModalOpen(true)}
            style={{
              background: '#2B2D31',
              border: '1px solid #383A40',
              color: '#fff',
              padding: '10px 16px',
              borderRadius: '10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              fontWeight: 600
            }}
            title="View past chats and resume conversation"
          >
            <Clock size={16} color="#B5BAC1" />
            <span>History ({sessions.length})</span>
          </button>

          {messages.length > 0 && (
            <button
              onClick={handleNewChat}
              title="Clear & Start New Chat"
              style={{
                background: '#2B2D31',
                border: '1px solid #383A40',
                color: '#949BA4',
                padding: '10px',
                borderRadius: '10px',
                cursor: 'pointer'
              }}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Chat Messages Container */}
      <div style={{
        flex: 1,
        background: '#1E1F22',
        border: '1px solid #2B2D31',
        borderRadius: '16px',
        overflowY: 'auto',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        marginBottom: '16px'
      }}>
        {messages.length === 0 ? (
          <div style={{
            margin: 'auto',
            textAlign: 'center',
            maxWidth: '560px',
            color: '#949BA4',
            padding: '40px 20px'
          }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              background: '#2B2D31',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
            }}>
              <Sparkles size={28} color="#5865F2" />
            </div>
            <h3 style={{ color: '#fff', fontSize: '20px', margin: '0 0 8px 0', fontWeight: 800 }}>
              {activeModeDetails.title}
            </h3>
            <p style={{ fontSize: '14px', lineHeight: 1.6, margin: '0 0 20px 0' }}>
              Direct local multimodal inference with <b>{activeModel}</b>. Attach PDFs, presentations, documents, or photos and give your prompt directly.
            </p>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                onClick={() => setInputPrompt('Summarize key points and highlight action items from this document.')}
                style={{
                  background: '#2B2D31',
                  border: '1px solid #383A40',
                  borderRadius: '20px',
                  padding: '6px 14px',
                  color: '#B5BAC1',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                📄 Summarize key points
              </button>
              <button
                onClick={() => setInputPrompt('Review the attached report for safety discrepancies and compliance gaps.')}
                style={{
                  background: '#2B2D31',
                  border: '1px solid #383A40',
                  borderRadius: '20px',
                  padding: '6px 14px',
                  color: '#B5BAC1',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                🔍 Audit inspection report
              </button>
              <button
                onClick={() => setInputPrompt('Perform a step-by-step engineering calculation with SI units and safety margins.')}
                style={{
                  background: '#2B2D31',
                  border: '1px solid #383A40',
                  borderRadius: '20px',
                  padding: '6px 14px',
                  color: '#B5BAC1',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                📐 Step-by-step calculation
              </button>
            </div>
          </div>
        ) : (
          messages.map(msg => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                gap: '14px',
                alignItems: 'flex-start',
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: msg.role === 'user' ? '80%' : '90%'
              }}
            >
              {msg.role === 'assistant' && (
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #5865F2, #EB459E)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: '4px'
                }}>
                  <Bot size={18} color="#fff" />
                </div>
              )}

              <div style={{
                background: msg.role === 'user' ? '#5865F2' : '#2B2D31',
                borderRadius: '14px',
                padding: '16px 20px',
                color: '#fff',
                fontSize: '14px',
                lineHeight: 1.6,
                boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
                border: msg.role === 'user' ? 'none' : '1px solid #383A40'
              }}>
                {/* User attached files chips */}
                {msg.files && msg.files.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                    {msg.files.map((f, i) => (
                      <div
                        key={i}
                        style={{
                          background: 'rgba(0,0,0,0.25)',
                          borderRadius: '8px',
                          padding: '6px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '12px',
                          border: '1px solid rgba(255,255,255,0.1)'
                        }}
                      >
                        {getFileIcon(f.name)}
                        <span style={{ fontWeight: 600 }}>{f.name}</span>
                        <span style={{ opacity: 0.6 }}>({(f.size / 1024).toFixed(0)} KB)</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Thinking Process Accordion */}
                {msg.thought && (
                  <div style={{ marginBottom: '14px' }}>
                    <div
                      onClick={() => setExpandedThoughts(prev => ({ ...prev, [msg.id]: !prev[msg.id] }))}
                      style={{
                        background: 'rgba(88, 101, 242, 0.12)',
                        border: '1px solid rgba(88, 101, 242, 0.3)',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        userSelect: 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Brain size={15} color="#5865F2" />
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>
                          {msg.isThinking ? 'Thinking in progress...' : 'Thinking Process'}
                        </span>
                        {msg.isThinking && (
                          <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#57F287' }}></span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', color: '#888' }}>
                          {msg.thought.split(/\s+/).filter(Boolean).length} words
                        </span>
                        {expandedThoughts[msg.id] ? <ChevronUp size={14} color="#949BA4" /> : <ChevronDown size={14} color="#949BA4" />}
                      </div>
                    </div>

                    {expandedThoughts[msg.id] && (
                      <div style={{
                        marginTop: '6px',
                        background: '#18191D',
                        borderLeft: '3px solid #5865F2',
                        borderRadius: '0 8px 8px 0',
                        padding: '12px 14px',
                        fontSize: '13px',
                        color: '#949BA4',
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                        maxHeight: '320px',
                        overflowY: 'auto'
                      }}>
                        {msg.thought}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {msg.content}
                </div>

                {/* Footer metadata */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  marginTop: '10px',
                  paddingTop: '8px',
                  borderTop: msg.role === 'user' ? '1px solid rgba(255,255,255,0.15)' : '1px solid #383A40',
                  fontSize: '11px',
                  opacity: 0.75
                }}>
                  <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>
                    {msg.mode ? msg.mode.replace('_', ' ') : 'General'} • {msg.timestamp}
                  </span>
                  {msg.role === 'assistant' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {msg.ttft ? <span>TTFT: {msg.ttft.toFixed(0)}ms</span> : null}
                      <button
                        onClick={() => handleCopy(msg.id, msg.content)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#fff',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px'
                        }}
                      >
                        {copiedId === msg.id ? <Check size={12} color="#57F287" /> : <Copy size={12} />}
                        {copiedId === msg.id ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {msg.role === 'user' && (
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: '#35373C',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: '4px'
                }}>
                  <User size={18} color="#fff" />
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input & File Attachment Area */}
      <div style={{
        background: '#1E1F22',
        border: '1px solid #35373C',
        borderRadius: '16px',
        padding: '14px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}>
        {/* Attached files preview strip */}
        {attachedFiles.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingBottom: '8px', borderBottom: '1px solid #2B2D31' }}>
            {attachedFiles.map((f, i) => (
              <div
                key={i}
                style={{
                  background: '#2B2D31',
                  border: '1px solid #383A40',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '12px',
                  color: '#fff'
                }}
              >
                {getFileIcon(f.name)}
                <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.name}
                </span>
                <span style={{ color: '#949BA4' }}>({(f.size / 1024).toFixed(0)} KB)</span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  style={{ background: 'transparent', border: 'none', color: '#ED4245', cursor: 'pointer', padding: 0 }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input Bar */}
        <form onSubmit={handleSend} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* File input button */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            accept=".pdf,.pptx,.ppt,.docx,.doc,.xlsx,.xls,.csv,.txt,.json,.md,.jpg,.jpeg,.png,.webp"
            style={{ display: 'none' }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Attach files (PDF, PPT, Word, Excel, Images, TXT)"
            style={{
              background: '#2B2D31',
              border: '1px solid #383A40',
              borderRadius: '10px',
              padding: '10px',
              color: '#B5BAC1',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Paperclip size={18} />
          </button>

          <input
            type="text"
            placeholder={`Prompt ${activeModel} (${activeModeDetails.title} mode)...`}
            value={inputPrompt}
            onChange={e => setInputPrompt(e.target.value)}
            disabled={isStreaming}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#fff',
              fontSize: '14px'
            }}
          />

          <button
            type="submit"
            disabled={isStreaming || (!inputPrompt.trim() && attachedFiles.length === 0)}
            style={{
              background: 'linear-gradient(135deg, #5865F2, #4752C4)',
              border: 'none',
              borderRadius: '10px',
              padding: '10px 18px',
              color: '#fff',
              fontWeight: 700,
              fontSize: '13px',
              cursor: (isStreaming || (!inputPrompt.trim() && attachedFiles.length === 0)) ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              opacity: (isStreaming || (!inputPrompt.trim() && attachedFiles.length === 0)) ? 0.6 : 1
            }}
          >
            {isStreaming ? (
              <>
                <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Generating
              </>
            ) : (
              <>
                <Send size={14} /> Send
              </>
            )}
          </button>
        </form>
      </div>

      {/* ========================================================================= */}
            {/* ========================================================================= */}
      {/* PROMPT HISTORY MODAL                                                      */}
      {/* ========================================================================= */}
      {isHistoryModalOpen && (
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
          padding: '20px'
        }}>
          <div style={{
            background: '#18191C',
            border: '1px solid #313338',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '680px',
            maxHeight: '80vh',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.85)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            padding: '24px 28px'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Clock size={20} color="#5865F2" />
                <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#fff', margin: 0 }}>
                  Chat & Prompt History ({sessions.length})
                </h2>
              </div>
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#949BA4', cursor: 'pointer', padding: '6px' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Search filter */}
            <div style={{ marginBottom: '16px' }}>
              <input
                type="text"
                placeholder="Search past conversations by keyword or mode..."
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                style={{
                  width: '100%',
                  background: '#111215',
                  border: '1px solid #313338',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  color: '#fff',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '4px' }}>
              {sessions
                .filter(s => !historySearch || (s.title || s.prompt).toLowerCase().includes(historySearch.toLowerCase()) || s.mode.toLowerCase().includes(historySearch.toLowerCase()))
                .length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#888' }}>
                  {sessions.length === 0 ? 'No chat history yet. Started conversations will appear here.' : 'No matching conversations found.'}
                </div>
              ) : (
                sessions
                  .filter(s => !historySearch || (s.title || s.prompt).toLowerCase().includes(historySearch.toLowerCase()) || s.mode.toLowerCase().includes(historySearch.toLowerCase()))
                  .map(item => {
                    const lastAssistant = item.messages?.filter(m => m.role === 'assistant' && m.content).pop();
                    const msgCount = item.messages?.length || 1;
                    const isActive = activeSessionId === item.id;
                    return (
                      <div
                        key={item.id}
                        style={{
                          background: isActive ? '#262830' : '#202126',
                          border: isActive ? '1px solid #5865F2' : '1px solid #2C2D33',
                          borderRadius: '12px',
                          padding: '16px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                              background: 'rgba(88, 101, 242, 0.15)',
                              color: '#5865F2',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 700,
                              textTransform: 'uppercase'
                            }}>
                              {item.mode.replace('_', ' ')}
                            </span>
                            <span style={{
                              background: 'rgba(87, 242, 135, 0.12)',
                              color: '#57F287',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 600
                            }}>
                              {msgCount} {msgCount === 1 ? 'turn' : 'turns'}
                            </span>
                            {item.filesCount > 0 && (
                              <span style={{ fontSize: '11px', color: '#aaa' }}>
                                📎 {item.filesCount} file{item.filesCount > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '11px', color: '#777' }}>{item.timestamp}</span>
                            <button
                              onClick={() => handleDeleteSession(item.id)}
                              title="Delete conversation"
                              style={{ background: 'transparent', border: 'none', color: '#ED4245', cursor: 'pointer', padding: '2px' }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        {/* User Prompt / Title */}
                        <div style={{ color: '#E1E4EA', fontSize: '13px', lineHeight: 1.5, fontWeight: 500 }}>
                          {item.prompt || item.title}
                        </div>

                        {/* Assistant Response Preview (if available) */}
                        {lastAssistant && lastAssistant.content && (
                          <div style={{
                            background: '#18191C',
                            borderLeft: '3px solid #5865F2',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            color: '#B5BAC1',
                            fontSize: '12px',
                            lineHeight: 1.4,
                            maxHeight: '60px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>
                            <span style={{ color: '#5865F2', fontWeight: 600, marginRight: '6px' }}>Hermes:</span>
                            {lastAssistant.content.slice(0, 150)}{lastAssistant.content.length > 150 ? '...' : ''}
                          </div>
                        )}

                        {/* Actions */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                          <button
                            onClick={() => {
                              setInputPrompt(item.prompt);
                              setActiveMode(item.mode);
                              setIsHistoryModalOpen(false);
                            }}
                            style={{
                              background: '#2B2D31',
                              border: '1px solid #383A40',
                              color: '#B5BAC1',
                              borderRadius: '8px',
                              padding: '6px 14px',
                              fontSize: '12px',
                              fontWeight: 500,
                              cursor: 'pointer'
                            }}
                          >
                            Use Prompt
                          </button>
                          <button
                            onClick={() => handleResumeChat(item)}
                            style={{
                              background: '#5865F2',
                              border: 'none',
                              color: '#fff',
                              borderRadius: '8px',
                              padding: '6px 16px',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                          >
                            <Play size={12} fill="#fff" />
                            <span>Resume Chat</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            {/* Clear All Footer */}
            {sessions.length > 0 && (
              <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #2C2D33', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#777' }}>Total saved conversations: {sessions.length}</span>
                <button
                  onClick={handleClearAllSessions}
                  style={{
                    background: 'transparent',
                    border: '1px solid #ED4245',
                    color: '#ED4245',
                    borderRadius: '8px',
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Clear All History
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* WORK MODES MODAL (Pixel-perfect matching user screenshot 1d1378f7.jpg)     */}
      {/* ========================================================================= */}
      {isModeModalOpen && (
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
          padding: '20px'
        }}>
          <div style={{
            background: '#18191C',
            border: '1px solid #313338',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '820px',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.85)',
            overflow: 'hidden',
            padding: '24px 28px'
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '20px'
            }}>
              <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#fff', margin: 0 }}>
                Work modes
              </h2>
              <button
                onClick={() => setIsModeModalOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#949BA4',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '6px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* 10 Work Mode Cards (2-column grid matching screenshot) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '14px'
            }}>
              {modes.map(mode => {
                const isSelected = activeMode === mode.id;
                return (
                  <div
                    key={mode.id}
                    onClick={() => {
                      setActiveMode(mode.id);
                      setIsModeModalOpen(false);
                    }}
                    style={{
                      background: isSelected ? 'rgba(88, 101, 242, 0.15)' : '#1F2025',
                      border: isSelected ? '1.5px solid #5865F2' : '1px solid #2C2D33',
                      borderRadius: '14px',
                      padding: '16px 20px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease-in-out',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      boxShadow: isSelected ? '0 0 16px rgba(88, 101, 242, 0.25)' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <b style={{ color: '#fff', fontSize: '15px', fontWeight: 700 }}>
                        {mode.title}
                      </b>
                      {isSelected && (
                        <CheckCircle2 size={16} color="#5865F2" />
                      )}
                    </div>
                    <div style={{ color: '#949BA4', fontSize: '13px' }}>
                      {mode.description}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};