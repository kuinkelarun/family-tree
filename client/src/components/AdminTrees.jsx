import { useEffect, useState } from 'react';
import { Admin } from '../utils/api.js';

export default function AdminTrees({ embedded } = {}) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(25);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await Admin.listTrees({ limit, offset, search });
      if (res && res.items) {
        setItems(res.items);
        setTotal(res.total || 0);
      }
    } catch (e) {
      console.error('[AdminTrees] load error', e);
      // Show a friendly message for 403/401
      const msg = e?.message || String(e);
      if (msg.toLowerCase().includes('forbidden')) setError('Access denied: admin or owner/editor access required.');
      else if (msg.toLowerCase().includes('missing token') || msg.toLowerCase().includes('invalid token')) setError('Authentication required.');
      else setError('Failed to load trees: ' + msg);
      setItems([]);
      setTotal(0);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [limit, offset]);

  async function handleArchive(id, archive) {
    try {
      await Admin.archiveTree(id, archive);
      load();
    } catch (e) { console.error(e); }
  }

  async function handleDelete(id) {
    if (!window.confirm('Soft-delete this tree?')) return;
    try {
      await Admin.deleteTree(id, false);
      load();
    } catch (e) { console.error(e); }
  }

  return (
    <div style={{ padding: 12 }}>
      {error && (
        <div style={{ padding: 10, borderRadius: 6, background: '#fffbeb', border: '1px solid #f59e0b', color: '#92400e', marginBottom: 12 }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title or owner" style={{ padding: 8, flex: 1 }} />
        <button onClick={() => { setOffset(0); load(); }} style={{ padding: '6px 10px' }}>Search</button>
      </div>
      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', background: '#f8fafc' }}>
              <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>Title</th>
              <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>Tree ID</th>
              <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>Owner</th>
              <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>Nodes</th>
              <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>Created</th>
              <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id}>
                <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{t.title}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9', fontSize: 12, color: '#6b7280' }}>{String(t.id)}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{t.ownerEmail || t.ownerId || '—'}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{t.nodeCount}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{t.createdAt ? new Date(t.createdAt).toLocaleString() : ''}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>
                  <button onClick={() => handleArchive(t.id, !t.deletedAt)} style={{ marginRight: 6, padding: '4px 8px' }}>{t.deletedAt ? 'Unarchive' : 'Archive'}</button>
                  <button onClick={() => handleDelete(t.id)} style={{ marginRight: 6, padding: '4px 8px', background: '#ef4444', color: '#fff' }}>Delete</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 12, color: '#6b7280' }}>{loading ? 'Loading…' : 'No trees found'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div>Showing {Math.min(total, offset + 1)} - {Math.min(total, offset + limit)} of {total}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}>Prev</button>
          <button onClick={() => setOffset(offset + limit)} disabled={offset + limit >= total}>Next</button>
        </div>
      </div>
    </div>
  );
}
