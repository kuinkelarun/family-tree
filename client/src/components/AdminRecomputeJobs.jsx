import { useEffect, useState } from 'react';
import { Admin } from '../utils/api.js';

export default function AdminRecomputeJobs({ onClose, embedded = false }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState({});
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await Admin.listRecomputeJobs({ page, limit });
      setJobs(Array.isArray(data.items) ? data.items : []);
      setTotal(typeof data.total === 'number' ? data.total : 0);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { load(); }, [page, limit]);

  async function handleRetry(id) {
    setActionLoading(s => ({ ...s, [id]: true }));
    try {
      await Admin.forceRetryJob(id);
      await load();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setActionLoading(s => ({ ...s, [id]: false }));
    }
  }

  async function handleDelete(id) {
    if (!confirm('Remove this job from the queue?')) return;
    setActionLoading(s => ({ ...s, [id]: true }));
    try {
      await Admin.removeJob(id);
      await load();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setActionLoading(s => ({ ...s, [id]: false }));
    }
  }

  return (
    <div>
      {error && <div style={{ color: '#b91c1c', marginBottom: 8 }}>{error}</div>}
      {loading ? (
        <div>Loading…</div>
      ) : (
        <>
        {/* Top info row: keep Refresh at the top-right like before */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: '#6b7280' }}>Total: {total}</div>
          <div style={{ marginLeft: 'auto' }}>
            <button onClick={load} style={{ padding: '6px 8px', borderRadius: 6, marginLeft: 8 }}>Refresh</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto', minWidth: '100%' }}>
            <thead>
              <tr style={{ textAlign: 'left', background: '#f8fafc' }}>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>Job ID</th>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>Tree</th>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>Status</th>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>Attempts</th>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>Next Attempt</th>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>Last Error</th>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 12, color: '#6b7280' }}>No queued jobs</td></tr>
            )}
            {jobs.map((j) => (
              <tr key={j._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: 8, fontSize: 12 }}>{j._id}</td>
                <td style={{ padding: 8, fontSize: 12 }}>{j.treeId}</td>
                <td style={{ padding: 8, fontSize: 12 }}>{j.status}</td>
                <td style={{ padding: 8, fontSize: 12 }}>{j.attempts}</td>
                <td style={{ padding: 8, fontSize: 12 }}>{j.nextAttempt ? new Date(j.nextAttempt).toLocaleString() : '-'}</td>
                <td style={{ padding: 8, fontSize: 12, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.lastError || '-'}</td>
                <td style={{ padding: 8, fontSize: 12 }}>
                  <button disabled={!!actionLoading[j._id]} onClick={() => handleRetry(j._id)} style={{ marginRight: 8, padding: '6px 8px', borderRadius: 6 }}>Retry</button>
                  <button disabled={!!actionLoading[j._id]} onClick={() => handleDelete(j._id)} style={{ padding: '6px 8px', borderRadius: 6, background: '#ef4444', color: '#fff' }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        {/* Footer: showing range + pagination/refresh controls (matches AdminTrees layout) */}
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 13, color: '#6b7280' }}>
            {total === 0 ? 'Showing 0 of 0' : `Showing ${(page - 1) * limit + 1} - ${Math.min(total, (page - 1) * limit + jobs.length)} of ${total}`}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button onClick={load} style={{ padding: '6px 8px', borderRadius: 6, marginRight: 8 }}>Refresh</button>
            <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</button>
            <button disabled={(page - 1) * limit + jobs.length >= total} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
