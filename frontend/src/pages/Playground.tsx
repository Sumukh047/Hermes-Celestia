import React, { useEffect, useState } from 'react';
import { api, stream } from '../api';
import {
  FlaskConical, Play, Sparkles, Sliders, Copy, RefreshCw,
  CheckCircle2, Clock, Zap, MessageSquare, Terminal
} from 'lucide-react';

interface ModelItem {
  id: string;
}

export default function Playground() {
  const [models, setModels] = useState<ModelItem[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('You are an expert autonomous AI assistant. Be direct, clear, and concise.');
  const [prompt, setPrompt] = useState('Draft a clear, professional update email summarizing that our agent pipeline is now live on LM Studio with zero cloud latency.');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [response, setResponse] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [ttft, setTtft] = useState<number | null>(null);
  const [tokenCount, setTokenCount] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api<{ models: ModelItem[] }>('/models')
      .then(res => {
        setModels(res.models || []);
        if (res.models && res.models.length > 0) {
          setSelectedModel(res.models[0].id);
        }
      })
      .catch(e => console.error('Failed to load models for playground', e));
  }, []);

  const handleExecute = async () => {
    if (!prompt.trim() || isStreaming) return;
    if (!selectedModel) {
      alert('Please select a model first.');
      return;
    }

    setResponse('');
    setTtft(null);
    setTokenCount(0);
    setIsStreaming(true);

    let count = 0;
    try {
      await stream('/chat', {
        model: selectedModel,
        system_prompt: systemPrompt,
        message: prompt,
        temperature,
        max_tokens: maxTokens
      }, {
        onToken: (tok) => {
          count++;
          setTokenCount(count);
          setResponse(prev => prev + tok);
        },
        onMeta: (meta) => {
          if (meta.ttft) setTtft(Math.round(meta.ttft * 1000));
        },
        onError: (err) => {
          setResponse(prev => prev + `\n[Stream Error: ${err}]`);
        },
        onDone: () => {
          setIsStreaming(false);
        }
      });
    } catch (e: any) {
      setResponse(`Execution error: ${e.message}`);
      setIsStreaming(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(response);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span className="eyebrow">Local Experimentation</span>
          <h2>Inference Playground</h2>
          <p>
            Test prompts, tweak temperature, and observe streaming token dynamics across any loaded model
            before deploying into a production agent pipeline.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px', marginBottom: '32px' }}>
        {/* Left Column: Prompts & Response */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="card" style={{ background: '#1E1F22', border: '1px solid #333', borderRadius: '12px', padding: '20px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase' }}>System Prompt</span>
              <textarea
                rows={3}
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                style={{ width: '100%', padding: '12px', background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '14px', lineHeight: 1.5, resize: 'vertical' }}
              />
            </label>
          </div>

          <div className="card" style={{ background: '#1E1F22', border: '1px solid #333', borderRadius: '12px', padding: '20px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase' }}>User Input Prompt</span>
              <textarea
                rows={5}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Enter prompt to execute..."
                style={{ width: '100%', padding: '12px', background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '14px', lineHeight: 1.5, resize: 'vertical' }}
              />
            </label>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="secondary"
                  onClick={() => setPrompt("Perform a SWOT analysis for migrating from cloud AI APIs to local LM Studio.")}
                  style={{ fontSize: '12px', padding: '6px 10px' }}
                >
                  SWOT Template
                </button>
                <button
                  className="secondary"
                  onClick={() => setPrompt("Generate a strict JSON schema for an autonomous research agent.")}
                  style={{ fontSize: '12px', padding: '6px 10px' }}
                >
                  JSON Schema
                </button>
              </div>

              <button
                className="primary"
                onClick={handleExecute}
                disabled={isStreaming || !prompt.trim()}
                style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}
              >
                <Play size={16} />
                {isStreaming ? 'Streaming Tokens...' : 'Execute Prompt'}
              </button>
            </div>
          </div>

          {/* Output Window */}
          <div className="card" style={{ background: '#1E1F22', border: '1px solid #333', borderRadius: '12px', padding: '20px', minHeight: '260px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #2B2D31', paddingBottom: '12px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase' }}>Live Model Stream</span>
                {ttft && (
                  <span style={{ fontSize: '12px', color: '#57F287', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} /> TTFT: {ttft}ms
                  </span>
                )}
                {tokenCount > 0 && (
                  <span style={{ fontSize: '12px', color: '#5865F2', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Zap size={12} /> {tokenCount} tokens
                  </span>
                )}
              </div>

              {response && (
                <button className="secondary" onClick={handleCopy} style={{ padding: '4px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {copied ? <CheckCircle2 size={13} color="#57F287" /> : <Copy size={13} />}
                  {copied ? 'Copied!' : 'Copy Response'}
                </button>
              )}
            </div>

            <div style={{ color: '#fff', fontSize: '14px', lineHeight: 1.6, whiteSpace: 'pre-wrap', flexGrow: 1 }}>
              {response || (isStreaming ? <span style={{ color: '#888' }}>Waiting for first token from LM Studio...</span> : <span style={{ color: '#666' }}>Output will stream here in real time.</span>)}
            </div>
          </div>
        </div>

        {/* Right Column: Model Hyperparameters Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="card" style={{ background: '#1E1F22', border: '1px solid #333', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '17px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sliders size={18} color="#5865F2" /> Hyperparameters
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase' }}>Active Model</span>
                <select
                  value={selectedModel}
                  onChange={e => setSelectedModel(e.target.value)}
                  style={{ width: '100%', padding: '10px', background: '#111', border: '1px solid #333', borderRadius: '6px', color: '#fff' }}
                >
                  {models.map(m => (
                    <option key={m.id} value={m.id}>{m.id}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase' }}>Temperature</span>
                  <span style={{ color: '#5865F2', fontWeight: 700 }}>{temperature}</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.5"
                  step="0.05"
                  value={temperature}
                  onChange={e => setTemperature(+e.target.value)}
                  style={{ width: '100%', accentColor: '#5865F2' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#666' }}>
                  <span>0.0 (Deterministic)</span>
                  <span>1.0 (Creative)</span>
                </div>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase' }}>Max Tokens</span>
                  <span style={{ color: '#5865F2', fontWeight: 700 }}>{maxTokens}</span>
                </div>
                <input
                  type="range"
                  min="128"
                  max="4096"
                  step="128"
                  value={maxTokens}
                  onChange={e => setMaxTokens(+e.target.value)}
                  style={{ width: '100%', accentColor: '#5865F2' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#666' }}>
                  <span>128</span>
                  <span>2048</span>
                  <span>4096</span>
                </div>
              </label>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
