import { useState, useEffect } from 'react';
import AdminRecomputeJobs from './AdminRecomputeJobs.jsx';
import AdminRuleSeverities from './AdminRuleSeverities.jsx';
import AdminTrees from './AdminTrees.jsx';

export default function AdminPanel({ onClose, page = false, adminUnsaved, setAdminUnsaved }) {
  const [tab, setTab] = useState(null); // require explicit selection
  const [visible, setVisible] = useState(false);
  
  // Handle navigation back to main page
  const handleBackToMain = () => {
    window.history.back();
  };
  
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
  // Do not force an inner scroller here; let the page manage scrolling.
  const basePageStyle = { position: 'relative', minHeight: '100vh', background: '#fff', borderRadius: 0, boxShadow: 'none', zIndex: 1200, padding: 20 };
  const modalStyle = { position: 'fixed', left: 60, top: 60, right: 60, bottom: 60, background: '#fff', borderRadius: 10, boxShadow: '0 12px 28px rgba(0,0,0,0.18)', zIndex: 1200, padding: 12 };
  const containerStyle = page
    ? ({ ...basePageStyle, transform: visible ? 'translateY(0)' : 'translateY(8px)', opacity: visible ? 1 : 0, transition: 'opacity 220ms ease, transform 220ms ease' })
    : modalStyle;
  return (
    <div>
      <div style={containerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Back to Main Page button - only shown in page mode */}
          {page && (
            <button 
              onClick={handleBackToMain}
              style={{ 
                padding: '8px 14px', 
                borderRadius: 6, 
                background: '#f3f4f6', 
                color: '#374151',
                border: '1px solid #e5e7eb',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 150ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#e5e7eb';
                e.currentTarget.style.borderColor = '#d1d5db';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#f3f4f6';
                e.currentTarget.style.borderColor = '#e5e7eb';
              }}
            >
              <span style={{ fontSize: '16px' }}>←</span>
              Back
            </button>
          )}
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
        {/* Full-width horizontal separator to force consistent width across all tabs */}
        <div style={{ minWidth: 1200, width: '100%', height: 2, background: '#e5e7eb', marginTop: 12 }}></div>
        <div style={{ marginTop: 12 }}>
          {/* Full-width content to match main page layout (no maxWidth constraint) */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 12, background: '#fff', boxSizing: 'border-box', width: '100%', maxWidth: 1200 }}>
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
      </div>
    </div>
  );
}