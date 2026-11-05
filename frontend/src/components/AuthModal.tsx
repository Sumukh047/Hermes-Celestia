import React, { useState } from 'react';
import { authApi, setAuthToken, UserProfile } from '../api';
import { X, LogIn, UserPlus, Shield, User, Lock, Mail, Sparkles, AlertCircle } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserChange: (user: UserProfile) => void;
  currentUser?: UserProfile | null;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onUserChange,
  currentUser
}) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        if (!username || !password) {
          setError('Please provide username/email and password.');
          setLoading(false);
          return;
        }
        const res = await authApi.login(username, password);
        setAuthToken(res.token);
        onUserChange(res.user);
        onClose();
      } else {
        if (!username || !email || !password) {
          setError('Please provide username, email, and password.');
          setLoading(false);
          return;
        }
        const res = await authApi.signup(username, email, password, name);
        setAuthToken(res.token);
        onUserChange(res.user);
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
      const defaultUser: UserProfile = {
        id: 'default_user',
        username: 'admin',
        email: 'admin@hermes.studio',
        name: 'Administrator',
        settings: {}
      };
      onUserChange(defaultUser);
      onClose();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
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
        maxWidth: '440px',
        boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #2B2D31',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#2B2D31'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              background: '#5865F2',
              padding: '8px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Shield size={18} color="#fff" />
            </div>
            <div>
              <b style={{ fontSize: '16px', color: '#fff' }}>
                {currentUser && currentUser.id !== 'default_user'
                  ? 'Account & Profiles'
                  : mode === 'login' ? 'Sign In to Hermes' : 'Create Studio Account'}
              </b>
              <div style={{ fontSize: '12px', color: '#949BA4' }}>
                Multi-user isolation & persistent agent fleets
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#949BA4',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Current User Card if logged in */}
        {currentUser && currentUser.id !== 'default_user' && (
          <div style={{ padding: '24px' }}>
            <div style={{
              background: '#2B2D31',
              borderRadius: '12px',
              padding: '16px',
              border: '1px solid #383A40',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '14px'
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #5865F2, #EB459E)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '18px',
                color: '#fff'
              }}>
                {(currentUser.name || currentUser.username).slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <b style={{ color: '#fff', fontSize: '15px' }}>{currentUser.name || currentUser.username}</b>
                <div style={{ color: '#949BA4', fontSize: '13px' }}>@{currentUser.username}</div>
                <div style={{ color: '#5865F2', fontSize: '12px' }}>{currentUser.email}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleLogout}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: '#ED4245',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Log Out
              </button>
              <button
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: '#35373C',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Login / Signup Forms */}
        {(!currentUser || currentUser.id === 'default_user') && (
          <div style={{ padding: '24px' }}>
            {/* Tabs */}
            <div style={{
              display: 'flex',
              background: '#111214',
              borderRadius: '8px',
              padding: '4px',
              marginBottom: '20px'
            }}>
              <button
                type="button"
                onClick={() => { setMode('login'); setError(null); }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: mode === 'login' ? '#2B2D31' : 'transparent',
                  color: mode === 'login' ? '#fff' : '#949BA4',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <LogIn size={14} /> Sign In
              </button>
              <button
                type="button"
                onClick={() => { setMode('signup'); setError(null); }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: mode === 'signup' ? '#2B2D31' : 'transparent',
                  color: mode === 'signup' ? '#fff' : '#949BA4',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <UserPlus size={14} /> Create Account
              </button>
            </div>

            {error && (
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
                <AlertCircle size={16} /> {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {mode === 'signup' && (
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#B5BAC1', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 700 }}>
                    Full Name
                  </label>
                  <div style={{ position: 'relative' }}>
                    <User size={15} color="#949BA4" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                    <input
                      type="text"
                      placeholder="e.g. Sumukh"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px 10px 36px',
                        background: '#111214',
                        border: '1px solid #383A40',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '14px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#B5BAC1', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 700 }}>
                  {mode === 'login' ? 'Username or Email' : 'Username'}
                </label>
                <div style={{ position: 'relative' }}>
                  <User size={15} color="#949BA4" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                  <input
                    type="text"
                    required
                    placeholder="Enter username"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 36px',
                      background: '#111214',
                      border: '1px solid #383A40',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {mode === 'signup' && (
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#B5BAC1', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 700 }}>
                    Email Address
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={15} color="#949BA4" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                    <input
                      type="email"
                      required
                      placeholder="your.email@example.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px 10px 36px',
                        background: '#111214',
                        border: '1px solid #383A40',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '14px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#B5BAC1', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 700 }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={15} color="#949BA4" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 36px',
                      background: '#111214',
                      border: '1px solid #383A40',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'linear-gradient(135deg, #5865F2, #4752C4)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(88, 101, 242, 0.4)'
                }}
              >
                <Sparkles size={16} />
                {loading ? 'Authenticating...' : mode === 'login' ? 'Sign In' : 'Create Account & Continue'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};