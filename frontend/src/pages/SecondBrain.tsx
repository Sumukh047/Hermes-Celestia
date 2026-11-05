import React, { useEffect, useState } from 'react';
import { obsidianApi, ObsidianNote } from '../api';
import { 
  BookOpen, Plus, FileText, Search, Save, Trash2, 
  ExternalLink, Sparkles, Folder, RefreshCw, CheckCircle2, Clock
} from 'lucide-react';

export const SecondBrain: React.FC = () => {
  const [vaultInfo, setVaultInfo] = useState<{ vault_path: string; note_count: number; total_bytes: number; is_custom: boolean } | null>(null);
  const [notes, setNotes] = useState<ObsidianNote[]>([]);
  const [selectedNote, setSelectedNote] = useState<string | null>(null);
  const [noteContent, setNoteContent] = useState<string>('');
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTags, setNewTags] = useState('ai-memory, hermes');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const loadVault = async () => {
    try {
      const [info, list] = await Promise.all([
        obsidianApi.getInfo(),
        obsidianApi.listNotes()
      ]);
      setVaultInfo(info);
      setNotes(list);
      if (list.length > 0 && !selectedNote && !isCreating) {
        openNote(list[0].name);
      }
    } catch (e: any) {
      console.error('Failed to load vault info:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVault();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const openNote = async (name: string) => {
    setIsCreating(false);
    setSelectedNote(name);
    try {
      const data = await obsidianApi.getNote(name);
      setNoteContent(data.content);
    } catch (e: any) {
      showToast(`Error opening note: ${e.message}`);
    }
  };

  const handleSave = async () => {
    if (!selectedNote && !isCreating) return;
    setSaving(true);
    try {
      const title = isCreating ? newTitle : selectedNote!.replace('.md', '');
      const tags = isCreating ? newTags.split(',').map(t => t.trim()) : ['ai-memory'];
      await obsidianApi.saveNote(title, noteContent, tags);
      showToast('Note saved to Obsidian vault!');
      setIsCreating(false);
      setSelectedNote(`${title}.md`);
      loadVault();
    } catch (e: any) {
      showToast(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Are you sure you want to delete '${name}' from your Obsidian vault?`)) return;
    try {
      await obsidianApi.deleteNote(name);
      showToast('Note deleted');
      setSelectedNote(null);
      setNoteContent('');
      loadVault();
    } catch (e: any) {
      showToast(`Delete failed: ${e.message}`);
    }
  };

  const filteredNotes = notes.filter(n => 
    n.title.toLowerCase().includes(search.toLowerCase()) || 
    n.preview.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto' }}>
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: '#2B2D31',
          border: '1px solid #EB459E',
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
          <Sparkles size={16} color="#EB459E" />
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
            background: 'rgba(235, 69, 158, 0.15)',
            border: '1px solid rgba(235, 69, 158, 0.3)',
            color: '#EB459E',
            padding: '4px 10px',
            borderRadius: '20px',
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            marginBottom: '8px'
          }}>
            <BookOpen size={12} /> Obsidian & Second-Brain Memory Hub
          </div>
          <h2 style={{ fontSize: '26px', margin: '0 0 6px 0', color: '#fff', fontWeight: 800 }}>
            Persistent Knowledge & Markdown Vault
          </h2>
          <p style={{ color: '#949BA4', fontSize: '14px', margin: 0, maxWidth: '700px', lineHeight: 1.5 }}>
            Agents remember user preferences, research notes, meeting summaries, and business context across sessions
            by syncing markdown directly with your Obsidian vault.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => {
              setIsCreating(true);
              setSelectedNote(null);
              setNewTitle('');
              setNoteContent('# New Second-Brain Document\n\n');
            }}
            style={{
              background: 'linear-gradient(135deg, #EB459E, #C83383)',
              border: 'none',
              color: '#fff',
              padding: '10px 18px',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 700,
              fontSize: '14px'
            }}
          >
            <Plus size={16} /> New Note
          </button>
        </div>
      </div>

      {/* Vault Info Bar */}
      {vaultInfo && (
        <div style={{
          background: '#1E1F22',
          border: '1px solid #2B2D31',
          borderRadius: '12px',
          padding: '14px 20px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          fontSize: '13px',
          color: '#B5BAC1'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Folder size={16} color="#EB459E" />
            <span>Vault Path: <code style={{ color: '#fff', background: '#111214', padding: '2px 8px', borderRadius: '4px' }}>{vaultInfo.vault_path}</code></span>
          </div>
          <div style={{ display: 'flex', gap: '20px' }}>
            <span>Notes: <b style={{ color: '#fff' }}>{vaultInfo.note_count}</b></span>
            <span>Storage: <b style={{ color: '#fff' }}>{(vaultInfo.total_bytes / 1024).toFixed(1)} KB</b></span>
          </div>
        </div>
      )}

      {/* Main Grid: Sidebar + Editor */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px', minHeight: '600px' }}>
        {/* Notes Sidebar */}
        <div style={{
          background: '#1E1F22',
          border: '1px solid #2B2D31',
          borderRadius: '14px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ padding: '14px', borderBottom: '1px solid #2B2D31' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} color="#949BA4" style={{ position: 'absolute', left: '10px', top: '10px' }} />
              <input
                type="text"
                placeholder="Search vault notes..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px 8px 32px',
                  background: '#111214',
                  border: '1px solid #383A40',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '13px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {filteredNotes.length === 0 ? (
              <div style={{ padding: '30px 10px', textAlign: 'center', color: '#949BA4', fontSize: '13px' }}>
                No markdown notes found in vault.
              </div>
            ) : (
              filteredNotes.map(n => (
                <div
                  key={n.name}
                  onClick={() => openNote(n.name)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: selectedNote === n.name ? '#2B2D31' : 'transparent',
                    cursor: 'pointer',
                    marginBottom: '4px',
                    border: selectedNote === n.name ? '1px solid #383A40' : '1px solid transparent'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <b style={{ color: '#fff', fontSize: '14px' }}>{n.title}</b>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(n.name); }}
                      style={{ background: 'transparent', border: 'none', color: '#949BA4', cursor: 'pointer', padding: '2px' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div style={{ fontSize: '12px', color: '#949BA4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {n.preview || 'Empty note'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Note Editor Area */}
        <div style={{
          background: '#1E1F22',
          border: '1px solid #2B2D31',
          borderRadius: '14px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* Editor Header */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid #2B2D31',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#2B2D31'
          }}>
            {isCreating ? (
              <div style={{ display: 'flex', gap: '10px', flex: 1, marginRight: '16px' }}>
                <input
                  type="text"
                  placeholder="Note Title (e.g. Market Research 2026)"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: '#111214',
                    border: '1px solid #383A40',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: 700
                  }}
                />
                <input
                  type="text"
                  placeholder="Tags (comma separated)"
                  value={newTags}
                  onChange={e => setNewTags(e.target.value)}
                  style={{
                    width: '200px',
                    padding: '8px 12px',
                    background: '#111214',
                    border: '1px solid #383A40',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '13px'
                  }}
                />
              </div>
            ) : selectedNote ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={18} color="#EB459E" />
                <b style={{ color: '#fff', fontSize: '16px' }}>{selectedNote}</b>
              </div>
            ) : (
              <div style={{ color: '#949BA4' }}>Select or create a note</div>
            )}

            {(selectedNote || isCreating) && (
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  background: '#5865F2',
                  border: 'none',
                  color: '#fff',
                  padding: '8px 18px',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Save size={14} /> {saving ? 'Saving...' : 'Save to Vault'}
              </button>
            )}
          </div>

          {/* Editor Body */}
          <div style={{ flex: 1, padding: '16px' }}>
            <textarea
              value={noteContent}
              onChange={e => setNoteContent(e.target.value)}
              placeholder="Write markdown content or view agent-synced memories..."
              style={{
                width: '100%',
                height: '100%',
                minHeight: '480px',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#fff',
                fontSize: '14px',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                lineHeight: 1.6,
                resize: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};