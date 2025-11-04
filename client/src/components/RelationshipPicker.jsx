import React, { useEffect, useState } from 'react';

export default function RelationshipPicker({
  open,
  fromName = '...',
  toName = '...',
  onCancel,
  onConfirm,
  onDelete,
  defaultType = 'custom',
  defaultLabel = '',
}) {
  const [type, setType] = useState(defaultType);
  const [label, setLabel] = useState(defaultLabel);
  const [labelEdited, setLabelEdited] = useState(false);

  // Sync local state when the picker is opened or when defaults change.
  // Do not assume an incoming defaultLabel means the user has manually edited it —
  // allow auto-updating when the type changes unless the user interacts with the label input.
  useEffect(() => {
    setType(defaultType);
    setLabel(defaultLabel || (defaultType !== 'custom' ? defaultType : ''));
    setLabelEdited(false);
  }, [open, defaultType, defaultLabel]);

  // When the user switches the type, auto-update the label to match the type
  // unless they've manually edited the label.
  useEffect(() => {
    if (!labelEdited) {
      setLabel(type === 'custom' ? '' : type);
    }
  }, [type, labelEdited]);

  useEffect(() => {
    if (!open) return; // don't register when closed
    const onKey = (e) => { if (e.key === 'Escape') onCancel?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, open]);

  if (!open) return null;

  return (
    <div onClick={() => onCancel?.()} style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#ffffff', color: '#111827', borderRadius: 10, padding: 16, width: 340, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', border: '1px solid #e5e7eb' }} role="dialog" aria-modal="true">
        <h3 style={{ margin: '0 0 10px 0' }}>{onDelete ? 'Edit relationship' : 'Create relationship'}</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <select value={type} onChange={(e) => setType(e.target.value)} style={{ padding: 8 }}>
            <option value="parent">parent</option>
            <option value="child">child</option>
            <option value="spouse">spouse</option>
            <option value="sibling">sibling</option>
            <option value="custom">custom</option>
          </select>
          <input value={label} onChange={(e) => { setLabel(e.target.value); setLabelEdited(true); }} placeholder="optional label (leave blank to use type)" style={{ padding: 8 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 16 }}>
          {onDelete ? (
            <button onClick={onDelete} style={{ padding: '6px 10px', borderRadius: 6, background: '#ef4444', color: '#fff', border: 'none' }}>Delete</button>
          ) : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onCancel} style={{ padding: '6px 10px', borderRadius: 6, background: '#e5e7eb', color: '#111', border: '1px solid #cbd5e1' }}>Cancel</button>
            <button onClick={() => onConfirm(type, label || (type !== 'custom' ? type : undefined))} style={{ padding: '6px 10px', borderRadius: 6, background: '#1f6feb', color: '#fff', border: 'none' }}>{onDelete ? 'Update' : 'Add'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
