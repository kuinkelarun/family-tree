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
          {type === 'custom' && (
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="custom label (optional)" style={{ padding: 8 }} />
          )}
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
