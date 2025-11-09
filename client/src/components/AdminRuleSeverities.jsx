import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Admin, Trees, getTreeId } from '../utils/api.js';

// Simple inline list of rule severities with edit controls.
export default function AdminRuleSeverities({ treeId: propTreeId, onClose, embedded = false, adminUnsaved, setAdminUnsaved }) {
  const [treeId, setTreeId] = useState(propTreeId || getTreeId());
  const [severities, setSeverities] = useState({});
  const [globalMode, setGlobalMode] = useState(false);
  const [globalSeverities, setGlobalSeverities] = useState({});
  const [globalLoading, setGlobalLoading] = useState(false);
  const [trees, setTrees] = useState([]);
  const [treesLoading, setTreesLoading] = useState(false);
  const [selectedTreeId, setSelectedTreeId] = useState(propTreeId || getTreeId());
  const [globalSaving, setGlobalSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState({});
  const [originalSeverities, setOriginalSeverities] = useState({});
  const [originalGlobalSeverities, setOriginalGlobalSeverities] = useState({});
  const [rules, setRules] = useState([]); // [{id, description, defaultSeverity}]
  const [hoveredRow, setHoveredRow] = useState(null);
  const [modalOpenRule, setModalOpenRule] = useState(null);
  const [modalSeverity, setModalSeverity] = useState('error');
  const [modalScope, setModalScope] = useState('global'); // 'global' or 'tree'
  const [modalTargetTree, setModalTargetTree] = useState('');
  const [modalSaving, setModalSaving] = useState(false);

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
  // keep selectedTreeId in sync with treeId prop or selection
  useEffect(() => {
    if (propTreeId) {
      setSelectedTreeId(propTreeId);
    }
  }, [propTreeId]);

  // Load trees list when component mounts so admin can choose a tree
  useEffect(() => { loadTrees(); }, []);

  async function loadGlobal() {
    setGlobalLoading(true); setError('');
    try {
      const data = await Admin.getGlobalSeverities();
      const sev = data.severities || {};
      setGlobalSeverities(sev);
      setOriginalGlobalSeverities(sev);
      if (typeof setAdminUnsaved === 'function') setAdminUnsaved(false);
    } catch (e) { setError(e.message || String(e)); }
    finally { setGlobalLoading(false); }
  }

  async function loadTrees() {
    setTreesLoading(true); setError('');
    try {
      // Request a large limit to get most trees; admin will get full list
      const data = await Admin.listTrees({ limit: 200 });
      const items = data.items || [];
      setTrees(items);
      // if no explicit selection, pick propTreeId or first
      if (!selectedTreeId) setSelectedTreeId(propTreeId || getTreeId() || (items[0] && items[0].id) || '');
    } catch (e) { setError(e.message || String(e)); }
    finally { setTreesLoading(false); }
  }

  function handleChange(ruleId, severity) {
    const rule = rules.find(r => r.id === ruleId);
    const def = rule?.defaultSeverity || 'error';
    if (globalMode) {
      if (severity === def) {
        setGlobalSeverities(s => { const c = { ...s }; delete c[ruleId]; return c; });
      } else {
        setGlobalSeverities(s => ({ ...s, [ruleId]: severity }));
      }
      if (typeof setAdminUnsaved === 'function') setAdminUnsaved(true);
    } else {
      if (severity === def) {
        // remove override locally to reflect default immediately
        setSeverities(s => { const c = { ...s }; delete c[ruleId]; return c; });
      } else {
        setSeverities(s => ({ ...s, [ruleId]: severity }));
      }
      // mark unsaved; actual precise comparison will run in effect below
      if (typeof setAdminUnsaved === 'function') setAdminUnsaved(true);
    }
  }

  async function handleSave() {
    setError('');
    if (globalMode) {
      setGlobalSaving(true);
      try {
        await Admin.patchGlobalSeverities(globalSeverities);
        await loadGlobal();
        if (typeof setAdminUnsaved === 'function') setAdminUnsaved(false);
      } catch (e) { setError(e.message || String(e)); }
      finally { setGlobalSaving(false); }
    } else {
      setSaving(true);
      try {
        // Only send changed severities (for now send all)
        await Admin.patchSeverities(treeId, severities);
        await load();
        // after successful save/reset, clear unsaved flag
        if (typeof setAdminUnsaved === 'function') setAdminUnsaved(false);
      } catch (e) { setError(e.message || String(e)); }
      finally { setSaving(false); }
    }
  }

  // Keep a running detection of unsaved changes (compare shallow keys/values)
  useEffect(() => {
    try {
      if (globalMode) {
        const a = originalGlobalSeverities || {};
        const b = globalSeverities || {};
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        let same = true;
        for (const k of keys) {
          if ((a[k] || null) !== (b[k] || null)) { same = false; break; }
        }
        if (typeof setAdminUnsaved === 'function') setAdminUnsaved(!same);
      } else {
        const a = originalSeverities || {};
        const b = severities || {};
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        let same = true;
        for (const k of keys) {
          if ((a[k] || null) !== (b[k] || null)) { same = false; break; }
        }
        if (typeof setAdminUnsaved === 'function') setAdminUnsaved(!same);
      }
    } catch (e) { if (typeof setAdminUnsaved === 'function') setAdminUnsaved(true); }
  }, [originalSeverities, severities, originalGlobalSeverities, globalSeverities, globalMode]);

  async function handleDelete(ruleId) {
    if (!confirm(`Remove custom severity for '${ruleId}'? This reverts to default.`)) return;
    if (globalMode) {
      // remove global override via delete endpoint
      const prev = globalSeverities[ruleId];
      setGlobalSeverities(s => { const c = { ...s }; delete c[ruleId]; return c; });
      setDeleting(d => ({ ...d, [ruleId]: true }));
      try {
        await Admin.deleteGlobalSeverity(ruleId);
        await loadGlobal();
      } catch (e) {
        setGlobalSeverities(s => ({ ...s, [ruleId]: prev }));
        setError(e.message || String(e));
      } finally {
        setDeleting(d => { const c = { ...d }; delete c[ruleId]; return c; });
      }
    } else {
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

  function openUpdateModal(ruleId) {
    const cur = globalMode ? (globalSeverities[ruleId] || ruleDefaultOf(rules.find(rr => ruleIdOf(rr) === ruleId))) : (severities[ruleId] || ruleDefaultOf(rules.find(rr => ruleIdOf(rr) === ruleId)));
    setModalSeverity(cur);
    // Do not pre-select scope; let user choose explicit scope
    setModalScope('');
    // Do not preselect target tree; user should explicitly choose when selecting 'Specific Tree'
    setModalTargetTree('');
    setModalOpenRule(ruleId);
  }

  async function applyModalUpdate() {
    if (!modalOpenRule) return;
    setModalSaving(true);
    try {
      if (modalScope === 'global') {
        await Admin.patchGlobalSeverities({ [modalOpenRule]: modalSeverity });
        await loadGlobal();
      } else {
        const target = modalTargetTree || selectedTreeId || treeId;
        if (!target) throw new Error('No tree selected');
        await Admin.patchSeverities(target, { [modalOpenRule]: modalSeverity });
        // if we're editing the currently displayed tree, reload it
        if (target === treeId) await load();
        // refresh trees list/state in case needed
        await loadTrees();
      }
      setModalOpenRule(null);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setModalSaving(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={globalMode} onChange={async (e) => {
              // If toggling on and unsaved per-tree edits exist, confirm
              if (!globalMode && (typeof setAdminUnsaved === 'function' ? adminUnsaved : false)) {
                if (!confirm('You have unsaved per-tree changes. Toggle to global mode and lose unsaved local edits?')) return;
              }
              const next = e.target.checked;
              setGlobalMode(next);
              if (next) await loadGlobal();
            }} />
            <span style={{ fontSize: 13 }}>Apply globally</span>
          </label>
          <div style={{ marginLeft: 6 }}>
            {globalMode ? (
              <span style={{ background: '#fce7f3', color: '#9f1239', padding: '4px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>GLOBAL</span>
            ) : (
              <span style={{ background: '#eef2ff', color: '#3730a3', padding: '4px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>{selectedTreeId ? (trees.find(t=>t.id===selectedTreeId)?.title || 'Tree') : 'No tree selected'}</span>
            )}
          </div>
          {!globalMode && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <select value={selectedTreeId} onChange={async (e) => {
                const nextId = e.target.value;
                // if there are unsaved changes, confirm before switching
                if (typeof setAdminUnsaved === 'function' ? adminUnsaved : false) {
                  if (!confirm('You have unsaved changes. Switch tree and lose unsaved edits?')) return;
                }
                setSelectedTreeId(nextId);
                // update the main treeId state and load severities for the chosen tree
                setTreeId(nextId);
              }} disabled={treesLoading} style={{ padding: '6px', borderRadius: 6 }}>
                {treesLoading ? <option>Loading…</option> : (
                  <> 
                    <option value="">Select tree…</option>
                    {trees.map(t => <option key={t.id} value={t.id}>{t.title || t.id}</option>)}
                  </>
                )}
              </select>
            </div>
          )}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button disabled={loading || (globalMode && globalLoading)} onClick={globalMode ? loadGlobal : load} style={{ padding: '6px 10px', borderRadius: 6 }}>Reload</button>
          <button disabled={saving || (globalMode && globalSaving)} onClick={handleSave} style={{ padding: '6px 10px', borderRadius: 6, background: '#2563eb', color: '#fff' }}>{globalMode ? (globalSaving ? 'Saving…' : 'Save Global') : (saving ? 'Saving…' : 'Save')}</button>
        </div>
      </div>
      <p style={{ fontSize: 13, color: '#4b5563', marginTop: 0, marginBottom: 12 }}>
        {globalMode ? 'Adjust global severities for relationship validation rules. These values apply to all existing trees and new trees.' : `Adjust severities for the selected tree${selectedTreeId ? ` (${(trees.find(t=>t.id===selectedTreeId)?.title) || selectedTreeId})` : ''}.`}
        {' '}Values: error (block), warn (allow, show warning), off (skip rule).
      </p>
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
                    {modalOpenRule === id ? (
                      <div style={{ padding: '6px 10px', borderRadius: 6, background: '#f3f4f6', display: 'inline-block', minWidth: 80, textAlign: 'center', fontWeight: 600 }}>{ globalMode ? (globalSeverities[id] || def) : val }</div>
                    ) : (
                      <select value={ globalMode ? (globalSeverities[id] || def) : val } onChange={e => handleChange(id, e.target.value)}>
                        <option value="error">error</option>
                        <option value="warn">warn</option>
                        <option value="off">off</option>
                      </select>
                    )}
                  </td>
                  <td style={{ padding: 8, textAlign: 'center', verticalAlign: 'top', display: 'flex', gap: 8, justifyContent: 'center' }}>
                    <button onClick={() => openUpdateModal(id)} style={{ padding: '4px 8px', borderRadius: 6, background: '#059669', color: '#fff', fontSize: 12 }}>Update</button>
                    {globalMode ? (
                      (id && globalSeverities[id] && globalSeverities[id] !== def) ? (
                        <button
                          onClick={() => handleDelete(id)}
                          title="Revert global override"
                          disabled={!!deleting[id]}
                          style={{ padding: '2px 6px', borderRadius: 4, background: '#e11d48', color: '#fff', fontSize: 12, opacity: deleting[id] ? 0.6 : 1 }}
                        >
                          {deleting[id] ? '...' : 'Revert'}
                        </button>
                      ) : null
                    ) : (
                      (id && severities[id] && severities[id] !== def) && (
                        <button
                          onClick={() => handleDelete(id)}
                          title="Revert to default"
                          disabled={!!deleting[id]}
                          style={{ padding: '2px 6px', borderRadius: 4, background: '#e11d48', color: '#fff', fontSize: 12, opacity: deleting[id] ? 0.6 : 1 }}
                        >
                          {deleting[id] ? '...' : 'Revert'}
                        </button>
                      )
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
      {/* Update modal */}
      <UpdateSeverityModal
        open={!!modalOpenRule}
        ruleId={modalOpenRule}
        ruleDesc={rules.find(r => ruleIdOf(r) === modalOpenRule)?.description || ''}
        severity={modalSeverity}
        onChangeSeverity={(v) => setModalSeverity(v)}
        scope={modalScope}
        onChangeScope={(s) => setModalScope(s)}
        trees={trees}
        targetTree={modalTargetTree}
        onChangeTargetTree={(t) => setModalTargetTree(t)}
        onClose={() => setModalOpenRule(null)}
        onApply={applyModalUpdate}
        saving={modalSaving}
      />
    </div>
  );
}

// Simple glass modal for updating a rule's severity scope
function UpdateSeverityModal({ ruleId, ruleDesc, open, severity, onClose, onChangeSeverity, scope, onChangeScope, trees, targetTree, onChangeTargetTree, onApply, saving }) {
  if (!open || typeof document === 'undefined') return null;
  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: 'fixed', inset: 0, zIndex: 3500, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'rgba(15, 23, 42, 0.35)', backdropFilter: 'blur(6px) saturate(120%)', WebkitBackdropFilter: 'blur(6px) saturate(120%)' }}
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(640px, 92vw)', background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 12, boxShadow: '0 20px 48px rgba(0,0,0,0.45)', padding: 16, transform: 'translateY(-1px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{ruleId}</div>
            <div style={{ color: '#6b7280', fontSize: 13 }}>{ruleDesc}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div style={{ padding: 10, borderRadius: 8, background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.04)' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>New severity</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {['error','warn','off'].map(s => (
                <button key={s} onClick={() => onChangeSeverity(s)} style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: s === severity ? '2px solid rgba(37,99,235,0.9)' : '1px solid rgba(0,0,0,0.06)', background: s === severity ? (s==='error' ? '#fee2e2' : s==='warn' ? '#fffbeb' : '#ecfccb') : 'transparent', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>{s}</button>
              ))}
            </div>
          </div>

          <div style={{ padding: 10, borderRadius: 8, background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.04)' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Scope</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <input type="radio" name="scope" value="global" checked={scope === 'global'} onChange={() => onChangeScope('global')} />
                <div>
                  <div style={{ fontWeight: 700 }}>Apply Globally</div>
                  <div style={{ color: '#6b7280', fontSize: 12 }}>Applies to all existing trees and any new trees created.</div>
                </div>
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <input type="radio" name="scope" value="tree" checked={scope === 'tree'} onChange={() => onChangeScope('tree')} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontWeight: 700 }}>Apply to Specific Tree</div>
                  <div style={{ color: '#6b7280', fontSize: 12 }}>
                    <select value={targetTree} onChange={e => onChangeTargetTree(e.target.value)} style={{ marginTop: 6, padding: 6, borderRadius: 6, fontSize: 13 }}>
                      <option value="">Select tree…</option>
                      {trees.map(t => <option key={t.id} value={t.id}>{t.title || t.id}</option>)}
                    </select>
                  </div>
                </div>
              </label>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ color: '#6b7280', fontSize: 13 }}>
            Selected scope: <span style={{ fontWeight: 700 }}>{scope === 'global' ? 'Global' : (scope === 'tree' ? (trees.find(t=>t.id===targetTree)?.title || targetTree || 'None') : 'None')}</span>
            {scope === '' && <div style={{ color: '#b91c1c', marginTop: 6 }}>Please select a scope before applying.</div>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '10px 14px', borderRadius: 10, background: 'transparent' }}>Cancel</button>
            <button onClick={onApply} disabled={saving || scope === '' || (scope === 'tree' && !targetTree)} style={{ padding: '10px 14px', borderRadius: 10, background: '#2563eb', color: '#fff', fontWeight: 700 }}>{saving ? 'Applying…' : 'Apply'}</button>
          </div>
        </div>
      </div>
    </div>
  );
  return createPortal(modal, document.body);
}