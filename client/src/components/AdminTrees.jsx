import { useEffect, useState, useRef } from 'react';
import { Admin } from '../utils/api.js';

export default function AdminTrees({ embedded } = {}) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(25);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const tableRef = useRef(null);
  const resizingRef = useRef(null);

  // Column keys in order: title, status, requestedAt, id, owner, nodes, created, actions
  const stored = typeof window !== 'undefined' ? window.sessionStorage.getItem('adminTreesColWidths') : null;
  const initialWidths = stored ? JSON.parse(stored) : { title: '30%', status: 120, requestedAt: 160, id: 160, owner: 160, nodes: 80, created: 160, actions: 200 };
  const [colWidths, setColWidths] = useState(initialWidths);
  const [hoveredCol, setHoveredCol] = useState(null);

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

  useEffect(() => {
    // cleanup on unmount
    return () => {
      stopResizing();
    };
  }, []);

  function saveWidths(w) {
    try { window.sessionStorage.setItem('adminTreesColWidths', JSON.stringify(w)); } catch (e) { /* ignore */ }
  }

  function startResizing(e, key) {
    e.preventDefault();
    resizingRef.current = { key, startX: e.clientX, startWidth: parseFloat(colWidths[key]) };
    window.addEventListener('mousemove', resizingMouseMove);
    window.addEventListener('mouseup', resizingMouseUp);
  }

  function resizingMouseMove(e) {
    const cur = resizingRef.current;
    if (!cur) return;
    const delta = e.clientX - cur.startX;
    const newWidth = Math.max(40, cur.startWidth + delta);
    const updated = { ...colWidths, [cur.key]: newWidth };
    setColWidths(updated);
  }

  function resizingMouseUp() {
    stopResizing();
    saveWidths(colWidths);
  }

  function stopResizing() {
    resizingRef.current = null;
    window.removeEventListener('mousemove', resizingMouseMove);
    window.removeEventListener('mouseup', resizingMouseUp);
  }

  function doubleClickAutoFit(key) {
    // measure max content width for the column
    if (!tableRef.current) return;
    const table = tableRef.current;
    const cells = Array.from(table.querySelectorAll('tbody tr')).map(r => r.children);
    let max = 0;
    // find index of column
    const keys = ['title','status','requestedAt','id','owner','nodes','created','actions'];
    const idx = keys.indexOf(key);
    if (idx === -1) return;
    // measure header
    const headerCell = table.querySelectorAll('thead th')[idx];
    if (headerCell) max = Math.max(max, headerCell.scrollWidth + 24);
    for (const rowCells of cells) {
      const c = rowCells[idx];
      if (c) max = Math.max(max, c.scrollWidth + 24);
    }
    const updated = { ...colWidths, [key]: Math.max(60, Math.ceil(max)) };
    setColWidths(updated);
    saveWidths(updated);
  }

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
    <div>
      {error && (
        <div style={{ padding: 10, borderRadius: 6, background: '#fffbeb', border: '1px solid #f59e0b', color: '#92400e', marginBottom: 12 }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title or owner" style={{ padding: 8, flex: 1 }} />
        <button onClick={() => { setOffset(0); load(); }} style={{ padding: '6px 10px' }}>Search</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table ref={tableRef} style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 800 }}>
          <colgroup>
            <col style={{ width: colWidths.title }} />
            <col style={{ width: colWidths.status }} />
            <col style={{ width: colWidths.requestedAt }} />
            <col style={{ width: colWidths.id }} />
            <col style={{ width: colWidths.owner }} />
            <col style={{ width: colWidths.nodes }} />
            <col style={{ width: colWidths.created }} />
            <col style={{ width: colWidths.actions }} />
          </colgroup>
          <thead>
            <tr style={{ textAlign: 'left', background: '#f8fafc' }}>
              <th onMouseEnter={() => setHoveredCol('title')} onMouseLeave={() => setHoveredCol(null)} style={{ padding: 8, borderBottom: '1px solid #e5e7eb', verticalAlign: 'middle', position: 'relative' }}>
                Title
                <div onMouseDown={(e) => startResizing(e, 'title')} onDoubleClick={() => doubleClickAutoFit('title')} style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: 12, cursor: 'col-resize', zIndex: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ display: 'inline-block', width: 2, height: 14, background: hoveredCol === 'title' || (resizingRef.current && resizingRef.current.key === 'title') ? '#6b7280' : '#cbd5e1', borderRadius: 2, transition: 'all 120ms ease' }} />
                </div>
              </th>
              <th onMouseEnter={() => setHoveredCol('status')} onMouseLeave={() => setHoveredCol(null)} style={{ padding: 8, borderBottom: '1px solid #e5e7eb', verticalAlign: 'middle', position: 'relative' }}>
                Status
                <div onMouseDown={(e) => startResizing(e, 'status')} onDoubleClick={() => doubleClickAutoFit('status')} style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: 12, cursor: 'col-resize', zIndex: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ display: 'inline-block', width: 2, height: 14, background: hoveredCol === 'status' || (resizingRef.current && resizingRef.current.key === 'status') ? '#6b7280' : '#cbd5e1', borderRadius: 2, transition: 'all 120ms ease' }} />
                </div>
              </th>
              <th onMouseEnter={() => setHoveredCol('requestedAt')} onMouseLeave={() => setHoveredCol(null)} style={{ padding: 8, borderBottom: '1px solid #e5e7eb', verticalAlign: 'middle', position: 'relative' }}>
                Requested At
                <div onMouseDown={(e) => startResizing(e, 'requestedAt')} onDoubleClick={() => doubleClickAutoFit('requestedAt')} style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: 12, cursor: 'col-resize', zIndex: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ display: 'inline-block', width: 2, height: 14, background: hoveredCol === 'requestedAt' || (resizingRef.current && resizingRef.current.key === 'requestedAt') ? '#6b7280' : '#cbd5e1', borderRadius: 2, transition: 'all 120ms ease' }} />
                </div>
              </th>
              <th onMouseEnter={() => setHoveredCol('id')} onMouseLeave={() => setHoveredCol(null)} style={{ padding: 8, borderBottom: '1px solid #e5e7eb', verticalAlign: 'middle', position: 'relative' }}>
                Tree ID
                <div onMouseDown={(e) => startResizing(e, 'id')} onDoubleClick={() => doubleClickAutoFit('id')} style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: 12, cursor: 'col-resize', zIndex: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ display: 'inline-block', width: 2, height: 14, background: hoveredCol === 'id' || (resizingRef.current && resizingRef.current.key === 'id') ? '#6b7280' : '#cbd5e1', borderRadius: 2, transition: 'all 120ms ease' }} />
                </div>
              </th>
              <th onMouseEnter={() => setHoveredCol('owner')} onMouseLeave={() => setHoveredCol(null)} style={{ padding: 8, borderBottom: '1px solid #e5e7eb', verticalAlign: 'middle', position: 'relative' }}>
                Owner
                <div onMouseDown={(e) => startResizing(e, 'owner')} onDoubleClick={() => doubleClickAutoFit('owner')} style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: 12, cursor: 'col-resize', zIndex: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ display: 'inline-block', width: 2, height: 14, background: hoveredCol === 'owner' || (resizingRef.current && resizingRef.current.key === 'owner') ? '#6b7280' : '#cbd5e1', borderRadius: 2, transition: 'all 120ms ease' }} />
                </div>
              </th>
              <th onMouseEnter={() => setHoveredCol('nodes')} onMouseLeave={() => setHoveredCol(null)} style={{ padding: 8, borderBottom: '1px solid #e5e7eb', verticalAlign: 'middle', position: 'relative' }}>
                Nodes
                <div onMouseDown={(e) => startResizing(e, 'nodes')} onDoubleClick={() => doubleClickAutoFit('nodes')} style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: 12, cursor: 'col-resize', zIndex: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ display: 'inline-block', width: 2, height: 14, background: hoveredCol === 'nodes' || (resizingRef.current && resizingRef.current.key === 'nodes') ? '#6b7280' : '#cbd5e1', borderRadius: 2, transition: 'all 120ms ease' }} />
                </div>
              </th>
              <th onMouseEnter={() => setHoveredCol('created')} onMouseLeave={() => setHoveredCol(null)} style={{ padding: 8, borderBottom: '1px solid #e5e7eb', verticalAlign: 'middle', position: 'relative' }}>
                Created
                <div onMouseDown={(e) => startResizing(e, 'created')} onDoubleClick={() => doubleClickAutoFit('created')} style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: 12, cursor: 'col-resize', zIndex: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ display: 'inline-block', width: 2, height: 14, background: hoveredCol === 'created' || (resizingRef.current && resizingRef.current.key === 'created') ? '#6b7280' : '#cbd5e1', borderRadius: 2, transition: 'all 120ms ease' }} />
                </div>
              </th>
              <th onMouseEnter={() => setHoveredCol('actions')} onMouseLeave={() => setHoveredCol(null)} style={{ padding: 8, borderBottom: '1px solid #e5e7eb', verticalAlign: 'middle', position: 'relative' }}>
                Actions
                <div onMouseDown={(e) => startResizing(e, 'actions')} onDoubleClick={() => doubleClickAutoFit('actions')} style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: 12, cursor: 'col-resize', zIndex: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ display: 'inline-block', width: 2, height: 14, background: hoveredCol === 'actions' || (resizingRef.current && resizingRef.current.key === 'actions') ? '#6b7280' : '#cbd5e1', borderRadius: 2, transition: 'all 120ms ease' }} />
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id}>
                <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>{t.title}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle', textAlign: 'left' }}>
                  {t.pendingAdminDeletion ? (
                    <span style={{ background: '#fef3f2', color: '#991b1b', padding: '4px 8px', borderRadius: 6, fontSize: 12 }}>Deleted</span>
                  ) : t.deletedAt ? (
                    <span style={{ background: '#fffbeb', color: '#92400e', padding: '4px 8px', borderRadius: 6, fontSize: 12 }}>Archived</span>
                  ) : (
                    <span style={{ background: '#ecfdf5', color: '#065f46', padding: '4px 8px', borderRadius: 6, fontSize: 12 }}>Active</span>
                  )}
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>{t.pendingDeletionRequestedAt ? new Date(t.pendingDeletionRequestedAt).toLocaleString() : '—'}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9', fontSize: 12, color: '#6b7280', verticalAlign: 'middle', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>{String(t.id)}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>{t.ownerEmail || t.ownerId || '—'}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle', textAlign: 'left' }}>{t.nodeCount}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>{t.createdAt ? new Date(t.createdAt).toLocaleString() : ''}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' }}>
                  {/* Restore only when tree is archived or pending admin deletion */}
                  <button onClick={() => handleArchive(t.id, false)} disabled={!(t.deletedAt || t.pendingAdminDeletion)} style={{ marginRight: 6, padding: '4px 8px' }}>{(t.deletedAt || t.pendingAdminDeletion) ? 'Restore' : 'Restore'}</button>
                  {/* Admin permanent delete removes from DB */}
                  <button onClick={() => { if (!window.confirm('Permanently delete this tree from the database? This cannot be undone.')) return; Admin.deleteTree(t.id, true).then(() => load()).catch(e => console.error(e)); }} style={{ marginRight: 6, padding: '4px 8px', background: '#ef4444', color: '#fff' }}>Delete Permanently</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 12, color: '#6b7280' }}>{loading ? 'Loading…' : 'No trees found'}</td></tr>
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
