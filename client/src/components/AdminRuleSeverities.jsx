import { useEffect, useState } from 'react';
import { Admin, Trees, getTreeId } from '../utils/api.js';

// Simple inline list of rule severities with edit controls.
export default function AdminRuleSeverities({ treeId: propTreeId, onClose, embedded = false, adminUnsaved, setAdminUnsaved }) {
  const [treeId, setTreeId] = useState(propTreeId || getTreeId());
  const [severities, setSeverities] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState({});
  const [originalSeverities, setOriginalSeverities] = useState({});
  const [rules, setRules] = useState([]); // [{id, description, defaultSeverity}]
  const [hoveredRow, setHoveredRow] = useState(null);

  async function loadRules() {
    try {
      const data = await Admin.getValidationRules();
      // Keep whatever the server returned (if array) and log it for debugging when unexpected shapes appear
      if (Array.isArray(data.rules)) {
        // Use console.log so the message is visible in browsers that hide debug by default
        console.log('[AdminRuleSeverities] fetched validation rules:', data.rules);
        setRules(data.rules);
      } else {
        console.warn('Validation rules metadata missing or malformed', data);
        setRules([]);
      }
    } catch (e) {
      console.error('Failed to load validation rules metadata', e);
      setRules([]);
    }
  }
  useEffect(() => { loadRules(); }, []);

  async function load() {
    if (!treeId) return;
    setLoading(true); setError('');
    try {
      const data = await Admin.getSeverities(treeId);
      const sev = data.severities || {};
      setSeverities(sev);
      setOriginalSeverities(sev);
      // clear unsaved flag after load
      if (typeof setAdminUnsaved === 'function') setAdminUnsaved(false);
    } catch (e) { setError(e.message || String(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [treeId]);

  function handleChange(ruleId, severity) {
    const rule = rules.find(r => r.id === ruleId);
    const def = rule?.defaultSeverity || 'error';
    if (severity === def) {
      // remove override locally to reflect default immediately
      setSeverities(s => { const c = { ...s }; delete c[ruleId]; return c; });
    } else {
      setSeverities(s => ({ ...s, [ruleId]: severity }));
    }
    // mark unsaved; actual precise comparison will run in effect below
    if (typeof setAdminUnsaved === 'function') setAdminUnsaved(true);
  }

  async function handleSave() {
    setSaving(true); setError('');
    try {
      // Only send changed severities (for now send all)
      await Admin.patchSeverities(treeId, severities);
      await load();
      // after successful save/reset, clear unsaved flag
      if (typeof setAdminUnsaved === 'function') setAdminUnsaved(false);
    } catch (e) { setError(e.message || String(e)); }
    finally { setSaving(false); }
  }

  // Keep a running detection of unsaved changes (compare shallow keys/values)
  useEffect(() => {
    try {
      const a = originalSeverities || {};
      const b = severities || {};
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      let same = true;
      for (const k of keys) {
        if ((a[k] || null) !== (b[k] || null)) { same = false; break; }
      }
      if (typeof setAdminUnsaved === 'function') setAdminUnsaved(!same);
    } catch (e) { if (typeof setAdminUnsaved === 'function') setAdminUnsaved(true); }
  }, [originalSeverities, severities]);

  async function handleDelete(ruleId) {
    if (!confirm(`Remove custom severity for '${ruleId}'? This reverts to default.`)) return;
    // Optimistically remove local override so UI reflects default immediately
    const prev = severities[ruleId];
    setSeverities(s => {
      const copy = { ...s };
      delete copy[ruleId];
      return copy;
    });
    setDeleting(d => ({ ...d, [ruleId]: true }));
    try {
      await Admin.deleteSeverity(treeId, ruleId);
      // refresh to ensure canonical server state
      await load();
    } catch (e) {
      // restore previous value on failure
      setSeverities(s => ({ ...s, [ruleId]: prev }));
      setError(e.message || String(e));
    } finally {
      setDeleting(d => { const c = { ...d }; delete c[ruleId]; return c; });
    }
  }

  function ruleIdOf(r) {
    if (!r) return '';
    if (typeof r === 'string') return r;
    // Defensive: check multiple common keys that may appear in malformed metadata
    return r.id || r.ID || r.Id || r.ruleId || r.rule_id || r.rule || r.name || '';
  }
  function ruleDefaultOf(r) {
    if (!r) return 'error';
    if (typeof r === 'string') return 'error';
    return r.defaultSeverity || r.default || r.severityDefault || r.default_severity || 'error';
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button disabled={loading} onClick={load} style={{ padding: '6px 10px', borderRadius: 6 }}>Reload</button>
          <button disabled={saving} onClick={handleSave} style={{ padding: '6px 10px', borderRadius: 6, background: '#2563eb', color: '#fff' }}>Save</button>
        </div>
      </div>
      <p style={{ fontSize: 13, color: '#4b5563', marginTop: 0, marginBottom: 12 }}>Adjust per-tree severities for relationship validation rules. Values: error (block), warn (allow, show warning), off (skip rule).</p>
      {error && <div style={{ color: '#b91c1c', marginBottom: 12 }}>{error}</div>}
      {loading ? <div>Loading…</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto', minWidth: 700 }}>
            <thead>
              <tr style={{ textAlign: 'left', background: '#f8fafc' }}>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>Rule ID</th>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>Description</th>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>Severity</th>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => {
              const id = ruleIdOf(r);
              const def = ruleDefaultOf(r);
              const val = (id && severities[id]) ? severities[id] : def || 'error';
              const displayId = id || '(unknown rule id)';
              return (
                <tr
                  key={displayId + JSON.stringify(r)}
                  onMouseEnter={() => setHoveredRow(displayId)}
                  onMouseLeave={() => setHoveredRow(null)}
                  style={{
                    borderBottom: '1px solid #f1f5f9',
                    transition: 'background-color 120ms ease, box-shadow 120ms ease',
                    background: hoveredRow === displayId ? '#f8fafc' : 'transparent',
                    boxShadow: hoveredRow === displayId ? '0 6px 18px rgba(37,99,235,0.06)' : 'none',
                  }}
                >
                  <td style={{ padding: 8, fontSize: 12, textAlign: 'left', verticalAlign: 'top' }}>
                    <div style={{ fontWeight: 600 }}>{displayId}</div>
                  </td>
                  <td style={{ padding: 8, fontSize: 12, color: '#6b7280', textAlign: 'left', verticalAlign: 'top' }}>
                    {(typeof r === 'string') ? '' : (r.description || '')}
                  </td>
                  <td style={{ padding: 8, textAlign: 'center', verticalAlign: 'top' }}>
                    <select value={val} onChange={e => handleChange(id, e.target.value)}>
                      <option value="error">error</option>
                      <option value="warn">warn</option>
                      <option value="off">off</option>
                    </select>
                  </td>
                  <td style={{ padding: 8, textAlign: 'center', verticalAlign: 'top' }}>
                    {(id && severities[id] && severities[id] !== def) && (
                      <button
                        onClick={() => handleDelete(id)}
                        title="Revert to default"
                        disabled={!!deleting[id]}
                        style={{ padding: '2px 6px', borderRadius: 4, background: '#e11d48', color: '#fff', fontSize: 12, opacity: deleting[id] ? 0.6 : 1 }}
                      >
                        {deleting[id] ? '...' : 'Revert'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}