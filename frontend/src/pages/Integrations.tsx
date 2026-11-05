import React, { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import { api } from '../api';
import {
  PlugZap, ShieldCheck, Info, ExternalLink, Key, CheckCircle2,
  AlertTriangle, Mail, Send, MessageSquare, RefreshCw, Smartphone,
  Globe, Hash, HelpCircle, LogOut
} from 'lucide-react';

interface IntegrationMeta {
  key: string;
  name: string;
  category: string;
  risk: string;
  description: string;
  configured: boolean;
}

function QRScanner() {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('initializing');
  const [phone, setPhone] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  useEffect(() => {
    const checkQR = async () => {
      try {
        let data = null;
        try {
          const res = await fetch('/api/integrations/whatsapp/qr');
          if (res.ok) data = await res.json();
        } catch {}

        if (!data || data.status === 'offline') {
          try {
            const res2 = await fetch('http://127.0.0.1:3001/qr');
            if (res2.ok) data = await res2.json();
          } catch {
            const res3 = await fetch('http://localhost:3001/qr');
            if (res3.ok) data = await res3.json();
          }
        }

        if (data) {
          setStatus(data.status);
          if (data.phone) setPhone(data.phone);
          if (data.qr) setQrCode(data.qr);
        } else {
          setStatus('offline');
        }
      } catch {
        setStatus('offline');
      }
    };

    checkQR();
    const interval = setInterval(checkQR, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleUnlink = async () => {
    if (!window.confirm("Unlink WhatsApp?\n\nThis will disconnect your currently paired device and generate a fresh QR code so you can link again with a different device or the same device.")) {
      return;
    }
    setUnlinking(true);
    setFeedbackMsg("Unlinking device and resetting session...");
    try {
      let res = await fetch('/api/integrations/whatsapp/unlink', { method: 'POST' });
      if (!res.ok) {
        res = await fetch('http://localhost:3001/unlink', { method: 'POST' });
      }
      const data = await res.json();
      setQrCode(null);
      setPhone(null);
      setStatus('initializing');
      setFeedbackMsg(data.message || "Unlinked successfully! Generating fresh QR code...");
      setTimeout(() => setFeedbackMsg(null), 5000);
    } catch (e: any) {
      console.error("Failed to unlink WhatsApp:", e);
      alert("Failed to unlink: " + (e?.message || e));
    } finally {
      setUnlinking(false);
    }
  };

  if (status === 'offline') {
    return (
      <div style={{ textAlign: 'center', color: '#B5BAC1', padding: '30px 10px' }}>
        <AlertTriangle size={36} color="#FEE75C" style={{ marginBottom: '12px' }} />
        <div style={{ fontWeight: 600, color: '#fff', marginBottom: '6px' }}>Local Bridge Offline</div>
        <p style={{ fontSize: '13px', lineHeight: 1.5, margin: '0 0 12px 0' }}>
          The WhatsApp bridge microservice is starting or not running.
        </p>
        <code style={{ background: '#111', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', display: 'inline-block' }}>
          node backend/wa-bridge/server.js
        </code>
      </div>
    );
  }

  if (status === 'ready') {
    return (
      <div style={{ textAlign: 'center', padding: '16px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <CheckCircle2 size={48} color="#00a884" style={{ marginBottom: '10px' }} />
        <div style={{ fontSize: '18px', fontWeight: 700, color: '#111b21' }}>WhatsApp Connected!</div>
        {phone && (
          <div style={{ color: '#54656f', fontSize: '14px', marginTop: '6px' }}>
            Paired number: <strong style={{ color: '#008069' }}>+{phone}</strong>
          </div>
        )}
        <p style={{ fontSize: '12px', color: '#667781', marginTop: '6px', marginBottom: '18px', lineHeight: 1.4, maxWidth: '240px' }}>
          Your phone is linked. The agent can now send and receive messages.
        </p>

        {feedbackMsg && (
          <div style={{ background: '#e7f8f0', color: '#008069', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', marginBottom: '12px', border: '1px solid #c2ebd7' }}>
            {feedbackMsg}
          </div>
        )}

        {/* Action Button: Unlink and Link with Different / Same Device */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '240px' }}>
          <button
            onClick={handleUnlink}
            disabled={unlinking}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '10px 16px',
              borderRadius: '8px',
              border: '1px solid #ED4245',
              background: '#ED4245',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: unlinking ? 'not-allowed' : 'pointer',
              opacity: unlinking ? 0.7 : 1,
              boxShadow: '0 2px 6px rgba(237, 66, 69, 0.25)',
              transition: 'all 0.2s'
            }}
          >
            {unlinking ? (
              <>
                <RefreshCw size={14} className="spin" />
                <span>Unlinking Device...</span>
              </>
            ) : (
              <>
                <LogOut size={14} />
                <span>Unlink & Link Again</span>
              </>
            )}
          </button>
          <span style={{ fontSize: '11px', color: '#8696a0', lineHeight: 1.3 }}>
            Unlink to scan QR with a different device or re-pair this phone
          </span>
        </div>
      </div>
    );
  }

  if (qrCode) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {feedbackMsg && (
          <div style={{ background: '#e7f8f0', color: '#008069', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', marginBottom: '10px', border: '1px solid #c2ebd7' }}>
            {feedbackMsg}
          </div>
        )}
        <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
          <QRCode value={qrCode} size={220} fgColor="#111" />
        </div>
        <span style={{ fontSize: '12px', color: '#00a884', marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
          <span className="dot on" style={{ width: '8px', height: '8px', background: '#00a884' }}></span> Real-time QR live from WhatsApp
        </span>
        <button
          onClick={handleUnlink}
          disabled={unlinking}
          style={{
            marginTop: '10px',
            background: 'transparent',
            border: 'none',
            color: '#667781',
            fontSize: '11px',
            cursor: 'pointer',
            textDecoration: 'underline'
          }}
        >
          Regenerate / Force new QR
        </button>
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'center', color: '#888', padding: '40px 10px' }}>
      {feedbackMsg && (
        <div style={{ background: '#e7f8f0', color: '#008069', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', marginBottom: '14px', border: '1px solid #c2ebd7' }}>
          {feedbackMsg}
        </div>
      )}
      <RefreshCw size={28} className="spin" style={{ marginBottom: '12px' }} />
      <div style={{ color: '#54656f', fontWeight: 500 }}>Generating live QR code...</div>
    </div>
  );
}

export default function Integrations() {
  const [integrations, setIntegrations] = useState<IntegrationMeta[]>([]);
  const [selected, setSelected] = useState<IntegrationMeta | null>(null);
  const [config, setConfig] = useState<Record<string, any>>({});
  const [emailTab, setEmailTab] = useState<'app_password' | 'oauth'>('app_password');
  const [whatsappTab, setWhatsappTab] = useState<'qr' | 'cloud'>('qr');
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const load = () => {
    api<IntegrationMeta[]>('/integrations')
      .then(setIntegrations)
      .catch(e => console.error("Failed to load integrations", e));
  };

  useEffect(() => {
    load();
  }, []);

  const openModal = async (item: IntegrationMeta) => {
    setSelected(item);
    setTestResult(null);
    setSaveStatus(null);
    try {
      const res = await api<any>(`/integrations/${item.key}`);
      setConfig(res.config || {});
      if (item.key === 'email' || item.key === 'gmail') {
        if (res.config?.access_token) setEmailTab('oauth');
        else setEmailTab('app_password');
      }
    } catch {
      setConfig({});
    }
  };

  const handleTestConnection = async () => {
    if (!selected) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await api<any>(`/integrations/${selected.key}/test`, {
        method: 'POST',
        body: JSON.stringify({ config })
      });
      setTestResult(res);
    } catch (e: any) {
      setTestResult({ success: false, error: e.message });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!selected) return;
    setIsSaving(true);
    setSaveStatus(null);
    try {
      await api(`/integrations/${selected.key}`, {
        method: 'POST',
        body: JSON.stringify({ config, enabled: true })
      });
      setSaveStatus("Saved successfully!");
      load();
      setTimeout(() => {
        setSelected(null);
        setSaveStatus(null);
      }, 1000);
    } catch (e: any) {
      alert("Failed to save integration: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Integration Marketplace</span>
          <h2>Connect Tools & Services to Your Agents</h2>
          <p>Easy 1-click setup for WhatsApp, Email, Telegram, and Discord. Credentials stay 100% local and encrypted.</p>
        </div>
      </div>

      <div className="integration-grid">
        {integrations.map(integration => (
          <div
            className="integration card-hover"
            key={integration.key}
            onClick={() => openModal(integration)}
            style={{ cursor: 'pointer' }}
          >
            <div className="integration-icon" style={{ backgroundColor: integration.configured ? '#2d8a4e' : '#2b2d31' }}>
              {integration.configured ? <CheckCircle2 size={20} color="#57F287" /> : <PlugZap size={20} color="#5865F2" />}
            </div>
            <b>{integration.name}</b>
            <small style={{ color: '#888' }}>
              {integration.category} &middot; <span className={`risk-${integration.risk}`}>{integration.risk} risk</span>
            </small>
            <p style={{ margin: '8px 0 16px 0', fontSize: '13px', color: '#B5BAC1', flexGrow: 1 }}>{integration.description}</p>
            <span className={`pill ${integration.configured ? 'active' : ''}`}>
              {integration.configured ? '✓ Connected' : 'Set Up'}
            </span>
          </div>
        ))}
      </div>

      {selected && (
        <div className="overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '720px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="integration-icon large" style={{ backgroundColor: '#2b2d31' }}>
                  <PlugZap size={24} color="#5865F2" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '22px' }}>{selected.name} Configuration</h3>
                  <p style={{ margin: '4px 0 0 0', color: '#888', fontSize: '13px' }}>{selected.description}</p>
                </div>
              </div>
              <button className="secondary" onClick={() => setSelected(null)} style={{ padding: '6px 12px' }}>✕</button>
            </div>

            <div className="notice" style={{ display: 'flex', gap: '10px', alignItems: 'center', backgroundColor: '#1a2219', color: '#4ade80', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '13px' }}>
              <ShieldCheck size={20} style={{ flexShrink: 0 }} />
              <span><b>Local-First Security:</b> Credentials are encrypted with Fernet AES-128 and stored only in your local SQLite database on this PC. Never sent to the cloud.</span>
            </div>

            {/* Test Connection Result Banner */}
            {testResult && (
              <div style={{
                padding: '14px 16px',
                borderRadius: '8px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                backgroundColor: testResult.success ? 'rgba(87, 242, 135, 0.15)' : 'rgba(237, 66, 69, 0.15)',
                border: `1px solid ${testResult.success ? '#57F287' : '#ED4245'}`,
                color: testResult.success ? '#57F287' : '#ED4245',
                fontSize: '14px'
              }}>
                {testResult.success ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
                <div>{testResult.message || testResult.error}</div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* WHATSAPP CONFIGURATION                                         */}
            {/* ------------------------------------------------------------- */}
            {selected.key === 'whatsapp' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #333', paddingBottom: '12px' }}>
                  <button
                    className={`secondary ${whatsappTab === 'qr' ? 'active' : ''}`}
                    onClick={() => setWhatsappTab('qr')}
                    style={{ fontWeight: 600, background: whatsappTab === 'qr' ? '#5865F2' : 'transparent', color: '#fff' }}
                  >
                    <Smartphone size={16} /> QR Code Login (Hermes CLI Style)
                  </button>
                  <button
                    className={`secondary ${whatsappTab === 'cloud' ? 'active' : ''}`}
                    onClick={() => setWhatsappTab('cloud')}
                    style={{ fontWeight: 600, background: whatsappTab === 'cloud' ? '#5865F2' : 'transparent', color: '#fff' }}
                  >
                    <Globe size={16} /> Meta Cloud API (Business)
                  </button>
                </div>

                {whatsappTab === 'qr' ? (
                  <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', padding: '20px', backgroundColor: '#fff', borderRadius: '12px', color: '#111' }}>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: 600, color: '#111b21' }}>
                        Pair with WhatsApp on Your Phone
                      </h3>
                      <ol style={{ paddingLeft: '20px', margin: 0, fontSize: '15px', color: '#3b4a54', lineHeight: 2 }}>
                        <li>Open <strong>WhatsApp</strong> on your mobile phone</li>
                        <li>Tap <strong>Menu</strong> (Android ⋮) or <strong>Settings</strong> (iPhone ⚙️)</li>
                        <li>Select <strong>Linked devices</strong> &rarr; <strong>Link a device</strong></li>
                        <li>Point your phone camera to scan the QR code on the right</li>
                      </ol>

                      {/* "You" Chat Sandbox Mode */}
                      <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#f0f2f5', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 600, color: '#111' }}>
                          <input
                            type="checkbox"
                            checked={config.only_you_chat ?? true}
                            onChange={e => setConfig({ ...config, only_you_chat: e.target.checked })}
                            style={{ width: '18px', height: '18px', accentColor: '#008069' }}
                          />
                          Agent is active ONLY in "You" (Self Notes) chat
                        </label>
                        <p style={{ margin: '6px 0 0 28px', fontSize: '13px', color: '#555', lineHeight: 1.4 }}>
                          Recommended: The agent will only read and reply to messages in your personal self-chat, completely ignoring other contacts and group chats.
                        </p>
                      </div>
                    </div>

                    <div style={{ width: '260px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <QRScanner />
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <Field label="System User Access Token">
                      <input
                        type="password"
                        placeholder="EAAI... (Permanent or temporary token)"
                        value={config.access_token || ''}
                        onChange={e => setConfig({ ...config, access_token: e.target.value })}
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #333', background: '#111', color: '#fff' }}
                      />
                    </Field>
                    <Field label="Phone Number ID">
                      <input
                        type="text"
                        placeholder="e.g. 1029384756"
                        value={config.phone_number_id || ''}
                        onChange={e => setConfig({ ...config, phone_number_id: e.target.value })}
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #333', background: '#111', color: '#fff' }}
                      />
                    </Field>
                  </div>
                )}
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* EMAIL / GMAIL CONFIGURATION                                    */}
            {/* ------------------------------------------------------------- */}
            {(selected.key === 'email' || selected.key === 'gmail') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #333', paddingBottom: '12px' }}>
                  <button
                    className={`secondary ${emailTab === 'app_password' ? 'active' : ''}`}
                    onClick={() => setEmailTab('app_password')}
                    style={{ fontWeight: 600, background: emailTab === 'app_password' ? '#5865F2' : 'transparent', color: '#fff' }}
                  >
                    <Mail size={16} /> App Password (Easiest - Gmail, Outlook, Yahoo)
                  </button>
                  <button
                    className={`secondary ${emailTab === 'oauth' ? 'active' : ''}`}
                    onClick={() => setEmailTab('oauth')}
                    style={{ fontWeight: 600, background: emailTab === 'oauth' ? '#5865F2' : 'transparent', color: '#fff' }}
                  >
                    <Globe size={16} /> Google Cloud OAuth2
                  </button>
                </div>

                {emailTab === 'app_password' ? (
                  <>
                    <div style={{ background: '#212226', padding: '16px', borderRadius: '8px', border: '1px solid #333', fontSize: '13px', lineHeight: 1.6 }}>
                      <div style={{ fontWeight: 600, color: '#fff', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Info size={16} color="#5865F2" /> 2-Minute Gmail / Outlook App Password Setup:
                      </div>
                      <ol style={{ paddingLeft: '20px', margin: 0, color: '#B5BAC1' }}>
                        <li>Enable <strong>2-Step Verification</strong> on your Google / Microsoft account.</li>
                        <li>
                          Open <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" style={{ color: '#5865F2' }}>Google App Passwords <ExternalLink size={12} /></a> and generate a 16-character password named "Hermes".
                        </li>
                        <li>Paste your email address and the 16-character password below.</li>
                      </ol>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <Field label="Email Address">
                        <input
                          type="email"
                          placeholder="yourname@gmail.com"
                          value={config.email || config.username || ''}
                          onChange={e => setConfig({ ...config, email: e.target.value })}
                          style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #333', background: '#111', color: '#fff' }}
                        />
                      </Field>
                      <Field label="App Password (16 characters)">
                        <input
                          type="password"
                          placeholder="abcd efgh ijkl mnop"
                          value={config.app_password || ''}
                          onChange={e => setConfig({ ...config, app_password: e.target.value })}
                          style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #333', background: '#111', color: '#fff' }}
                        />
                      </Field>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr 1fr', gap: '12px' }}>
                      <Field label="IMAP Host">
                        <input
                          type="text"
                          value={config.imap_host || 'imap.gmail.com'}
                          onChange={e => setConfig({ ...config, imap_host: e.target.value })}
                          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #333', background: '#111', color: '#fff', fontSize: '13px' }}
                        />
                      </Field>
                      <Field label="IMAP Port">
                        <input
                          type="number"
                          value={config.imap_port || 993}
                          onChange={e => setConfig({ ...config, imap_port: +e.target.value })}
                          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #333', background: '#111', color: '#fff', fontSize: '13px' }}
                        />
                      </Field>
                      <Field label="SMTP Host">
                        <input
                          type="text"
                          value={config.smtp_host || 'smtp.gmail.com'}
                          onChange={e => setConfig({ ...config, smtp_host: e.target.value })}
                          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #333', background: '#111', color: '#fff', fontSize: '13px' }}
                        />
                      </Field>
                      <Field label="SMTP Port">
                        <input
                          type="number"
                          value={config.smtp_port || 587}
                          onChange={e => setConfig({ ...config, smtp_port: +e.target.value })}
                          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #333', background: '#111', color: '#fff', fontSize: '13px' }}
                        />
                      </Field>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ background: '#212226', padding: '16px', borderRadius: '8px', border: '1px solid #333', fontSize: '13px' }}>
                      <div style={{ fontWeight: 600, color: '#fff', marginBottom: '8px' }}>Google Cloud Console OAuth Token</div>
                      <p style={{ color: '#B5BAC1', margin: 0 }}>
                        Generate an access token with scope <code>https://mail.google.com/</code> via the <a href="https://developers.google.com/oauthplayground/" target="_blank" rel="noreferrer" style={{ color: '#5865F2' }}>OAuth Playground <ExternalLink size={12} /></a>.
                      </p>
                    </div>
                    <Field label="Google OAuth Access Token">
                      <input
                        type="password"
                        placeholder="ya29.a0Ael..."
                        value={config.access_token || ''}
                        onChange={e => setConfig({ ...config, access_token: e.target.value })}
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #333', background: '#111', color: '#fff' }}
                      />
                    </Field>
                  </>
                )}
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* TELEGRAM CONFIGURATION                                         */}
            {/* ------------------------------------------------------------- */}
            {selected.key === 'telegram' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ background: '#212226', padding: '16px', borderRadius: '8px', border: '1px solid #333', fontSize: '13px', lineHeight: 1.6 }}>
                  <div style={{ fontWeight: 600, color: '#fff', marginBottom: '6px' }}>1-Minute Telegram Bot Setup:</div>
                  <ol style={{ paddingLeft: '20px', margin: 0, color: '#B5BAC1' }}>
                    <li>Open Telegram and search for <strong>@BotFather</strong>.</li>
                    <li>Send the message <code>/newbot</code> and choose a name and username.</li>
                    <li>Copy the provided HTTP API token and paste it below.</li>
                  </ol>
                </div>

                <Field label="Telegram Bot Token">
                  <input
                    type="password"
                    placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz..."
                    value={config.bot_token || config.api_key || ''}
                    onChange={e => setConfig({ ...config, bot_token: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #333', background: '#111', color: '#fff' }}
                  />
                </Field>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* DISCORD CONFIGURATION                                          */}
            {/* ------------------------------------------------------------- */}
            {selected.key === 'discord' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <Field label="Discord Webhook URL (Easiest)">
                  <input
                    type="text"
                    placeholder="https://discord.com/api/webhooks/..."
                    value={config.webhook_url || ''}
                    onChange={e => setConfig({ ...config, webhook_url: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #333', background: '#111', color: '#fff' }}
                  />
                </Field>
                <div style={{ textAlign: 'center', color: '#888', fontSize: '12px' }}>— OR —</div>
                <Field label="Discord Bot Token">
                  <input
                    type="password"
                    placeholder="Bot token from Discord Developer Portal..."
                    value={config.bot_token || ''}
                    onChange={e => setConfig({ ...config, bot_token: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #333', background: '#111', color: '#fff' }}
                  />
                </Field>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* SLACK CONFIGURATION                                            */}
            {/* ------------------------------------------------------------- */}
            {selected.key === 'slack' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <Field label="Slack Bot User OAuth Token">
                  <input
                    type="password"
                    placeholder="xoxb-..."
                    value={config.bot_token || ''}
                    onChange={e => setConfig({ ...config, bot_token: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #333', background: '#111', color: '#fff' }}
                  />
                </Field>
                <Field label="Default Channel">
                  <input
                    type="text"
                    placeholder="e.g. general"
                    value={config.default_channel || 'general'}
                    onChange={e => setConfig({ ...config, default_channel: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #333', background: '#111', color: '#fff' }}
                  />
                </Field>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* GENERIC REST WEBHOOK CONFIGURATION                             */}
            {/* ------------------------------------------------------------- */}
            {selected.key === 'rest' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <Field label="Webhook Endpoint URL">
                  <input
                    type="url"
                    placeholder="https://api.example.com/webhook"
                    value={config.url || ''}
                    onChange={e => setConfig({ ...config, url: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #333', background: '#111', color: '#fff' }}
                  />
                </Field>
                <Field label="Optional Bearer Token / API Key">
                  <input
                    type="password"
                    placeholder="Secret token..."
                    value={config.api_key || ''}
                    onChange={e => setConfig({ ...config, api_key: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #333', background: '#111', color: '#fff' }}
                  />
                </Field>
              </div>
            )}

            {/* Modal Action Buttons */}
            <div className="actions right" style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                className="secondary"
                onClick={handleTestConnection}
                disabled={isTesting}
                style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}
              >
                <RefreshCw size={15} className={isTesting ? 'spin' : ''} />
                {isTesting ? 'Testing...' : 'Test Connection'}
              </button>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {saveStatus && <span style={{ color: '#57F287', fontSize: '13px', fontWeight: 600 }}>{saveStatus}</span>}
                <button
                  className="secondary"
                  onClick={() => setSelected(null)}
                  style={{ padding: '10px 18px' }}
                >
                  Cancel
                </button>
                <button
                  className="primary"
                  onClick={handleSave}
                  disabled={isSaving}
                  style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <Key size={16} />
                  {isSaving ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <span style={{ fontSize: '13px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </span>
      {children}
    </label>
  );
}
