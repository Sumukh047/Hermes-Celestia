import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Bot, 
  Plug, 
  BrainCircuit, 
  Shield, 
  Settings, 
  Sparkles, 
  Search,
  Clock,
  BookOpen,
  User,
  LogOut,
  FlaskConical
} from 'lucide-react';
import { api, authApi, setAuthToken, UserProfile } from './api';
import { AuthModal } from './components/AuthModal';
import { Login } from './pages/Login';

// Pages
import Dashboard from './pages/Dashboard';
import Agents from './pages/Agents';
import Editor from './pages/Editor';
import Integrations from './pages/Integrations';
import AIEngine from './pages/AIEngine';
import Help from './pages/Help';
import Playground from './pages/Playground';
import SettingsPage from './pages/Settings';
import { Security } from './pages/Security';
import { Scheduler } from './pages/Scheduler';
import { SecondBrain } from './pages/SecondBrain';
import { MultimodalInference } from './pages/MultimodalInference';

const NAVIGATION_ITEMS = [
  ['/', 'Dashboard', LayoutDashboard],
  ['/multimodal', 'Multimodal Inference', Sparkles],
  ['/agents', 'Agents', Bot],
  ['/scheduler', 'Automations', Clock],
  ['/obsidian', 'Second Brain', BookOpen],
  ['/integrations', 'Integrations', Plug],
  ['/ai-engine', 'AI Engine', BrainCircuit],
  ['/playground', 'Playground', FlaskConical],
  ['/security', 'Security', Shield],
  ['/settings', 'Settings', Settings]
] as const;

interface LayoutProps {
  children: React.ReactNode;
  user: UserProfile;
  onUserChange: (user: UserProfile | null) => void;
}

function Layout({ children, user, onUserChange }: LayoutProps) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [lmStudioOnline, setLmStudioOnline] = useState(false);
  const [activeModelName, setActiveModelName] = useState<string | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const navigate = useNavigate();

  const handleSignOut = () => {
    setAuthToken(null);
    onUserChange(null);
  };

  // Polling / initial fetch for LM Studio status
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await api<any>('/health');
        const isOnline = !!res.lmstudio?.connected;
        setLmStudioOnline(isOnline);
        const models = res.lmstudio?.models || [];
        if (models.length > 0) {
          setActiveModelName(models[0].id || null);
        } else {
          setActiveModelName(null);
        }
      } catch (e) {
        setLmStudioOnline(false);
        setActiveModelName(null);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 8000);
    return () => clearInterval(interval);
  }, []);

  // Global Command Palette shortcut (Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="app">
      <aside>
        <div className="brand">
          <div className="logo"><Sparkles size={18} /></div>
          <div>
            <b>Hermes Agent Studio</b>
            <small>Visual AI Agent OS</small>
          </div>
        </div>
        
        {NAVIGATION_ITEMS.map(([to, label, Icon]) => (
          <NavLink 
            key={to} 
            className={({ isActive }) => isActive ? 'nav active' : 'nav'} 
            to={to}
          >
            <Icon size={16} />
            <span>{label}</span>
          </NavLink>
        ))}
        
        <NavLink className="control" to="/help">
          <Sparkles size={16} />
          <div>
            <b>Control Bot</b>
            <small>Same local model</small>
          </div>
        </NavLink>
        
        <div className="side-status" title={activeModelName ? `Active model: ${activeModelName}` : 'LM Studio'}>
          <span>LM Studio</span>
          <strong className={lmStudioOnline ? 'ok' : ''}>
            {lmStudioOnline ? (activeModelName ? 'READY' : 'ONLINE') : 'OFFLINE'}
          </strong>
        </div>
      </aside>
      
      <main>
        <header>
          <div>
            <span className="eyebrow">Workspace</span>
            <h1>Hermes Agent Studio</h1>
          </div>
          <div className="chips" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>Local-first</span>
            <button
              onClick={() => setAuthModalOpen(true)}
              style={{
                background: 'linear-gradient(135deg, #5865F2, #EB459E)',
                border: '1px solid #383A40',
                borderRadius: '20px',
                padding: '5px 14px',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <User size={13} />
              {user.name || user.username}
            </button>
            <button
              onClick={handleSignOut}
              title="Sign Out of Hermes"
              style={{
                background: '#2B2D31',
                border: '1px solid #383A40',
                borderRadius: '20px',
                padding: '5px 12px',
                color: '#ED4245',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <LogOut size={13} />
              Sign Out
            </button>
            <span>Ctrl K</span>
          </div>
        </header>
        <div className="content">
          {children}
        </div>
      </main>

      {/* User Login & Profile Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        currentUser={user}
        onUserChange={onUserChange}
      />
      
      {commandPaletteOpen && (
        <div className="overlay" onClick={() => setCommandPaletteOpen(false)}>
          <div className="command" onClick={e => e.stopPropagation()}>
            <div className="search">
              <Search size={16} />
              <input 
                autoFocus 
                placeholder="Create agent, open AI Engine, integrations..." 
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    setCommandPaletteOpen(false);
                    navigate('/agents');
                  }
                }}
              />
            </div>
            <div className="cmd-grid">
              <button onClick={() => { setCommandPaletteOpen(false); navigate('/agents/new'); }}>Create Agent</button>
              <button onClick={() => { setCommandPaletteOpen(false); navigate('/agents'); }}>Agents</button>
              <button onClick={() => { setCommandPaletteOpen(false); navigate('/scheduler'); }}>Automations</button>
              <button onClick={() => { setCommandPaletteOpen(false); navigate('/obsidian'); }}>Second Brain</button>
              <button onClick={() => { setCommandPaletteOpen(false); navigate('/integrations'); }}>Integrations</button>
              <button onClick={() => { setCommandPaletteOpen(false); navigate('/multimodal'); }}>Multimodal Inference</button>
              <button onClick={() => { setCommandPaletteOpen(false); navigate('/ai-engine'); }}>AI Engine</button>
              <button onClick={() => { setCommandPaletteOpen(false); navigate('/help'); }}>Control Bot</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    authApi.getMe()
      .then(u => {
        if (u && u.id && u.id !== 'default_user') {
          setUser(u);
        } else {
          setUser(null);
        }
      })
      .catch(() => setUser(null))
      .finally(() => setIsInitializing(false));
  }, []);

  if (isInitializing) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0d12', color: '#888' }}>
        <Sparkles size={32} className="spin" color="#5865F2" />
      </div>
    );
  }

  // Always require authentication: only after login can user access the tools
  if (!user || user.id === 'default_user') {
    return <Login onLoginSuccess={setUser} />;
  }

  return (
    <Layout user={user} onUserChange={setUser}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/multimodal" element={<MultimodalInference />} />
        <Route path="/agents" element={<Agents />} />
        <Route path="/agents/new" element={<Editor />} />
        <Route path="/agents/:id" element={<Editor />} />
        <Route path="/scheduler" element={<Scheduler />} />
        <Route path="/obsidian" element={<SecondBrain />} />
        <Route path="/integrations" element={<Integrations />} />
        <Route path="/ai-engine" element={<AIEngine />} />
        <Route path="/help" element={<Help />} />
        <Route path="/playground" element={<Playground />} />
        <Route path="/security" element={<Security />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Dashboard />} />
      </Routes>
    </Layout>
  );
}
