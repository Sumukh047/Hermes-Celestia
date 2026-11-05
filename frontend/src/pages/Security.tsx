import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { 
  Shield, Lock, Key, CheckCircle2, AlertTriangle, 
  RefreshCw, Check, X, ShieldAlert, Cpu, FileCheck
} from 'lucide-react';

interface ApprovalItem {
  id: string;
  run_id: string;
  agent_id: string;
  action: string;
  details: string;
  status: string;
  created_at?: string;
}

interface SystemDiag {
  security?: {
    encryption: string;
    key_file: string;
    key_exists: boolean;
    posture: string;
  };
  uptime_seconds?: number;
}

export const Security: React.FC = () => {
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [diag, setDiag] = useState<SystemDiag | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [apprList, sysDiag] = await Promise.all([
        api<ApprovalItem[]>('/approvals').catch(() => []),
        api<SystemDiag>('/system').catch(() => null)
      ]);
      setApprovals(apprList);
      setDiag(sysDiag);
    } catch (e) {
      console.error('Failed to load security data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 8000);
    return () => clearInterval(interval);
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const handleDecision = async (approvalId: string, approved: boolean) => {
    setActionLoading(approvalId);
    try {
      await api(`/approvals/${approvalId}/decision`, {
        method: 'POST',
        body: JSON.stringify({ approved, comment: approved ? 'Approved by user' : 'Rejected by user' })
      });
      showToast(approved ? 'Action approved and dispatched!' : 'Action rejected and cancelled.');
      loadData();
    } catch (e: any) {
      showToast(`Error: ${e.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const pendingApprovals = approvals.filter(a => a.status === 'pending');

  return (
    <div style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto' }}>
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: '#2B2D31',
          border: '1px solid #57F287',
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
          <CheckCircle2 size={16} color="#57F287" />
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
            background: 'rgba(87, 242, 135, 0.15)',
            border: '1px solid rgba(87, 242, 135, 0.3)',
            color: '#57F287',
            padding: '4px 10px',
            borderRadius: '20px',
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            marginBottom: '8px'
          }}>
            <Shield size={12} /> Local-First Security & Sandbox
          </div>
          <h2 style={{ fontSize: '26px', margin: '0 0 6px 0', color: '#fff', fontWeight: 800 }}>
            Security Posture & Human Approvals
          </h2>
          <p style={{ color: '#949BA4', fontSize: '14px', margin: 0, maxWidth: '680px', lineHeight: 1.5 }}>
            Hermes Agent Studio runs 100% on your local hardware. High-risk actions (email sending, WhatsApp messages, terminal execution)
            are gated behind cryptographic encryption and real-time human approval queues.
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
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          Refresh Status
        </button>
      </div>

      {/* Security Architecture Posture Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        <div style={{ background: '#1E1F22', border: '1px solid #313338', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ background: 'rgba(87, 242, 135, 0.15)', padding: '10px', borderRadius: '8px', color: '#57F287' }}>
              <Lock size={20} />
            </div>
            <div>
              <b style={{ color: '#fff', fontSize: '15px' }}>100% Local Inference</b>
              <small style={{ color: '#57F287', display: 'block', fontWeight: 600 }}>Active (Zero Cloud Offload)</small>
            </div>
          </div>
          <p style={{ color: '#B5BAC1', fontSize: '13px', lineHeight: 1.5, margin: 0 }}>
            Inference executes completely in local VRAM via LM Studio. Your prompts, documents, and agent reasoning traces never leave this machine.
          </p>
        </div>

        <div style={{ background: '#1E1F22', border: '1px solid #313338', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ background: 'rgba(88, 101, 242, 0.15)', padding: '10px', borderRadius: '8px', color: '#5865F2' }}>
              <Key size={20} />
            </div>
            <div>
              <b style={{ color: '#fff', fontSize: '15px' }}>Fernet Secret Vault</b>
              <small style={{ color: '#5865F2', display: 'block', fontWeight: 600 }}>AES-128-CBC + HMAC-SHA256</small>
            </div>
          </div>
          <p style={{ color: '#B5BAC1', fontSize: '13px', lineHeight: 1.5, margin: 0 }}>
            Integration credentials (WhatsApp auth keys, IMAP passwords, Bot tokens) are encrypted at rest with a hardware-bound master key.
          </p>
        </div>

        <div style={{ background: '#1E1F22', border: '1px solid #313338', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ background: 'rgba(235, 69, 158, 0.15)', padding: '10px', borderRadius: '8px', color: '#EB459E' }}>
              <ShieldAlert size={20} />
            </div>
            <div>
              <b style={{ color: '#fff', fontSize: '15px' }}>WhatsApp "Only You" Sandbox</b>
              <small style={{ color: '#EB459E', display: 'block', fontWeight: 600 }}>Strict Privacy Guard Active</small>
            </div>
          </div>
          <p style={{ color: '#B5BAC1', fontSize: '13px', lineHeight: 1.5, margin: 0 }}>
            The WhatsApp integration is isolated to the personal self-chat ("You"). Incoming messages from unknown contacts are dropped automatically.
          </p>
        </div>
      </div>

      {/* Human-in-the-Loop Approvals Queue */}
      <div style={{ background: '#1E1F22', border: '1px solid #313338', borderRadius: '16px', overflow: 'hidden', marginBottom: '28px' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #2B2D31', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <b style={{ color: '#fff', fontSize: '16px' }}>Human-in-the-Loop Approval Queue</b>
            <div style={{ color: '#949BA4', fontSize: '12px' }}>Pending high-risk actions waiting for manual user sign-off</div>
          </div>
          <span style={{
            background: pendingApprovals.length > 0 ? 'rgba(237, 66, 69, 0.15)' : 'rgba(87, 242, 135, 0.15)',
            color: pendingApprovals.length > 0 ? '#ED4245' : '#57F287',
            padding: '4px 10px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: 700
          }}>
            {pendingApprovals.length} PENDING
          </span>
        </div>

        {pendingApprovals.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#949BA4' }}>
            <FileCheck size={36} color="#57F287" style={{ marginBottom: '10px', opacity: 0.8 }} />
            <div style={{ color: '#fff', fontWeight: 600, fontSize: '15px' }}>Queue is Clear</div>
            <div style={{ fontSize: '13px', marginTop: '4px' }}>
              All agents are operating safely within sandbox limits. Any high-risk tool call (e.g. sending emails) will appear here for one-click approval.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {pendingApprovals.map(item => (
              <div
                key={item.id}
                style={{
                  padding: '18px 24px',
                  borderBottom: '1px solid #2B2D31',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  flexWrap: 'wrap'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ background: '#5865F2', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                      {item.action}
                    </span>
                    <span style={{ color: '#fff', fontWeight: 600, fontSize: '14px' }}>
                      Agent: {item.agent_id}
                    </span>
                    <span style={{ color: '#949BA4', fontSize: '12px' }}>
                      (Run: {item.run_id})
                    </span>
                  </div>
                  <div style={{ color: '#B5BAC1', fontSize: '13px', fontFamily: 'monospace', background: '#111214', padding: '6px 10px', borderRadius: '6px' }}>
                    {item.details}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => handleDecision(item.id, true)}
                    disabled={actionLoading === item.id}
                    style={{
                      background: '#57F287',
                      color: '#000',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Check size={14} /> Approve Action
                  </button>
                  <button
                    onClick={() => handleDecision(item.id, false)}
                    disabled={actionLoading === item.id}
                    style={{
                      background: '#ED4245',
                      color: '#fff',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <X size={14} /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Execution Boundaries & Sandbox Policies */}
      <div style={{ background: '#1E1F22', border: '1px solid #313338', borderRadius: '16px', padding: '24px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Shield size={18} color="#5865F2" /> Execution Boundaries & Sandbox Policies
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', fontSize: '13px' }}>
          <div>
            <b style={{ color: '#fff', display: 'block', marginBottom: '4px' }}>Filesystem Scope</b>
            <p style={{ color: '#949BA4', margin: 0, lineHeight: 1.5 }}>
              File read/write tools are strictly confined to the project workspace and Obsidian vault directories. System critical folders are blocked.
            </p>
          </div>
          <div>
            <b style={{ color: '#fff', display: 'block', marginBottom: '4px' }}>Terminal Command Guard</b>
            <p style={{ color: '#949BA4', margin: 0, lineHeight: 1.5 }}>
              Commands run in sub-processes with 30-second timeouts. Destructive operations (formatting, deleting root) are rejected.
            </p>
          </div>
          <div>
            <b style={{ color: '#fff', display: 'block', marginBottom: '4px' }}>Encrypted Master Key</b>
            <p style={{ color: '#949BA4', margin: 0, lineHeight: 1.5 }}>
              Key path: <code style={{ color: '#fff', background: '#111214', padding: '2px 6px', borderRadius: '4px' }}>{diag?.security?.key_file || '~/.hermes-agent-studio/vault.key'}</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};