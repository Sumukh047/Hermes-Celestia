import React, { useEffect, useState } from 'react';
import { api, stream } from '../api';
import {
  Cpu, RefreshCw, Download, CheckCircle2, AlertTriangle,
  Play, Sparkles, Layers, Sliders, HardDrive, Zap, Info,
  Globe, Search, Check, ExternalLink, ArrowRight, LogOut
} from 'lucide-react';

interface ModelItem {
  id: string;
  display_name?: string;
  loaded?: boolean;
  type?: string;
  architecture?: string;
  quantization?: string;
  size_bytes?: number;
  status?: string;
  max_context_length?: number;
  current_context_length?: number;
}

export default function AIEngine() {
  const [gatewayUrl, setGatewayUrl] = useState('http://127.0.0.1:1234');
  const [isEditingGateway, setIsEditingGateway] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [activeModel, setActiveModel] = useState<ModelItem | null>(null);
  const [form, setForm] = useState({
    model: '',
    context_length: 32768,
    gpu_offload: 'auto',
    flash_attention: true,
    offload_kv_cache_to_gpu: true
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isEjecting, setIsEjecting] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Quick Inference Tester State
  const [testPrompt, setTestPrompt] = useState('Write a 1-sentence motivational quote for an AI developer.');
  const [testResponse, setTestResponse] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [ttft, setTtft] = useState<number | null>(null);

  const handleSelectModel = (modelId: string, availableModels: ModelItem[] = models) => {
    const targetModel = availableModels.find(m => m.id === modelId);
    const maxCtx = targetModel?.max_context_length || 131072;
    const currentCtx = targetModel?.current_context_length;

    setForm(prev => {
      let newLength = prev.context_length;
      if (currentCtx) {
        newLength = currentCtx;
      } else if (newLength > maxCtx) {
        newLength = maxCtx;
      } else if (newLength < 2048) {
        newLength = Math.min(32768, maxCtx);
      }
      return {
        ...prev,
        model: modelId,
        context_length: newLength
      };
    });
  };

  const loadModels = async (overrideUrl?: string) => {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      // 1. Fetch health to get exact connection status and latency
      const healthRes = await api<any>('/health');
      const lmHealth = healthRes.lmstudio || {};
      const connected = !!lmHealth.connected;
      setIsConnected(connected);
      if (lmHealth.latency_ms) setLatency(lmHealth.latency_ms);
      if (lmHealth.base_url) setGatewayUrl(lmHealth.base_url);

      // 2. Fetch unified models catalog
      const catalog = await api<any>('/models');
      const fetchedModels: ModelItem[] = catalog.models || [];
      setModels(fetchedModels);

      if (catalog.gateway_url) setGatewayUrl(catalog.gateway_url);

      // Find actively loaded model (in VRAM)
      const loaded = fetchedModels.find(m => m.loaded) || null;
      setActiveModel(loaded);

      // Default select the active loaded model or the first model
      if (loaded) {
        handleSelectModel(loaded.id, fetchedModels);
      } else if (fetchedModels.length > 0) {
        handleSelectModel(fetchedModels[0].id, fetchedModels);
      }

      if (connected) {
        if (loaded) {
          const maxCtxK = Math.round((loaded.max_context_length || 131072) / 1024);
          setStatusMessage(`Connected to LM Studio! Model '${loaded.display_name || loaded.id}' is loaded in VRAM (Max: ${maxCtxK}K context).`);
        } else if (fetchedModels.length > 0) {
          setStatusMessage(`Connected to LM Studio at ${catalog.gateway_url || gatewayUrl}. ${fetchedModels.length} models found on disk.`);
        } else {
          setStatusMessage(`Connected to LM Studio at ${catalog.gateway_url || gatewayUrl}, but no models are loaded or downloaded yet.`);
        }
      } else {
        setStatusMessage(lmHealth.error || `LM Studio gateway is offline at ${gatewayUrl}. Please make sure the Local Server is started on port 1234.`);
      }
    } catch (e: any) {
      console.error('Failed to load models:', e);
      setIsConnected(false);
      setStatusMessage(`Could not connect to Hermes Agent Studio backend (http://127.0.0.1:8790): ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadModels();
  }, []);

  const handleAutoDetectGateway = async () => {
    setIsAutoDetecting(true);
    setStatusMessage('Scanning local network and loopback interfaces for active LM Studio...');
    try {
      const res = await api<any>('/models/gateway', {
        method: 'POST',
        body: JSON.stringify({ auto_detect: true })
      });

      if (res.connected && res.gateway_url) {
        setGatewayUrl(res.gateway_url);
        setStatusMessage(`Auto-detected LM Studio at ${res.gateway_url}! Loading models...`);
        await loadModels(res.gateway_url);
      } else {
        setStatusMessage(res.message || 'Could not find an active LM Studio server on port 1234. Make sure "Start Server" is clicked in LM Studio.');
      }
    } catch (e: any) {
      setStatusMessage(`Auto-detect failed: ${e.message}`);
    } finally {
      setIsAutoDetecting(false);
    }
  };

  const handleSaveGatewayUrl = async () => {
    setIsEditingGateway(false);
    setIsLoading(true);
    setStatusMessage(`Connecting to LM Studio at ${gatewayUrl}...`);
    try {
      const res = await api<any>('/models/gateway', {
        method: 'POST',
        body: JSON.stringify({ base_url: gatewayUrl })
      });
      if (res.connected) {
        setStatusMessage(`Successfully connected to LM Studio at ${gatewayUrl}!`);
        await loadModels(gatewayUrl);
      } else {
        setStatusMessage(res.error || `Failed to connect to LM Studio at ${gatewayUrl}.`);
      }
    } catch (e: any) {
      setStatusMessage(`Error setting gateway: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplySettings = async () => {
    if (!form.model) {
      alert('Please select a model first.');
      return;
    }
    setIsApplying(true);
    setStatusMessage(null);
    try {
      await api('/models/load', {
        method: 'POST',
        body: JSON.stringify(form)
      });
      setStatusMessage(`Model '${form.model}' loaded successfully with ${form.context_length.toLocaleString()} context tokens!`);
      await loadModels();
    } catch (e: any) {
      setStatusMessage(`Load error: ${e.message}`);
    } finally {
      setIsApplying(false);
    }
  };

  const handleEjectModel = async (modelId: string) => {
    if (!modelId) return;
    setIsEjecting(modelId);
    setStatusMessage(null);
    try {
      await api('/models/unload', {
        method: 'POST',
        body: JSON.stringify({ instance_id: modelId })
      });
      setStatusMessage(`Model '${modelId}' successfully ejected from LM Studio VRAM!`);
      await loadModels();
    } catch (e: any) {
      setStatusMessage(`Eject error: ${e.message}`);
    } finally {
      setIsEjecting(null);
    }
  };

  const handleQuickTest = async () => {
    if (!form.model) {
      alert('Select a model before testing.');
      return;
    }
    setTestResponse('');
    setTtft(null);
    setIsStreaming(true);

    try {
      await stream('/chat', {
        model: form.model,
        message: testPrompt,
        temperature: 0.7,
        max_tokens: 250
      }, {
        onToken: (tok) => setTestResponse(prev => prev + tok),
        onMeta: (meta) => {
          if (meta.ttft) setTtft(Math.round(meta.ttft * 1000));
        },
        onError: (err) => setTestResponse(prev => prev + `\n[Error: ${err}]`),
        onDone: () => setIsStreaming(false)
      });
    } catch (e: any) {
      setTestResponse(`Stream failed: ${e.message}`);
      setIsStreaming(false);
    }
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes) return '';
    const gb = bytes / (1024 ** 3);
    return `${gb.toFixed(2)} GB`;
  };

  // Determine current model's supported context window
  const selectedModel = models.find(m => m.id === form.model) || activeModel;
  const maxContext = selectedModel?.max_context_length || 131072;

  return (
    <>
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span className="eyebrow">Local Inference Engine</span>
          <h2>LM Studio AI Control Center</h2>
          <p>
            Connect to LM Studio running on this PC or local network. Manage loaded models, context windows,
            and GPU acceleration for your agent fleet with zero cloud telemetry.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="secondary"
            onClick={handleAutoDetectGateway}
            disabled={isAutoDetecting}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            title="Automatically scan localhost and LAN IP for running LM Studio"
          >
            <Search size={15} className={isAutoDetecting ? 'spin' : ''} />
            {isAutoDetecting ? 'Scanning...' : 'Auto-Detect'}
          </button>
          <button
            className="secondary"
            onClick={() => loadModels()}
            disabled={isLoading}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <RefreshCw size={15} className={isLoading ? 'spin' : ''} />
            {isLoading ? 'Refreshing...' : 'Refresh Models'}
          </button>
        </div>
      </div>

      {/* Gateway Endpoint Settings Bar */}
      <div style={{
        background: '#1E1F22',
        border: '1px solid #333',
        borderRadius: '10px',
        padding: '12px 18px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '300px' }}>
          <Globe size={18} color="#5865F2" />
          <span style={{ fontSize: '13px', color: '#888', fontWeight: 600 }}>LM Studio Gateway:</span>
          {isEditingGateway ? (
            <div style={{ display: 'flex', gap: '8px', flex: 1, maxWidth: '400px' }}>
              <input
                type="text"
                value={gatewayUrl}
                onChange={e => setGatewayUrl(e.target.value)}
                placeholder="http://127.0.0.1:1234 or LAN IP"
                style={{
                  padding: '6px 10px',
                  background: '#111',
                  border: '1px solid #5865F2',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '13px',
                  width: '100%'
                }}
              />
              <button
                className="primary"
                onClick={handleSaveGatewayUrl}
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                Save
              </button>
              <button
                className="secondary"
                onClick={() => setIsEditingGateway(false)}
                style={{ padding: '6px 10px', fontSize: '12px' }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <code style={{ background: '#111', padding: '4px 8px', borderRadius: '4px', color: '#5865F2', fontSize: '13px' }}>
                {gatewayUrl}
              </code>
              <button
                className="secondary"
                onClick={() => setIsEditingGateway(true)}
                style={{ padding: '2px 8px', fontSize: '11px' }}
              >
                Edit URL
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px' }}>
          {latency !== null && (
            <span style={{ color: '#888' }}>
              Latency: <strong style={{ color: '#57F287' }}>{latency} ms</strong>
            </span>
          )}
          <span style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: isConnected ? '#57F287' : '#ED4245',
            fontWeight: 700
          }}>
            <span
              className={isConnected ? 'dot on' : 'dot'}
              style={{
                width: '8px',
                height: '8px',
                background: isConnected ? '#57F287' : '#ED4245',
                borderRadius: '50%'
              }}
            />
            {isConnected ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
      </div>

      {/* Connection & Active Model Bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{ background: '#1E1F22', border: '1px solid #333', borderRadius: '12px', padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ background: isConnected ? 'rgba(87, 242, 135, 0.15)' : 'rgba(237, 66, 69, 0.15)', padding: '12px', borderRadius: '50%', color: isConnected ? '#57F287' : '#ED4245' }}>
            <Cpu size={24} />
          </div>
          <div>
            <div style={{ color: '#888', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase' }}>LM Studio Gateway</div>
            <div style={{ color: isConnected ? '#57F287' : '#ED4245', fontSize: '18px', fontWeight: 700 }}>
              {isConnected ? 'CONNECTED' : 'OFFLINE'}
            </div>
          </div>
        </div>

        <div style={{ background: '#1E1F22', border: '1px solid #333', borderRadius: '12px', padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ background: 'rgba(88, 101, 242, 0.15)', padding: '12px', borderRadius: '50%', color: '#5865F2' }}>
            <Layers size={24} />
          </div>
          <div>
            <div style={{ color: '#888', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase' }}>Available Models</div>
            <div style={{ color: '#fff', fontSize: '18px', fontWeight: 700 }}>
              {models.length} Discovered
            </div>
          </div>
        </div>

        <div style={{ background: '#1E1F22', border: '1px solid #333', borderRadius: '12px', padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ background: activeModel ? 'rgba(87, 242, 135, 0.15)' : 'rgba(254, 231, 92, 0.15)', padding: '12px', borderRadius: '50%', color: activeModel ? '#57F287' : '#FEE75C' }}>
            <Zap size={24} />
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ color: '#888', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase' }}>Loaded in VRAM</div>
            <div style={{ color: activeModel ? '#57F287' : '#fff', fontSize: '15px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {activeModel ? (activeModel.display_name || activeModel.id) : (form.model || 'No model loaded')}
            </div>
          </div>
        </div>
      </div>

      {statusMessage && (
        <div style={{
          padding: '14px 18px',
          background: statusMessage.includes('error') || statusMessage.includes('offline') || statusMessage.includes('Could not')
            ? 'rgba(237, 66, 69, 0.15)'
            : 'rgba(87, 242, 135, 0.15)',
          border: `1px solid ${statusMessage.includes('error') || statusMessage.includes('offline') || statusMessage.includes('Could not') ? '#ED4245' : '#57F287'}`,
          borderRadius: '8px',
          color: statusMessage.includes('error') || statusMessage.includes('offline') || statusMessage.includes('Could not') ? '#ED4245' : '#57F287',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          {statusMessage.includes('error') || statusMessage.includes('offline') || statusMessage.includes('Could not')
            ? <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            : <CheckCircle2 size={18} style={{ flexShrink: 0 }} />}
          <span style={{ fontSize: '14px', lineHeight: 1.5 }}>{statusMessage}</span>
        </div>
      )}

      {/* Main Configuration Grid */}
      <div className="grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
        {/* Left Column: Discovered Models */}
        <div className="card" style={{ background: '#1E1F22', border: '1px solid #333', borderRadius: '12px', padding: '24px' }}>
          <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px' }}>
            <HardDrive size={18} color="#5865F2" /> Discovered Local Models ({models.length})
          </h3>
          <p style={{ color: '#888', fontSize: '13px', margin: '0 0 16px 0' }}>
            Models detected from LM Studio. Models marked with <strong style={{ color: '#57F287' }}>READY</strong> are currently loaded in VRAM.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '480px', overflowY: 'auto' }}>
            {models.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: '#888', background: '#111', borderRadius: '8px' }}>
                <p style={{ margin: '0 0 12px 0' }}>No models discovered yet.</p>
                <button
                  className="primary"
                  onClick={handleAutoDetectGateway}
                  disabled={isAutoDetecting}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Search size={14} /> Auto-Detect LM Studio
                </button>
              </div>
            ) : (
              models.map(m => {
                const isSelected = form.model === m.id;
                const isLoaded = !!m.loaded;
                const maxCtxK = Math.round((m.max_context_length || 131072) / 1024);
                return (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 16px',
                      background: isSelected ? 'rgba(88, 101, 242, 0.15)' : '#2B2D31',
                      border: isLoaded ? '1px solid #57F287' : (isSelected ? '1px solid #5865F2' : '1px solid #383A40'),
                      borderRadius: '8px'
                    }}
                  >
                    <div style={{ overflow: 'hidden', marginRight: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <b style={{ color: '#fff', fontSize: '14px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          {m.display_name || m.id}
                        </b>
                        {isLoaded && (
                          <span style={{
                            background: 'rgba(87, 242, 135, 0.2)',
                            color: '#57F287',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 700
                          }}>
                            READY IN VRAM
                          </span>
                        )}
                      </div>
                      <small style={{ color: '#888', fontSize: '12px' }}>
                        {m.id} {m.quantization && `· ${m.quantization}`} {m.size_bytes ? `· ${formatBytes(m.size_bytes)}` : ''} · <span style={{ color: '#5865F2', fontWeight: 600 }}>{maxCtxK}K ctx</span>
                      </small>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {isLoaded && (
                        <button
                          className="secondary"
                          onClick={() => handleEjectModel(m.id)}
                          disabled={isEjecting === m.id}
                          style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            background: 'rgba(237, 66, 69, 0.15)',
                            border: '1px solid #ED4245',
                            color: '#ED4245',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            whiteSpace: 'nowrap'
                          }}
                          title="Eject this model from VRAM"
                        >
                          <LogOut size={12} className={isEjecting === m.id ? 'spin' : ''} />
                          {isEjecting === m.id ? 'Ejecting...' : 'Eject'}
                        </button>
                      )}
                      <button
                        className="secondary"
                        onClick={() => handleSelectModel(m.id)}
                        style={{
                          padding: '6px 14px',
                          fontSize: '12px',
                          fontWeight: 600,
                          background: isSelected ? '#5865F2' : 'transparent',
                          color: '#fff',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {isSelected ? 'Selected' : 'Select'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Offloading & Context Tuning */}
        <div className="card" style={{ background: '#1E1F22', border: '1px solid #333', borderRadius: '12px', padding: '24px' }}>
          <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px' }}>
            <Sliders size={18} color="#EB459E" /> Engine Parameters & Memory Tuning
          </h3>
          <p style={{ color: '#888', fontSize: '13px', margin: '0 0 20px 0' }}>
            Configure context window and GPU offloading before loading or applying settings.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase' }}>Target Model</span>
              <select
                value={form.model}
                onChange={e => handleSelectModel(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #333', background: '#111', color: '#fff' }}
              >
                {models.map(m => {
                  const maxCtxK = Math.round((m.max_context_length || 131072) / 1024);
                  return (
                    <option key={m.id} value={m.id}>
                      {m.display_name || m.id} ({maxCtxK}K context) {m.loaded ? '✓ (Loaded in VRAM)' : ''}
                    </option>
                  );
                })}
              </select>
            </label>

            {/* Dynamic Context Window Config matching model capability */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase' }}>
                  Context Window (Tokens)
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    min="1024"
                    max={maxContext}
                    step="1024"
                    value={form.context_length}
                    onChange={e => {
                      const val = Math.max(512, Math.min(maxContext, Number(e.target.value) || 2048));
                      setForm({ ...form, context_length: val });
                    }}
                    style={{
                      width: '100px',
                      padding: '4px 8px',
                      background: '#111',
                      border: '1px solid #5865F2',
                      borderRadius: '6px',
                      color: '#5865F2',
                      fontWeight: 700,
                      fontSize: '14px',
                      textAlign: 'right'
                    }}
                  />
                  <span style={{ color: '#888', fontSize: '13px', fontWeight: 600 }}>tokens</span>
                </div>
              </div>

              {/* Subtitle showing model maximum context support - exactly like LM Studio! */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#888' }}>
                <span>Model supports up to</span>
                <span style={{
                  background: '#2B2D31',
                  color: '#fff',
                  border: '1px solid #444',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontWeight: 700,
                  fontSize: '12px'
                }}>
                  {maxContext.toLocaleString()}
                </span>
                <span>tokens</span>
                {selectedModel?.loaded && selectedModel.current_context_length && (
                  <span style={{ color: '#57F287', marginLeft: 'auto', fontSize: '11px', fontWeight: 600 }}>
                    Active: {selectedModel.current_context_length.toLocaleString()}
                  </span>
                )}
              </div>

              {/* Slider extending dynamically up to maxContext */}
              <input
                type="range"
                min="2048"
                max={maxContext}
                step={maxContext > 65536 ? "2048" : "1024"}
                value={form.context_length}
                onChange={e => setForm({ ...form, context_length: +e.target.value })}
                style={{ width: '100%', accentColor: '#5865F2', marginTop: '6px' }}
              />

              {/* Quick Presets matching model capacity */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                {[4096, 8192, 16384, 32768, 65536, 131072, 262144]
                  .filter(val => val <= maxContext)
                  .map(val => {
                    const isCurrent = form.context_length === val;
                    const label = val >= 1024 * 1024 ? `${val / (1024 * 1024)}M` : `${val / 1024}K`;
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setForm({ ...form, context_length: val })}
                        style={{
                          padding: '3px 9px',
                          fontSize: '11px',
                          fontWeight: isCurrent ? 700 : 500,
                          borderRadius: '4px',
                          background: isCurrent ? '#5865F2' : '#2B2D31',
                          color: isCurrent ? '#fff' : '#aaa',
                          border: isCurrent ? '1px solid #5865F2' : '1px solid #383A40',
                          cursor: 'pointer'
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                {/* Max Button */}
                <button
                  type="button"
                  onClick={() => setForm({ ...form, context_length: maxContext })}
                  style={{
                    padding: '3px 9px',
                    fontSize: '11px',
                    fontWeight: form.context_length === maxContext ? 700 : 500,
                    borderRadius: '4px',
                    background: form.context_length === maxContext ? '#EB459E' : 'rgba(235, 69, 158, 0.15)',
                    color: form.context_length === maxContext ? '#fff' : '#EB459E',
                    border: '1px solid #EB459E',
                    cursor: 'pointer',
                    marginLeft: 'auto'
                  }}
                >
                  Max ({maxContext >= 1024 ? `${Math.round(maxContext / 1024)}K` : maxContext})
                </button>
              </div>

              {/* Dynamic scale labels below slider */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#666', marginTop: '2px' }}>
                <span>2K (Low RAM)</span>
                <span>{Math.round(maxContext * 0.25 / 1024)}K</span>
                <span>{Math.round(maxContext * 0.5 / 1024)}K</span>
                <span>{Math.round(maxContext * 0.75 / 1024)}K</span>
                <span>{Math.round(maxContext / 1024)}K (Max)</span>
              </div>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase' }}>GPU Offload Strategy</span>
              <select
                value={form.gpu_offload}
                onChange={e => setForm({ ...form, gpu_offload: e.target.value })}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #333', background: '#111', color: '#fff' }}
              >
                <option value="auto">Auto (Detect VRAM Capacity)</option>
                <option value="max">Max (Offload 100% layers to GPU)</option>
                <option value="0.75">75% GPU Layers (Hybrid)</option>
                <option value="0.5">50% GPU Layers (Balanced)</option>
                <option value="off">CPU Only (No GPU)</option>
              </select>
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', color: '#fff', fontSize: '14px' }}>
                <input
                  type="checkbox"
                  checked={form.flash_attention}
                  onChange={e => setForm({ ...form, flash_attention: e.target.checked })}
                  style={{ width: '18px', height: '18px', accentColor: '#5865F2' }}
                />
                Enable Flash Attention (Faster generation, reduced memory)
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', color: '#fff', fontSize: '14px' }}>
                <input
                  type="checkbox"
                  checked={form.offload_kv_cache_to_gpu}
                  onChange={e => setForm({ ...form, offload_kv_cache_to_gpu: e.target.checked })}
                  style={{ width: '18px', height: '18px', accentColor: '#5865F2' }}
                />
                Offload KV Cache to GPU (Minimizes CPU bottlenecks)
              </label>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
              <button
                className="primary"
                onClick={handleApplySettings}
                disabled={isApplying || !form.model}
                style={{ flex: 1, padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 600 }}
              >
                <Download size={16} className={isApplying ? 'spin' : ''} />
                {isApplying ? 'Applying in LM Studio...' : 'Apply & Load Model in LM Studio'}
              </button>
              {models.find(m => m.id === form.model)?.loaded && (
                <button
                  className="secondary"
                  onClick={() => handleEjectModel(form.model)}
                  disabled={isEjecting === form.model}
                  style={{
                    padding: '12px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    fontWeight: 600,
                    background: 'rgba(237, 66, 69, 0.15)',
                    border: '1px solid #ED4245',
                    color: '#ED4245'
                  }}
                  title="Eject model to free VRAM"
                >
                  <LogOut size={16} className={isEjecting === form.model ? 'spin' : ''} />
                  {isEjecting === form.model ? 'Ejecting...' : 'Eject Model'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Real-Time Inference Tester */}
      <div className="card" style={{ background: '#1E1F22', border: '1px solid #333', borderRadius: '12px', padding: '24px', marginBottom: '32px' }}>
        <h3 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px' }}>
          <Play size={18} color="#57F287" /> Real-Time Inference Verifier
        </h3>
        <p style={{ color: '#888', fontSize: '13px', margin: '0 0 18px 0' }}>
          Send a token-streaming test probe to verify that the selected model is responding quickly and check Time-to-First-Token (TTFT).
        </p>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <input
            type="text"
            value={testPrompt}
            onChange={e => setTestPrompt(e.target.value)}
            placeholder="Type a test prompt..."
            style={{ flex: 1, padding: '12px 16px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff', outline: 'none' }}
            onKeyDown={e => { if (e.key === 'Enter') handleQuickTest(); }}
          />
          <button
            className="primary"
            onClick={handleQuickTest}
            disabled={isStreaming || !form.model}
            style={{ padding: '0 24px', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
          >
            <Zap size={16} />
            {isStreaming ? 'Streaming...' : 'Run Probe'}
          </button>
        </div>

        {/* Streaming Output Box */}
        {(testResponse || isStreaming) && (
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: '8px', padding: '16px', marginTop: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #222', paddingBottom: '8px', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', color: '#888', fontWeight: 600, textTransform: 'uppercase' }}>Live Model Output</span>
              {ttft && (
                <span style={{ fontSize: '12px', color: '#57F287', fontWeight: 600 }}>
                  TTFT: {ttft} ms
                </span>
              )}
            </div>
            <div style={{ color: '#fff', fontSize: '14px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {testResponse || <span style={{ color: '#666' }}>Waiting for first token...</span>}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
