import { useEffect, useState } from 'react';
import { Trees } from '../utils/api.js';

export default function ArchivedModal({ open, onClose, onRestored }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const res = await Trees.archived();
      setItems(Array.isArray(res) ? res : []);
    } catch (e) { console.error('[ArchivedModal] load', e); setError('Failed to load archived trees'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (open) load(); else setItems([]);
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { e.stopPropagation(); onClose && onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 3500, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.35)', backdropFilter: 'blur(6px) saturate(120%)', WebkitBackdropFilter: 'blur(6px) saturate(120%)'
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(980px, 96vw)', maxHeight: '86vh', overflow: 'auto', background: 'rgba(255,255,255,0.58)', border: '1px solid rgba(255,255,255,0.7)', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,0.35)', backdropFilter: 'blur(14px) saturate(160%)', WebkitBackdropFilter: 'blur(14px) saturate(160%)', padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <strong style={{ fontSize: 15 }}>Archived Trees</strong>
          <button onClick={() => onClose && onClose()} aria-label="Close archived" style={{ background: 'transparent', border: 'none', fontSize: 16, cursor: 'pointer' }}>✕</button>
        </div>

        {error && <div style={{ padding: 8, background: '#fff7ed', border: '1px solid #fb923c', color: '#92400e', borderRadius: 8 }}>{error}</div>}

        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ textAlign: 'left', background: '#f8fafc' }}>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>Title</th>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>Owner</th>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>Created</th>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>Deleted</th>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t._id}>
                  <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{t.title}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{t.ownerEmail || t.owner || '—'}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{t.createdAt ? new Date(t.createdAt).toLocaleString() : ''}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{t.deletedAt ? new Date(t.deletedAt).toLocaleString() : ''}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>
                    <button onClick={async () => { try { await Trees.restore(t._id); await load(); onRestored && onRestored(); } catch (e) { console.error(e); setError('Restore failed'); } }} style={{ marginRight: 8, padding: '6px 10px' }}>Restore</button>
                    <button onClick={async () => { if (!window.confirm('Permanently delete this tree? This cannot be undone.')) return; try { await Trees.delete(t._id, true); await load(); onRestored && onRestored(); } catch (e) { console.error(e); setError('Permanent delete failed'); } }} style={{ padding: '6px 10px', background: '#ef4444', color: '#fff', border: 'none' }}>Delete</button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 12, color: '#6b7280' }}>{loading ? 'Loading…' : 'No archived trees'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
