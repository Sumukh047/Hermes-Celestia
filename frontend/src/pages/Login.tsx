import React, { useState } from 'react';
import { authApi, setAuthToken, UserProfile } from '../api';
import { Sparkles, Lock, User as UserIcon, Mail, AlertCircle, ArrowRight, ShieldCheck, Key } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (user: UserProfile) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (isSignUp) {
        if (!usernameOrEmail.trim() || !password.trim() || !email.trim()) {
          setError('Please fill in all required fields.');
          setIsLoading(false);
          return;
        }
        const res = await authApi.signup(usernameOrEmail.trim(), email.trim(), password.trim(), name.trim());
        setAuthToken(res.token);
        onLoginSuccess(res.user);
      } else {
        if (!usernameOrEmail.trim() || !password.trim()) {
          setError('Please enter your username and password.');
          setIsLoading(false);
          return;
        }
        const res = await authApi.login(usernameOrEmail.trim(), password.trim());
        setAuthToken(res.token);
        onLoginSuccess(res.user);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickFillSam = () => {
    setUsernameOrEmail('Sam');
    setPassword('SamSam');
    setError(null);
  };

  return (
    <div style={{
      minHeight: '100vh',
      width: '100vw',
      background: 'radial-gradient(ellipse at 50% 20%, #1a1b2e 0%, #0d0f15 70%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      <div style={{
        background: '#16181F',
        border: '1px solid #282C36',
        borderRadius: '20px',
        width: '100%',
        maxWidth: '440px',
        boxShadow: '0 30px 80px rgba(0, 0, 0, 0.7)',
        overflow: 'hidden',
        padding: '36px 32px'
      }}>
        {/* Logo & Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #5865F2, #EB459E)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
            boxShadow: '0 8px 24px rgba(88, 101, 242, 0.4)'
          }}>
            <Sparkles size={26} color="#fff" />
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#fff', margin: '0 0 6px 0' }}>
            Hermes Agent Studio
          </h2>
          <p style={{ color: '#8E95A3', fontSize: '14px', margin: 0, lineHeight: 1.5 }}>
            {isSignUp ? 'Create your local workspace account' : 'Sign in to access your local AI workspace & tools'}
          </p>
        </div>

        {/* Quick Admin Helper Pill */}
        {!isSignUp && (
          <div 
            onClick={handleQuickFillSam}
            style={{
              background: 'rgba(88, 101, 242, 0.1)',
              border: '1px dashed #5865F2',
              borderRadius: '10px',
              padding: '10px 14px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'background 0.15s ease'
            }}
            title="Click to fill username Sam and password SamSam"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Key size={15} color="#5865F2" />
              <span style={{ fontSize: '12px', color: '#B5BAC1' }}>
                Quick Fill Admin: <b style={{ color: '#fff' }}>Sam</b> / <b style={{ color: '#fff' }}>SamSam</b>
              </span>
            </div>
            <span style={{ fontSize: '11px', color: '#5865F2', fontWeight: 700 }}>Auto-fill</span>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div style={{
            background: 'rgba(237, 66, 69, 0.15)',
            border: '1px solid #ED4245',
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: '20px',
            color: '#ED4245',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <div>{error}</div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {isSignUp && (
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#8E95A3', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Full Name
              </label>
              <div style={{ display: 'flex', alignItems: 'center', background: '#0F1117', border: '1px solid #282C36', borderRadius: '10px', padding: '0 12px' }}>
                <UserIcon size={16} color="#656F7D" />
                <input
                  type="text"
                  placeholder="e.g. Sam"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  style={{ width: '100%', background: 'transparent', border: 'none', padding: '12px 10px', color: '#fff', fontSize: '14px', outline: 'none' }}
                />
              </div>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#8E95A3', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {isSignUp ? 'Username' : 'Username or Email'}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', background: '#0F1117', border: '1px solid #282C36', borderRadius: '10px', padding: '0 12px' }}>
              <UserIcon size={16} color="#656F7D" />
              <input
                type="text"
                placeholder={isSignUp ? "Sam" : "Enter username (e.g. Sam)"}
                value={usernameOrEmail}
                onChange={e => setUsernameOrEmail(e.target.value)}
                autoFocus
                style={{ width: '100%', background: 'transparent', border: 'none', padding: '12px 10px', color: '#fff', fontSize: '14px', outline: 'none' }}
              />
            </div>
          </div>

          {isSignUp && (
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#8E95A3', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Email Address
              </label>
              <div style={{ display: 'flex', alignItems: 'center', background: '#0F1117', border: '1px solid #282C36', borderRadius: '10px', padding: '0 12px' }}>
                <Mail size={16} color="#656F7D" />
                <input
                  type="email"
                  placeholder="sam@hermes.studio"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={{ width: '100%', background: 'transparent', border: 'none', padding: '12px 10px', color: '#fff', fontSize: '14px', outline: 'none' }}
                />
              </div>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#8E95A3', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Password
            </label>
            <div style={{ display: 'flex', alignItems: 'center', background: '#0F1117', border: '1px solid #282C36', borderRadius: '10px', padding: '0 12px' }}>
              <Lock size={16} color="#656F7D" />
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ width: '100%', background: 'transparent', border: 'none', padding: '12px 10px', color: '#fff', fontSize: '14px', outline: 'none' }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              marginTop: '10px',
              background: 'linear-gradient(135deg, #5865F2, #4752C4)',
              border: 'none',
              borderRadius: '10px',
              padding: '14px',
              color: '#fff',
              fontSize: '15px',
              fontWeight: 700,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 6px 20px rgba(88, 101, 242, 0.4)',
              opacity: isLoading ? 0.7 : 1
            }}
          >
            {isLoading ? 'Authenticating...' : (isSignUp ? 'Create Account' : 'Sign In')}
            <ArrowRight size={16} />
          </button>
        </form>

        {/* Toggle between Login and Signup */}
        <div style={{ marginTop: '24px', textAlign: 'center', borderTop: '1px solid #232731', paddingTop: '16px' }}>
          <button
            onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#5865F2',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Create one"}
          </button>
        </div>

        {/* Security badge */}
        <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#57F287', fontSize: '11px', fontWeight: 600 }}>
          <ShieldCheck size={14} /> 100% Local Authentication & SQLite Isolation
        </div>
      </div>
    </div>
  );
};
