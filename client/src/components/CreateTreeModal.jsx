import { useEffect, useState } from 'react';
import { Trees } from '../utils/api.js';

export default function CreateTreeModal({ open, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const yyyy = String(now.getFullYear());
    setName(`MyTree${mm}-${dd}-${yyyy}`);
    setContact('');
    setLocation('');
    setError('');
  }, [open]);

  if (!open) return null;

  async function handleCreate() {
    if (!name || !name.trim()) {
      setError('Name is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const tree = await Trees.create(name.trim());
      // Persist optional details in sessionStorage so UI can show them later.
      try {
        const key = `treeDetails:${tree._id}`;
        window.sessionStorage.setItem(key, JSON.stringify({ contact: contact || '', location: location || '' }));
      } catch (e) { /* ignore storage errors */ }
      onCreated && onCreated(tree);
    } catch (e) {
      console.error('[CreateTreeModal] create failed', e);
      setError(e.message || 'Create failed');
    } finally {
      setLoading(false);
    }
  }

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
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(520px, 96vw)', maxHeight: '86vh', overflow: 'auto', background: 'rgba(255,255,255,0.58)', border: '1px solid rgba(255,255,255,0.7)', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,0.35)', backdropFilter: 'blur(14px) saturate(160%)', WebkitBackdropFilter: 'blur(14px) saturate(160%)', padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <strong style={{ fontSize: 15 }}>Create New Tree</strong>
          <button onClick={() => onClose && onClose()} aria-label="Close create tree" style={{ background: 'transparent', border: 'none', fontSize: 16, cursor: 'pointer' }}>✕</button>
        </div>

        {error && <div style={{ padding: 8, background: '#fff7ed', border: '1px solid #fb923c', color: '#92400e', borderRadius: 8, marginBottom: 8 }}>{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 13 }}>Name <span style={{ color: '#6b7280', fontSize: 12 }}>(required)</span></label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ padding: 8, borderRadius: 6, border: '1px solid #e5e7eb' }} />

          <label style={{ fontSize: 13 }}>Contact Information <span style={{ color: '#6b7280', fontSize: 12 }}>(optional)</span></label>
          <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="email or phone" style={{ padding: 8, borderRadius: 6, border: '1px solid #e5e7eb' }} />

          <label style={{ fontSize: 13 }}>Location <span style={{ color: '#6b7280', fontSize: 12 }}>(optional)</span></label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, Country or region" style={{ padding: 8, borderRadius: 6, border: '1px solid #e5e7eb' }} />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
            <button onClick={() => onClose && onClose()} style={{ padding: '8px 12px', borderRadius: 6, background: '#e5e7eb', border: '1px solid #cbd5e1' }}>Cancel</button>
            <button onClick={handleCreate} disabled={loading} style={{ padding: '8px 12px', borderRadius: 6, background: '#16a34a', color: '#fff', border: 'none' }}>{loading ? 'Creating…' : 'Create Tree'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
