import { useState, useEffect } from 'react';
import AdminRecomputeJobs from './AdminRecomputeJobs.jsx';
import AdminRuleSeverities from './AdminRuleSeverities.jsx';
import AdminTrees from './AdminTrees.jsx';

export default function AdminPanel({ onClose, page = false, adminUnsaved, setAdminUnsaved }) {
  const [tab, setTab] = useState(null); // require explicit selection
  const [visible, setVisible] = useState(false);
  // entrance animation when page mode is used
  useEffect(() => {
    if (page) {
      const t = setTimeout(() => setVisible(true), 20);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [page]);

  // If rendered as a page, default to the Trees tab for convenience
  useEffect(() => {
    if (page && !tab) setTab('trees');
  }, [page]);
  // When rendered as a route/page, use a full-bleed container instead of fixed modal
  const basePageStyle = { position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, background: '#fff', borderRadius: 0, boxShadow: 'none', zIndex: 1200, padding: 20, overflow: 'auto' };
  const modalStyle = { position: 'fixed', left: 60, top: 60, right: 60, bottom: 60, background: '#fff', borderRadius: 10, boxShadow: '0 12px 28px rgba(0,0,0,0.18)', zIndex: 1200, padding: 12, overflow: 'auto' };
  const containerStyle = page
    ? ({ ...basePageStyle, transform: visible ? 'translateY(0)' : 'translateY(8px)', opacity: visible ? 1 : 0, transition: 'opacity 220ms ease, transform 220ms ease' })
    : modalStyle;
  return (
    <div>
      <div style={containerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ margin: 0 }}>Admin</h2>
          <div style={{ display: 'flex', gap: 8, marginLeft: 12 }}>
            <button onClick={() => setTab('trees')} style={{ padding: '6px 10px', borderRadius: 6, background: tab === 'trees' ? '#111827' : '#e5e7eb', color: tab === 'trees' ? '#fff' : '#111827' }}>Trees</button>
            <button onClick={() => setTab('severities')} style={{ padding: '6px 10px', borderRadius: 6, background: tab === 'severities' ? '#111827' : '#e5e7eb', color: tab === 'severities' ? '#fff' : '#111827' }}>Validation Rules</button>
            <button onClick={() => setTab('queue')} style={{ padding: '6px 10px', borderRadius: 6, background: tab === 'queue' ? '#111827' : '#e5e7eb', color: tab === 'queue' ? '#fff' : '#111827' }}>Recompute Queue</button>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            {/* When in page mode we rely on native browser Back navigation; hide Close button */}
            {!page && (
              <button onClick={onClose} style={{ padding: '6px 10px', borderRadius: 6, background: '#ef4444', color: '#fff' }}>Close</button>
            )}
          </div>
        </div>
        <div>
          {tab === 'severities' && (
            <AdminRuleSeverities embedded adminUnsaved={adminUnsaved} setAdminUnsaved={setAdminUnsaved} />
          )}
          {tab === 'queue' && (
            <AdminRecomputeJobs embedded />
          )}
          {tab === 'trees' && (
            <AdminTrees embedded />
          )}
          {!tab && (
            <div style={{ padding: 16, color: '#6b7280' }}>
              Select a section above to manage validation rules or view the recompute queue.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}