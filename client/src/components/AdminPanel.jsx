import { useState } from 'react';
import AdminRecomputeJobs from './AdminRecomputeJobs.jsx';
import AdminRuleSeverities from './AdminRuleSeverities.jsx';

export default function AdminPanel({ onClose }) {
  const [tab, setTab] = useState(null); // require explicit selection
  return (
    <div>
      <div style={{ position: 'fixed', left: 60, top: 60, right: 60, bottom: 60, background: '#fff', borderRadius: 10, boxShadow: '0 12px 28px rgba(0,0,0,0.18)', zIndex: 1200, padding: 12, overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ margin: 0 }}>Admin</h2>
          <div style={{ display: 'flex', gap: 8, marginLeft: 12 }}>
            <button onClick={() => setTab('severities')} style={{ padding: '6px 10px', borderRadius: 6, background: tab === 'severities' ? '#111827' : '#e5e7eb', color: tab === 'severities' ? '#fff' : '#111827' }}>Validation Rules</button>
            <button onClick={() => setTab('queue')} style={{ padding: '6px 10px', borderRadius: 6, background: tab === 'queue' ? '#111827' : '#e5e7eb', color: tab === 'queue' ? '#fff' : '#111827' }}>Recompute Queue</button>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <button onClick={onClose} style={{ padding: '6px 10px', borderRadius: 6, background: '#ef4444', color: '#fff' }}>Close</button>
          </div>
        </div>
        <div>
          {tab === 'severities' && (
            <AdminRuleSeverities embedded />
          )}
          {tab === 'queue' && (
            <AdminRecomputeJobs embedded />
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