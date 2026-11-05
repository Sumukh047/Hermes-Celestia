import React, { useEffect, useState } from 'react';
import { api, authApi, UserProfile } from '../api';
import { 
  Settings as SettingsIcon, User, Cpu, HardDrive, 
  Save, RefreshCw, CheckCircle2, Globe, Sparkles, Folder, Terminal
} from 'lucide-react';

interface SystemDiag {
  os?: {
    platform: string;
    system: string;
    release: string;
    machine: string;
    python_version: string;
  };
  resources?: {
    cpu_percent: number;
    memory_total_gb: number;
    memory_used_gb: number;
    memory_percent: number;
  };
  lmstudio?: {
    connected: boolean;
    base_url: string;
    models_count: number;
  };
  database?: {
    path: string;
    size_bytes: number;
    agents_count: number;
    runs_count: number;
    integrations_count: number;
  };
  uptime_seconds?: number;
}

export default function SettingsPage() {
  const [diag, setDiag] = useState<SystemDiag | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [name, setName] = useState('');
  const [preferredTone, setPreferredTone] = useState('friendly');
  const [lmBaseUrl, setLmBaseUrl] = useState('http://127.0.0.1:1234');
  const [vaultPath, setVaultPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [diagData, userData, vaultInfo] = await Promise.all([
        api<SystemDiag>('/system'),
        authApi.getMe().catch(() => null),
        api<{ vault_path: string }>('/obsidian/vault-info').catch(() => null)
      ]);

      setDiag(diagData);
      if (userData) {
        setUser(userData);
        setName(userData.name || userData.username);
        setPreferredTone(userData.settings?.preferred_tone || 'friendly');
      }
      if (vaultInfo) {
        setVaultPath(vaultInfo.vault_path);
      }
    } catch (e) {
      console.error('Failed to load settings data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const updated = await authApi.updateSettings(name, { preferred_tone: preferredTone });
      setUser(updated);
      showToast('Profile and settings updated successfully!');
    } catch (e: any) {
      showToast(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const formatUptime = (seconds?: number) => {
    if (!seconds) return '---';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${m}m ${s}s`;
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto' }}>
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

      {/* Header */}
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
            <SettingsIcon size={12} /> Studio Preferences & Configuration
          </div>
          <h2 style={{ fontSize: '26px', margin: '0 0 6px 0', color: '#fff', fontWeight: 800 }}>
            Workspace Settings & Profiles
          </h2>
          <p style={{ color: '#949BA4', fontSize: '14px', margin: 0, maxWidth: '680px', lineHeight: 1.5 }}>
            Configure active user profile, LM Studio local engine connection, Obsidian second-brain storage, and machine diagnostics.
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          style={{
            background: '#2B2D31',
            border: '1px solid #383A40',
            color: '#fff',
            padding: '10px 16px',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px'
          }}
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh Diagnostics
        </button>
      </div>

      {/* Main Settings Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '24px' }}>
        {/* User Profile Settings Card */}
        <div style={{ background: '#1E1F22', border: '1px solid #313338', borderRadius: '16px', padding: '24px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <User size={18} color="#5865F2" /> Active User Account & Preferences
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#B5BAC1', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase' }}>
                Full Display Name
              </label>
              <input
                type="text"
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

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#B5BAC1', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase' }}>
                Username / Email
              </label>
              <input
                type="text"
                disabled
                value={user ? `${user.username} (${user.email})` : 'admin@hermes.studio'}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#161719',
                  border: '1px solid #2B2D31',
                  borderRadius: '8px',
                  color: '#949BA4',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#B5BAC1', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase' }}>
                Default Persona Tone
              </label>
              <select
                value={preferredTone}
                onChange={e => setPreferredTone(e.target.value)}
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
                <option value="friendly">Friendly (Warm, conversational buddy with emojis)</option>
                <option value="general">General (Balanced, concise, helpful)</option>
                <option value="professional">Professional (Business focused, formal)</option>
                <option value="technical">Technical (Rigorous, engineer focused)</option>
                <option value="executive">Executive (High level, strategic decisions)</option>
              </select>
            </div>

            <button
              onClick={handleSaveProfile}
              disabled={saving}
              style={{
                alignSelf: 'flex-start',
                background: 'linear-gradient(135deg, #5865F2, #4752C4)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 20px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: saving ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(88, 101, 242, 0.4)',
                marginTop: '6px'
              }}
            >
              <Save size={14} /> {saving ? 'Saving...' : 'Save Profile Preferences'}
            </button>
          </div>
        </div>

        {/* AI Engine & LM Studio Configuration Card */}
        <div style={{ background: '#1E1F22', border: '1px solid #313338', borderRadius: '16px', padding: '24px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Globe size={18} color="#57F287" /> Local AI Engine & LM Studio
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#B5BAC1', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase' }}>
                LM Studio Base Endpoint
              </label>
              <input
                type="text"
                value={lmBaseUrl}
                onChange={e => setLmBaseUrl(e.target.value)}
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

            <div style={{
              background: '#111214',
              borderRadius: '8px',
              padding: '14px',
              border: '1px solid #2B2D31',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <b style={{ color: '#fff', fontSize: '14px' }}>LM Studio Gateway Status</b>
                <div style={{ color: '#949BA4', fontSize: '12px' }}>
                  {diag?.lmstudio?.connected ? 'Connected to local server port 1234' : 'Connecting to local instance...'}
                </div>
              </div>
              <span style={{
                background: diag?.lmstudio?.connected ? 'rgba(87, 242, 135, 0.15)' : 'rgba(237, 66, 69, 0.15)',
                color: diag?.lmstudio?.connected ? '#57F287' : '#ED4245',
                padding: '4px 10px',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: 700
              }}>
                {diag?.lmstudio?.connected ? 'CONNECTED' : 'DISCONNECTED'}
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#B5BAC1', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase' }}>
                Obsidian Second-Brain Vault Location
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  readOnly
                  value={vaultPath}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    background: '#111214',
                    border: '1px solid #383A40',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '13px',
                    fontFamily: 'monospace'
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Host Resources & Hardware Diagnostics Card */}
        <div style={{ background: '#1E1F22', border: '1px solid #313338', borderRadius: '16px', padding: '24px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Cpu size={18} color="#FEE75C" /> Hardware Diagnostics & Host Resources
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                <span style={{ color: '#949BA4' }}>CPU Load</span>
                <span style={{ color: '#fff', fontWeight: 600 }}>{diag?.resources?.cpu_percent}%</span>
              </div>
              <div style={{ background: '#111', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ background: '#5865F2', width: `${diag?.resources?.cpu_percent || 0}%`, height: '100%' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                <span style={{ color: '#949BA4' }}>System RAM Usage</span>
                <span style={{ color: '#fff', fontWeight: 600 }}>
                  {diag?.resources?.memory_used_gb} GB / {diag?.resources?.memory_total_gb} GB ({diag?.resources?.memory_percent}%)
                </span>
              </div>
              <div style={{ background: '#111', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ background: '#57F287', width: `${diag?.resources?.memory_percent || 0}%`, height: '100%' }} />
              </div>
            </div>

            <div style={{ borderTop: '1px solid #2B2D31', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#949BA4' }}>Operating System</span>
                <span style={{ color: '#fff' }}>{diag?.os?.system} {diag?.os?.release} ({diag?.os?.machine})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#949BA4' }}>Python Runtime</span>
                <span style={{ color: '#fff' }}>{diag?.os?.python_version}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#949BA4' }}>Server Uptime</span>
                <span style={{ color: '#57F287', fontWeight: 600 }}>{formatUptime(diag?.uptime_seconds)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Local Storage & SQLite Database Metrics */}
        <div style={{ background: '#1E1F22', border: '1px solid #313338', borderRadius: '16px', padding: '24px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <HardDrive size={18} color="#EB459E" /> Storage & Database Metrics
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px' }}>
            <div style={{ background: '#111', padding: '12px', borderRadius: '8px', border: '1px solid #2B2D31' }}>
              <div style={{ color: '#949BA4', marginBottom: '4px', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700 }}>Local SQLite Path</div>
              <div className="mono" style={{ color: '#5865F2', wordBreak: 'break-all' }}>{diag?.database?.path}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', textAlign: 'center' }}>
              <div style={{ background: '#2B2D31', padding: '12px', borderRadius: '8px' }}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#fff' }}>{diag?.database?.agents_count || 0}</div>
                <small style={{ color: '#949BA4' }}>Agents</small>
              </div>
              <div style={{ background: '#2B2D31', padding: '12px', borderRadius: '8px' }}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#fff' }}>{diag?.database?.runs_count || 0}</div>
                <small style={{ color: '#949BA4' }}>Runs Logged</small>
              </div>
              <div style={{ background: '#2B2D31', padding: '12px', borderRadius: '8px' }}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#fff' }}>{diag?.database?.integrations_count || 0}</div>
                <small style={{ color: '#949BA4' }}>Integrations</small>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #2B2D31', paddingTop: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Terminal size={16} color="#FEE75C" />
              <span style={{ color: '#fff' }}>Local Studio OS is 100% private and offline-capable.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}