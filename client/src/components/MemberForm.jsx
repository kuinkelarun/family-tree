import { useEffect, useState } from 'react';

export default function MemberForm({ selectedMember, onSave, canSave, onClearSelection, onDelete }) {
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [photo, setPhoto] = useState('');
  const [notes, setNotes] = useState('');
  const isEdit = !!(selectedMember && selectedMember._id);

  useEffect(() => {
    if (selectedMember) {
      setName(selectedMember.name || '');
      setDob(selectedMember.dob ? new Date(selectedMember.dob).toISOString().slice(0, 10) : '');
      setPhoto(selectedMember.photo || '');
      setNotes(selectedMember.notes || '');
    } else {
      setName('');
      setDob('');
      setPhoto('');
      setNotes('');
    }
  }, [selectedMember]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!onSave) return;
    const payload = { name: name.trim(), photo: photo.trim() || undefined, notes: notes.trim() || undefined };
    if (dob) payload.dob = dob;
    await onSave(payload);
  }

  return (
    <form style={{ display: 'grid', gap: 8, maxWidth: 480 }} onSubmit={handleSubmit}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h3 style={{ margin: 0, flex: 1 }}>{isEdit ? 'Edit Member Details' : 'Add New Member'}</h3>
        {isEdit && (
          <button 
            type="button" 
            onClick={onClearSelection} 
            style={{ 
              padding: '6px 12px', 
              borderRadius: 6, 
              background: '#ef4444', 
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500
            }}
            title="Close and cancel editing"
          >
            ✕ Close
          </button>
        )}
      </div>
      {!isEdit && (
        <div style={{ padding: 8, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 12, color: '#1e40af' }}>
          💡 Members are added to the pool first. Drag them to canvas or click "+ Add" to visualize.
        </div>
      )}
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} type="text" placeholder="Full name" style={{ width: '100%' }} required />
      </label>
      <label>
        Date of Birth
        <input value={dob} onChange={(e) => setDob(e.target.value)} type="date" />
      </label>
      <label>
        Photo URL
        <input value={photo} onChange={(e) => setPhoto(e.target.value)} type="url" placeholder="https://..." style={{ width: '100%' }} />
      </label>
      <label>
        Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Notes, occupation, etc." />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={!canSave || !name.trim()} style={{ flex: 1, padding: '8px 12px', borderRadius: 6, background: canSave ? '#16a34a' : '#94a3b8', color: '#fff', border: 'none', cursor: canSave ? 'pointer' : 'not-allowed' }}>
          {isEdit ? 'Update Member' : 'Add to Pool'}
        </button>
        {isEdit && onDelete && (
          <>
            <button 
              type="button" 
              onClick={() => onDelete(selectedMember._id, false)}
              style={{ 
                padding: '8px 12px', 
                borderRadius: 6, 
                background: '#f59e0b', 
                color: '#fff', 
                border: 'none', 
                cursor: 'pointer',
                fontSize: 13
              }}
              title="Remove from canvas, keep in pool"
            >
              Move to Pool
            </button>
            <button 
              type="button" 
              onClick={() => onDelete(selectedMember._id, true)}
              style={{ 
                padding: '8px 12px', 
                borderRadius: 6, 
                background: '#dc2626', 
                color: '#fff', 
                border: 'none', 
                cursor: 'pointer',
                fontSize: 13
              }}
              title="Permanently delete member"
            >
              🗑️ Delete
            </button>
          </>
        )}
      </div>
      {!canSave && <div style={{ color: '#ef4444', fontSize: 12 }}>Login and create a tree to enable saving.</div>}
    </form>
  );
}
