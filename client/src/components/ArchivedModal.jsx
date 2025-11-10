import { useEffect, useState, useRef } from 'react';
import { Trees } from '../utils/api.js';
import { createPortal } from 'react-dom';
import { useModalAccessibility } from '../utils/modalHelpers.js';

export default function ArchivedModal({ open, onClose, onRestored }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const res = await Trees.archived();
      // Accept either an array or an object with an `items` array (defensive for API shape differences)
      let list = [];
      if (Array.isArray(res)) list = res;
      else if (res && Array.isArray(res.items)) list = res.items;
      else {
        console.warn('[ArchivedModal] unexpected archived response shape', res);
      }
      setItems(list);
    } catch (e) { console.error('[ArchivedModal] load', e); setError('Failed to load archived trees'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (open) load(); else setItems([]);
  }, [open]);

  // Always create the ref and wire up accessibility hooks so hooks run in a stable order
  const panelRef = useRef(null);
  useModalAccessibility(open, onClose, panelRef);

  if (!open) return null;

  // guard portal creation in environments where `document` may be undefined
  if (typeof document === 'undefined') return null;

  const el = (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { e.stopPropagation(); onClose && onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 3500, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.35)', backdropFilter: 'blur(6px) saturate(120%)', WebkitBackdropFilter: 'blur(6px) saturate(120%)'
      }}
    >
      <div ref={panelRef} onClick={(e) => e.stopPropagation()} style={{ width: 'min(980px, 96vw)', maxHeight: '86vh', overflow: 'auto', background: 'rgba(255,255,255,0.58)', border: '1px solid rgba(255,255,255,0.7)', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,0.35)', backdropFilter: 'blur(14px) saturate(160%)', WebkitBackdropFilter: 'blur(14px) saturate(160%)', padding: 16 }}>
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
                      <button onClick={async () => {
                        if (!window.confirm('Delete this tree? This will send a request to admins for final removal and will be removed from your archived list.')) return;
                        try {
                          await Trees.requestAdminDelete(t._id);
                          // Remove from local list so owner no longer sees it in Archived
                          setItems((prev) => prev.filter((x) => String(x._id) !== String(t._id)));
                          onRestored && onRestored('requestedDelete');
                        } catch (e) { console.error(e); setError('Delete request failed'); }
                      }} style={{ padding: '6px 10px', background: '#ef4444', color: '#fff', border: 'none' }}>Delete</button>
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
  return createPortal(el, document.body);
}
