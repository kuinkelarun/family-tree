import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useModalAccessibility } from '../utils/modalHelpers.js';
import { Admin } from '../utils/api.js';

// Admin UI: manage global validation severities only (per-tree overrides removed)
export default function AdminRuleSeverities({ onClose, embedded = false, adminUnsaved, setAdminUnsaved }) {
  const [globalSeverities, setGlobalSeverities] = useState({});
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalSaving, setGlobalSaving] = useState(false);
  const [error, setError] = useState('');
  const [originalGlobalSeverities, setOriginalGlobalSeverities] = useState({});
  const [rules, setRules] = useState([]); // [{id, description, defaultSeverity}]
  const [hoveredRow, setHoveredRow] = useState(null);
  const [modalOpenRule, setModalOpenRule] = useState(null);
  const [modalSeverity, setModalSeverity] = useState('error');
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
  // Always load global severities so the UI can indicate which rules have a global override
  useEffect(() => { loadGlobal(); }, []);

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
  function handleChange(ruleId, severity) {
    const rule = rules.find(r => r.id === ruleId);
    const def = rule?.defaultSeverity || 'error';
    if (severity === def) {
      setGlobalSeverities(s => { const c = { ...s }; delete c[ruleId]; return c; });
    } else {
      setGlobalSeverities(s => ({ ...s, [ruleId]: severity }));
    }
    if (typeof setAdminUnsaved === 'function') setAdminUnsaved(true);
  }

  async function handleSave() {
    setError('');
    setGlobalSaving(true);
    try {
      await Admin.patchGlobalSeverities(globalSeverities);
      await loadGlobal();
      if (typeof setAdminUnsaved === 'function') setAdminUnsaved(false);
    } catch (e) { setError(e.message || String(e)); }
    finally { setGlobalSaving(false); }
  }

  // Keep a running detection of unsaved changes (compare shallow keys/values)
  useEffect(() => {
    try {
      const a = originalGlobalSeverities || {};
      const b = globalSeverities || {};
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      let same = true;
      for (const k of keys) {
        if ((a[k] || null) !== (b[k] || null)) { same = false; break; }
      }
      if (typeof setAdminUnsaved === 'function') setAdminUnsaved(!same);
    } catch (e) { if (typeof setAdminUnsaved === 'function') setAdminUnsaved(true); }
  }, [originalGlobalSeverities, globalSeverities]);

  // Revert functionality removed: use Update modal to change or clear overrides.

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
    const cur = (globalSeverities[ruleId] || ruleDefaultOf(rules.find(rr => ruleIdOf(rr) === ruleId)));
    setModalSeverity(cur);
    setModalOpenRule(ruleId);
  }

  async function applyModalUpdate() {
    if (!modalOpenRule) return;
    setModalSaving(true);
    try {
      await Admin.patchGlobalSeverities({ [modalOpenRule]: modalSeverity });
      await loadGlobal();
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
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button disabled={globalLoading} onClick={loadGlobal} style={{ padding: '6px 10px', borderRadius: 6 }}>Reload</button>
          <button disabled={globalSaving} onClick={handleSave} style={{ padding: '6px 10px', borderRadius: 6, background: '#2563eb', color: '#fff' }}>{globalSaving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
      <p style={{ fontSize: 13, color: '#4b5563', marginTop: 0, marginBottom: 12 }}>
        Adjust global severities for relationship validation rules. Changes apply to all trees.
        Values: error (block), warn (allow, show warning), off (skip rule).
      </p>
  {error && <div style={{ color: '#b91c1c', marginBottom: 12 }}>{error}</div>}
  {globalLoading ? <div>Loading…</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto', minWidth: '100%' }}>
            <thead>
              <tr style={{ textAlign: 'left', background: '#f8fafc' }}>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>Rule ID</th>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>Description</th>
                <th style={{ padding: 8, borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>Severity</th>
                {/* Actions column removed — severity is editable inline */}
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => {
              const id = ruleIdOf(r);
              const def = ruleDefaultOf(r);
              const globalVal = (id && globalSeverities && globalSeverities[id]) ? globalSeverities[id] : null;
              const effective = globalVal || def || 'error';
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontWeight: 600 }}>{displayId}</div>
                      {globalVal && globalVal !== def ? (
                        <div title={`Global override: ${globalVal}`} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: '#fce7f3', color: '#9f1239', fontWeight: 700 }}>GLOBAL</div>
                      ) : null}
                    </div>
                  </td>
                  <td style={{ padding: 8, fontSize: 12, color: '#6b7280', textAlign: 'left', verticalAlign: 'top' }}>
                    {(typeof r === 'string') ? '' : (r.description || '')}
                  </td>
                  <td style={{ padding: 8, textAlign: 'center', verticalAlign: 'top' }}>
                    <select
                      aria-label={`Severity for ${displayId}`}
                      value={globalVal || def || 'error'}
                      onChange={(e) => handleChange(id, e.target.value)}
                      style={{ padding: '4px 8px', borderRadius: 6, width: 96, fontWeight: 600, background: globalVal ? (globalVal === 'error' ? '#fee2e2' : (globalVal === 'warn' ? '#fffbeb' : '#ecfccb')) : 'transparent', border: '1px solid rgba(0,0,0,0.08)' }}
                    >
                      <option value="error">error</option>
                      <option value="warn">warn</option>
                      <option value="off">off</option>
                    </select>
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
        onClose={() => setModalOpenRule(null)}
        onApply={applyModalUpdate}
        saving={modalSaving}
      />
    </div>
  );
}

// Simple glass modal for updating a rule's severity scope
function UpdateSeverityModal({ ruleId, ruleDesc, open, severity, onClose, onChangeSeverity, onApply, saving }) {
  const panelRef = useRef(null);
  useModalAccessibility(open, onClose, panelRef);
  if (!open || typeof document === 'undefined') return null;
  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: 'fixed', inset: 0, zIndex: 3500, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'rgba(15, 23, 42, 0.35)', backdropFilter: 'blur(6px) saturate(120%)', WebkitBackdropFilter: 'blur(6px) saturate(120%)' }}
      onClick={onClose}
    >
      <div ref={panelRef} onClick={(e) => e.stopPropagation()} style={{ width: 'min(640px, 92vw)', background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 12, boxShadow: '0 20px 48px rgba(0,0,0,0.45)', padding: 16, transform: 'translateY(-1px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{ruleId}</div>
            <div style={{ color: '#6b7280', fontSize: 13 }}>{ruleDesc}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: 10, borderRadius: 8, background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.04)', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>New severity</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['error','warn','off'].map(s => (
              <button key={s} onClick={() => onChangeSeverity(s)} style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: s === severity ? '2px solid rgba(37,99,235,0.9)' : '1px solid rgba(0,0,0,0.06)', background: s === severity ? (s==='error' ? '#fee2e2' : s==='warn' ? '#fffbeb' : '#ecfccb') : 'transparent', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>{s}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ color: '#6b7280', fontSize: 13 }}>
            This will apply the selected severity globally to all trees.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '10px 14px', borderRadius: 10, background: 'transparent' }}>Cancel</button>
            <button onClick={onApply} disabled={saving} style={{ padding: '10px 14px', borderRadius: 10, background: '#2563eb', color: '#fff', fontWeight: 700 }}>{saving ? 'Applying…' : 'Apply'}</button>
          </div>
        </div>
      </div>
    </div>
  );
  return createPortal(modal, document.body);
}