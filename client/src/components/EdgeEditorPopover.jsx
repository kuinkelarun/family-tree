import React, { useEffect, useRef, useState } from 'react';

// Inline, backdrop-free popover to edit a relationship edge
// Props:
// - x, y: screen coordinates to position the popover
// - type: current relationship type
// - label: current label (optional)
// - onUpdate(newType, newLabel)
// - onDelete()
// - onClose()
export default function EdgeEditorPopover({ x = 0, y = 0, type = 'custom', label = '', allowTypeChange = true, onUpdate, onDelete, onClose }) {
  const ref = useRef(null);
  const [localType, setLocalType] = useState(type);
  const [localLabel, setLocalLabel] = useState(label || '');
  // Treat incoming label as a starting value but not as "user edited" —
  // we only mark labelEdited = true when the user actively changes the input in this session.
  const [labelEdited, setLabelEdited] = useState(false);
  const initialMountRef = useRef(true);

  useEffect(() => {
    // When incoming props change, update local state but do not assume the incoming
    // label was "manually edited" by the user in this session. Allow auto-labeling
    // to overwrite the label when the type changes unless the user interacts with
    // the label input (which will set labelEdited = true).
    setLocalType(type);
    setLocalLabel(label || '');
    setLabelEdited(false);
  }, [type, label]);

  useEffect(() => {
    function onDocClick(e) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) onClose?.();
    }
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    // Use capture phase to detect clicks even if other handlers stop propagation
    document.addEventListener('mousedown', onDocClick, true);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Note: We intentionally avoid auto-updating the label in a useEffect tied to localType
  // because that runs for both user-driven changes and prop syncs on open. Instead, we
  // update the label only on user interaction in the onChange handler below.

  // Responsive clamping so the popover never renders out of the viewport
  const widthGuess = Math.min(320, Math.max(240, window.innerWidth - 16));
  const heightGuess = 240; // slightly reduced default height
  const left = Math.max(8, Math.min(window.innerWidth - (widthGuess + 8), x + 8));
  const top = Math.max(8, Math.min(window.innerHeight - (heightGuess + 8), y + 8));

  return (
    <div style={{ position: 'fixed', left, top, zIndex: 2100 }}>
      <div
        ref={ref}
        style={{
          width: 'min(320px, calc(100vw - 16px))',
          maxWidth: 'calc(100vw - 16px)',
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
          padding: 10,
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 6, color: '#111827', fontSize: 13 }}>Edit Relationship</div>
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontSize: 11, color: '#334155', display: 'block' }}>
            Type
            <select
              value={localType}
              onChange={(e) => {
                const newType = e.target.value;
                setLocalType(newType);
                // Auto-update label when the user changes the type, unless they've manually
                // edited the label input during this session. This avoids overwriting the
                // incoming saved custom label on initial open.
                if (!labelEdited) {
                  setLocalLabel(newType === 'custom' ? '' : newType);
                }
              }}
              style={{ width: '100%', marginTop: 4, padding: 6, boxSizing: 'border-box', fontSize: 12 }}
              disabled={!allowTypeChange}
            >
              <option value="parent">parent</option>
              <option value="child">child</option>
              <option value="spouse">spouse</option>
              <option value="sibling">sibling</option>
              <option value="custom">custom</option>
            </select>
            {!allowTypeChange && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>Type locked for this edge</div>}
          </label>
          <label style={{ fontSize: 11, color: '#334155', display: 'block' }}>
            Label (optional)
            <input
              value={localLabel}
              onChange={(e) => { setLocalLabel(e.target.value); setLabelEdited(true); }}
              placeholder="e.g., guardian"
              style={{
                width: '100%',
                marginTop: 4,
                padding: 6,
                boxSizing: 'border-box',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontSize: 12,
              }}
            />
          </label>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4, flexWrap: 'wrap' }}>
            <button onClick={() => onDelete?.()} style={{ padding: '5px 8px', borderRadius: 6, background: '#ef4444', color: '#fff', border: 'none', fontSize: 12 }}>Delete</button>
            <button onClick={() => onUpdate?.(localType, localLabel)} style={{ padding: '5px 8px', borderRadius: 6, background: '#16a34a', color: '#fff', border: 'none', fontSize: 12 }}>Update</button>
            <button onClick={() => onClose?.()} style={{ padding: '5px 8px', borderRadius: 6, background: '#e2e8f0', color: '#111827', border: '1px solid #cbd5e1', fontSize: 12 }}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
