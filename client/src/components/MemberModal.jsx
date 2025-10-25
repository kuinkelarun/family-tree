import { useEffect, useState } from 'react';

export default function MemberModal({
  open,
  member, // optional; if present => edit mode
  onSave,
  onClose,
  canSave = true,
  onDelete, // optional; only for edit mode
  onMoveToPool, // optional; only when on canvas
}) {
  const isEdit = !!(member && member._id);
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [photo, setPhoto] = useState('');
  const [notes, setNotes] = useState('');
  const [location, setLocation] = useState('');

  const isOnCanvas = !!(
    member && member.position &&
    typeof member.position.x === 'number' &&
    typeof member.position.y === 'number'
  );

  useEffect(() => {
    if (!open) return;
    if (member) {
      setName(member.name || '');
      setDob(member.dob ? new Date(member.dob).toISOString().slice(0, 10) : '');
      setPhoto(member.photo || '');
      setNotes(member.notes || '');
      setLocation(member.location || '');
    } else {
      setName('');
      setDob('');
      setPhoto('');
      setNotes('');
      setLocation('');
    }
  }, [open, member]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!onSave) return;
    const payload = {
      name: name.trim(),
      photo: photo.trim() || undefined,
      notes: notes.trim() || undefined,
      location: location.trim() || undefined,
    };
    if (dob) payload.dob = dob;
    await onSave(payload);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" style={{ width: 'min(640px, 96vw)', background: '#ffffff', borderRadius: 12, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #e5e7eb', background: '#f8fafc' }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>{isEdit ? 'Edit Member' : 'Add Member'}</h3>
          <button onClick={onClose} style={{ padding: '6px 10px', borderRadius: 6, background: '#ef4444', color: '#fff', border: 'none' }}>✕ Close</button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: 16, display: 'grid', gap: 10 }}>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} type="text" placeholder="Full name" style={{ width: '100%' }} required />
          </label>
          <label>
            Date of Birth
            <input value={dob} onChange={(e) => setDob(e.target.value)} type="date" />
          </label>
          <label>
            Location
            <input value={location} onChange={(e) => setLocation(e.target.value)} type="text" placeholder="City, Country" style={{ width: '100%' }} />
          </label>
          <label>
            Photo URL
            <input value={photo} onChange={(e) => setPhoto(e.target.value)} type="url" placeholder="https://..." style={{ width: '100%' }} />
          </label>
          <label>
            Notes
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Notes, occupation, etc." />
          </label>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            <button type="submit" disabled={!canSave || !name.trim()} style={{ padding: '8px 12px', borderRadius: 6, background: canSave ? '#16a34a' : '#94a3b8', color: '#fff', border: 'none', cursor: canSave ? 'pointer' : 'not-allowed' }}>
              {isEdit ? 'Save Changes' : 'Add Member'}
            </button>
            {isEdit && onMoveToPool && isOnCanvas && (
              <button type="button" onClick={() => onMoveToPool(member._id)} style={{ padding: '8px 12px', borderRadius: 6, background: '#f59e0b', color: '#fff', border: 'none' }}>
                Move to Pool
              </button>
            )}
            {isEdit && onDelete && (
              <button type="button" onClick={() => onDelete(member._id)} style={{ padding: '8px 12px', borderRadius: 6, background: '#dc2626', color: '#fff', border: 'none' }}>
                🗑️ Delete
              </button>
            )}
            <button type="button" onClick={onClose} style={{ padding: '8px 12px', borderRadius: 6, background: '#e2e8f0', color: '#111827', border: '1px solid #cbd5e1' }}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
