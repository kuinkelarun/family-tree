import React, { useMemo, useState } from 'react';
import { displayMemberName } from '../utils/format.js';
import { Trees } from '../utils/api.js';

export default function KinshipPanel({ open, onClose, members = [], treeId, canQuery = true }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [depth, setDepth] = useState(10);
  const [loading, setLoading] = useState(false);
  const [resultAB, setResultAB] = useState(null);
  const [resultBA, setResultBA] = useState(null);
  const [error, setError] = useState('');

  const sortedMembers = useMemo(() => {
    return [...(members || [])].sort((x, y) => displayMemberName(x).localeCompare(displayMemberName(y)));
  }, [members]);

  if (!open) return null;

  async function runQuery() {
    try {
      setError('');
      setLoading(true);
      setResultAB(null);
      setResultBA(null);
      const [resAB, resBA] = await Promise.all([
        Trees.kinship(treeId, a, b, depth),
        Trees.kinship(treeId, b, a, depth),
      ]);
      setResultAB(resAB);
      setResultBA(resBA);
    } catch (e) {
      setError(e?.message || 'Query failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 'min(720px, 96vw)', background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 12px 32px rgba(0,0,0,0.18)', padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{ margin: 0, flex: 1 }}>Kinship Explorer</h3>
          <button onClick={onClose} style={{ padding: '6px 10px', borderRadius: 6, background: '#e2e8f0', color: '#111', border: '1px solid #cbd5e1' }}>Close</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 8, marginTop: 12 }}>
          <select value={a} onChange={(e) => setA(e.target.value)} style={{ padding: 6 }}>
            <option value="">Member A…</option>
            {sortedMembers.map(m => (
              <option key={m._id} value={m._id}>{displayMemberName(m)}</option>
            ))}
          </select>
          <select value={b} onChange={(e) => setB(e.target.value)} style={{ padding: 6 }}>
            <option value="">Member B…</option>
            {sortedMembers.map(m => (
              <option key={m._id} value={m._id}>{displayMemberName(m)}</option>
            ))}
          </select>
          <input type="number" min={1} max={20} value={depth} onChange={(e) => setDepth(parseInt(e.target.value || '10', 10))} style={{ width: 80, padding: 6 }} />
          <button disabled={!canQuery || !a || !b || loading} onClick={runQuery} style={{ padding: '6px 10px', borderRadius: 6, background: (!canQuery || !a || !b) ? '#94a3b8' : '#1f6feb', color: '#fff', border: 'none' }}>Check</button>
        </div>
        {error && <div style={{ marginTop: 10, color: '#b91c1c' }}>{error}</div>}
        {loading && <div style={{ marginTop: 10, color: '#64748b' }}>Computing…</div>}
        {(resultAB || resultBA) && (
          <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
            {resultAB && (
              <div style={{ padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                <div style={{ marginBottom: 4 }}>
                  <strong>{displayMemberName(members.find(m => String(m._id) === String(a)) || {}) || 'A'}</strong> is
                  {' '}<strong>{resultAB.label}</strong>{' '}of{' '}
                  <strong>{displayMemberName(members.find(m => String(m._id) === String(b)) || {}) || 'B'}</strong>
                </div>
                <div style={{ color: '#475569' }}>Class: {resultAB.class}</div>
              </div>
            )}
            {resultBA && (
              <div style={{ padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                <div style={{ marginBottom: 4 }}>
                  <strong>{displayMemberName(members.find(m => String(m._id) === String(b)) || {}) || 'B'}</strong> is
                  {' '}<strong>{resultBA.label}</strong>{' '}of{' '}
                  <strong>{displayMemberName(members.find(m => String(m._id) === String(a)) || {}) || 'A'}</strong>
                </div>
                <div style={{ color: '#475569' }}>Class: {resultBA.class}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
