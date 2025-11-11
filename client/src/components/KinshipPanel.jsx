import React, { useMemo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useModalAccessibility } from '../utils/modalHelpers.js';
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
  const [locale, setLocale] = useState(() => localStorage.getItem('ft_locale') || 'en');
  useEffect(() => { localStorage.setItem('ft_locale', locale); }, [locale]);
  const [useGendered, setUseGendered] = useState(() => (localStorage.getItem('ft_useGendered') || '1') === '1');
  const [includePronouns, setIncludePronouns] = useState(() => (localStorage.getItem('ft_includePronouns') || '0') === '1');
  useEffect(() => { localStorage.setItem('ft_useGendered', useGendered ? '1' : '0'); }, [useGendered]);
  useEffect(() => { localStorage.setItem('ft_includePronouns', includePronouns ? '1' : '0'); }, [includePronouns]);

  // Re-run the query when locale changes and we already have results
  useEffect(() => {
    if (!a || !b) return;
    if (!resultAB && !resultBA) return;
    if (!canQuery || loading) return;
    // Fetch localized labels for the newly selected locale
    runQuery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  const sortedMembers = useMemo(() => {
    return [...(members || [])].sort((x, y) => displayMemberName(x).localeCompare(displayMemberName(y)));
  }, [members]);

  if (!open) return null;
  const panelRef = useRef(null);
  useModalAccessibility(open, onClose, panelRef);

  async function runQuery() {
    try {
      setError('');
      setLoading(true);
      setResultAB(null);
      setResultBA(null);
      // Limit kinship inference to members currently present on the canvas (where a position exists)
      const canvasMemberIds = (members || []).filter(m => m && m.position && typeof m.position.x === 'number' && typeof m.position.y === 'number').map(m => String(m._id));
      const [resAB, resBA] = await Promise.all([
        Trees.kinship(treeId, a, b, depth, locale, includePronouns, canvasMemberIds),
        Trees.kinship(treeId, b, a, depth, locale, includePronouns, canvasMemberIds),
      ]);
      setResultAB(resAB);
      setResultBA(resBA);
    } catch (e) {
      setError(e?.message || 'Query failed');
    } finally {
      setLoading(false);
    }
  }

  const el = (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div ref={panelRef} style={{ width: 'min(720px, 96vw)', background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 12px 32px rgba(0,0,0,0.18)', padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{ margin: 0, flex: 1 }}>Kinship Explorer</h3>
          <button onClick={onClose} style={{ padding: '6px 10px', borderRadius: 6, background: '#e2e8f0', color: '#111', border: '1px solid #cbd5e1' }}>Close</button>
        </div>
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto auto auto auto', gap: 8, marginTop: 12 }}>
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
          <select value={locale} onChange={(e) => setLocale(e.target.value)} style={{ padding: 6 }}>
            <option value="en">English</option>
            <option value="np">Nepali</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <input type="checkbox" checked={useGendered} onChange={(e) => setUseGendered(e.target.checked)} /> Gendered labels
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <input type="checkbox" checked={includePronouns} onChange={(e) => setIncludePronouns(e.target.checked)} /> Pronouns
          </label>
          <button disabled={!canQuery || !a || !b || loading} onClick={runQuery} style={{ padding: '6px 10px', borderRadius: 6, background: (!canQuery || !a || !b) ? '#94a3b8' : '#1f6feb', color: '#fff', border: 'none' }}>Check</button>
        </div>
        {error && <div style={{ marginTop: 10, color: '#b91c1c' }}>{error}</div>}
        {loading && <div style={{ marginTop: 10, color: '#64748b' }}>Computing…</div>}
        {(resultAB || resultBA) && (
          <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
            {resultAB && (
              <div style={{ padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                <div style={{ marginBottom: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span>
                    <strong>{displayMemberName(members.find(m => String(m._id) === String(a)) || {}) || 'A'}</strong> is{' '}
                    <strong>{(() => {
                      const chosen = useGendered ? (resultAB.genderedLabel || resultAB.localizedLabel || resultAB.label)
                                                 : (resultAB.neutralLabel || resultAB.localizedLabel || resultAB.label);
                      return locale === 'en' ? chosen : (resultAB.localizedLabel || chosen);
                    })()}</strong>{' '}of{' '}
                    <strong>{displayMemberName(members.find(m => String(m._id) === String(b)) || {}) || 'B'}</strong>
                  </span>
                  {locale !== 'en' && resultAB.localizedLabel && (
                    <span style={{ fontSize: 12, color: '#475569' }}>
                      (EN: {resultAB.label})
                    </span>
                  )}
                  {includePronouns && resultAB.pronounsA && (
                    <span style={{ fontSize: 12, color: '#475569' }}>
                      Pronouns A: {resultAB.pronounsA.subject}/{resultAB.pronounsA.object}/{resultAB.pronounsA.possessive}
                    </span>
                  )}
                </div>
                <div style={{ color: '#475569', fontSize: 12 }}>Class: {resultAB.class}</div>
              </div>
            )}
            {resultBA && (
              <div style={{ padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                <div style={{ marginBottom: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span>
                    <strong>{displayMemberName(members.find(m => String(m._id) === String(b)) || {}) || 'B'}</strong> is{' '}
                    <strong>{(() => {
                      const chosen = useGendered ? (resultBA.genderedLabel || resultBA.localizedLabel || resultBA.label)
                                                 : (resultBA.neutralLabel || resultBA.localizedLabel || resultBA.label);
                      return locale === 'en' ? chosen : (resultBA.localizedLabel || chosen);
                    })()}</strong>{' '}of{' '}
                    <strong>{displayMemberName(members.find(m => String(m._id) === String(a)) || {}) || 'A'}</strong>
                  </span>
                  {locale !== 'en' && resultBA.localizedLabel && (
                    <span style={{ fontSize: 12, color: '#475569' }}>
                      (EN: {resultBA.label})
                    </span>
                  )}
                  {includePronouns && resultBA.pronounsA && (
                    <span style={{ fontSize: 12, color: '#475569' }}>
                      Pronouns A: {resultBA.pronounsA.subject}/{resultBA.pronounsA.object}/{resultBA.pronounsA.possessive}
                    </span>
                  )}
                </div>
                <div style={{ color: '#475569', fontSize: 12 }}>Class: {resultBA.class}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
  return createPortal(el, document.body);
}
