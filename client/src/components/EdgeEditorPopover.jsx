import React, { useEffect, useRef, useState } from 'react';

// Inline, backdrop-free popover to edit a relationship edge
// Props:
// - x, y: screen coordinates to position the popover
// - type: current relationship type
// - label: current label (optional)
// - onUpdate(newType, newLabel)
// - onDelete()
// - onClose()
export default function EdgeEditorPopover({ x = 0, y = 0, type = 'custom', label = '', onUpdate, onDelete, onClose }) {
  const ref = useRef(null);
  const [localType, setLocalType] = useState(type);
  const [localLabel, setLocalLabel] = useState(label);

  useEffect(() => {
    setLocalType(type);
    setLocalLabel(label || '');
  }, [type, label]);

  useEffect(() => {
    function onDocClick(e) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) onClose?.();
    }
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const left = Math.max(8, Math.min(window.innerWidth - 280, x + 8));
  const top = Math.max(8, Math.min(window.innerHeight - 200, y + 8));

  return (
    <div style={{ position: 'fixed', left, top, zIndex: 2100 }}>
      <div ref={ref} style={{ width: 260, background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 8px 28px rgba(0,0,0,0.15)', padding: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8, color: '#111827' }}>Edit Relationship</div>
        <div style={{ display: 'grid', gap: 8 }}>
          <label style={{ fontSize: 12, color: '#334155' }}>
            Type
            <select value={localType} onChange={(e) => setLocalType(e.target.value)} style={{ width: '100%', marginTop: 4, padding: 6 }}>
              <option value="parent">parent</option>
              <option value="child">child</option>
              <option value="spouse">spouse</option>
              <option value="sibling">sibling</option>
              <option value="custom">custom</option>
            </select>
          </label>
          <label style={{ fontSize: 12, color: '#334155' }}>
            Label (optional)
            <input value={localLabel} onChange={(e) => setLocalLabel(e.target.value)} placeholder="e.g., guardian" style={{ width: '100%', marginTop: 4, padding: 6 }} />
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={() => onDelete?.()} style={{ padding: '6px 10px', borderRadius: 6, background: '#ef4444', color: '#fff', border: 'none' }}>Delete</button>
            <button onClick={() => onUpdate?.(localType, localLabel)} style={{ padding: '6px 10px', borderRadius: 6, background: '#16a34a', color: '#fff', border: 'none' }}>Update</button>
            <button onClick={() => onClose?.()} style={{ padding: '6px 10px', borderRadius: 6, background: '#e2e8f0', color: '#111827', border: '1px solid #cbd5e1' }}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
