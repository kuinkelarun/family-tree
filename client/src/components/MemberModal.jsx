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
    <div 
      onClick={onClose}
      style={{ 
        position: 'fixed', 
        inset: 0, 
        background: 'rgba(0, 0, 0, 0.6)', 
        backdropFilter: 'blur(4px)',
        zIndex: 2000, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        padding: 16,
        animation: 'fadeIn 0.2s ease-out'
      }}
    >
      <div 
        role="dialog" 
        aria-modal="true" 
        onClick={(e) => e.stopPropagation()}
        style={{ 
          width: 'min(680px, 96vw)', 
          background: '#ffffff', 
          borderRadius: 16, 
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.05)', 
          overflow: 'hidden',
          animation: 'slideUp 0.3s ease-out'
        }}
      >
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          padding: '20px 24px', 
          borderBottom: '2px solid #e5e7eb', 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ 
              width: 40, 
              height: 40, 
              borderRadius: 10, 
              background: 'rgba(255, 255, 255, 0.2)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              fontSize: 20
            }}>
              {isEdit ? '✏️' : '➕'}
            </div>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#ffffff' }}>
              {isEdit ? 'Edit Member Details' : 'Add New Member'}
            </h3>
          </div>
          <button 
            onClick={onClose} 
            title="Close dialog"
            style={{ 
              padding: '8px 12px', 
              borderRadius: 8, 
              background: 'rgba(255, 255, 255, 0.2)', 
              color: '#ffffff', 
              border: 'none',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
          >
            ✕ Close
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'grid', gap: 18, background: '#f9fafb' }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', letterSpacing: '0.3px' }}>
              Name <span style={{ color: '#dc2626' }}>*</span>
            </span>
            <input 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              type="text" 
              placeholder="Enter full name" 
              style={{ 
                width: '100%', 
                padding: '10px 14px', 
                fontSize: 14, 
                border: '2px solid #e5e7eb', 
                borderRadius: 8,
                outline: 'none',
                transition: 'all 0.2s',
                background: '#ffffff',
                color: '#1f2937',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => { e.target.style.borderColor = '#667eea'; e.target.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)'; }}
              onBlur={(e) => { e.target.style.borderColor = '#e5e7eb'; e.target.style.boxShadow = 'none'; }}
              required 
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', letterSpacing: '0.3px' }}>
                📅 Date of Birth
              </span>
              <div 
                style={{ 
                  position: 'relative', 
                  border: '2px solid #e5e7eb',
                  borderRadius: 8,
                  background: '#ffffff',
                  transition: 'all 0.2s',
                  padding: '10px 14px',
                  boxSizing: 'border-box',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#cbd5e1';
                }}
                onMouseLeave={(e) => {
                  const input = e.currentTarget.querySelector('input');
                  if (document.activeElement !== input) {
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }
                }}
              >
                <input 
                  value={dob} 
                  onChange={(e) => setDob(e.target.value)} 
                  type="date"
                  style={{ 
                    flex: 1,
                    padding: 0, 
                    fontSize: 14, 
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    color: '#1f2937',
                    cursor: 'text',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => { 
                    const container = e.target.parentElement;
                    container.style.borderColor = '#667eea'; 
                    container.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)'; 
                  }}
                  onBlur={(e) => { 
                    const container = e.target.parentElement;
                    container.style.borderColor = '#e5e7eb'; 
                    container.style.boxShadow = 'none'; 
                  }}
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    const input = e.currentTarget.previousElementSibling;
                    input.showPicker?.();
                  }}
                  style={{
                    padding: '4px 8px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 4,
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f3f4f6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                  title="Open calendar"
                >
                  📅
                </button>
              </div>
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', letterSpacing: '0.3px' }}>
                📍 Location
              </span>
              <input 
                value={location} 
                onChange={(e) => setLocation(e.target.value)} 
                type="text" 
                placeholder="City, Country"
                style={{ 
                  width: '100%', 
                  padding: '10px 14px', 
                  fontSize: 14, 
                  border: '2px solid #e5e7eb', 
                  borderRadius: 8,
                  outline: 'none',
                  transition: 'all 0.2s',
                  background: '#ffffff',
                  color: '#1f2937',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => { e.target.style.borderColor = '#667eea'; e.target.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)'; }}
                onBlur={(e) => { e.target.style.borderColor = '#e5e7eb'; e.target.style.boxShadow = 'none'; }}
              />
            </label>
          </div>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', letterSpacing: '0.3px' }}>
              🖼️ Photo URL
            </span>
            <input 
              value={photo} 
              onChange={(e) => setPhoto(e.target.value)} 
              type="url" 
              placeholder="https://example.com/photo.jpg"
              style={{ 
                width: '100%', 
                padding: '10px 14px', 
                fontSize: 14, 
                border: '2px solid #e5e7eb', 
                borderRadius: 8,
                outline: 'none',
                transition: 'all 0.2s',
                background: '#ffffff',
                color: '#1f2937',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => { e.target.style.borderColor = '#667eea'; e.target.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)'; }}
              onBlur={(e) => { e.target.style.borderColor = '#e5e7eb'; e.target.style.boxShadow = 'none'; }}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', letterSpacing: '0.3px' }}>
              📝 Notes
            </span>
            <textarea 
              value={notes} 
              onChange={(e) => setNotes(e.target.value)} 
              rows={4} 
              placeholder="Add notes, occupation, interesting facts..."
              style={{ 
                width: '100%', 
                padding: '10px 14px', 
                fontSize: 14, 
                border: '2px solid #e5e7eb', 
                borderRadius: 8,
                outline: 'none',
                transition: 'all 0.2s',
                resize: 'vertical',
                fontFamily: 'inherit',
                background: '#ffffff',
                color: '#1f2937',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => { e.target.style.borderColor = '#667eea'; e.target.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)'; }}
              onBlur={(e) => { e.target.style.borderColor = '#e5e7eb'; e.target.style.boxShadow = 'none'; }}
            />
          </label>

          {/* Action Buttons */}
          <div style={{ 
            display: 'flex', 
            gap: 10, 
            flexWrap: 'wrap', 
            marginTop: 8,
            paddingTop: 18,
            borderTop: '1px solid #e5e7eb'
          }}>
            <button 
              type="submit" 
              disabled={!canSave || !name.trim()} 
              style={{ 
                padding: '11px 20px', 
                borderRadius: 8, 
                background: (canSave && name.trim()) ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : '#94a3b8', 
                color: '#fff', 
                border: 'none', 
                cursor: (canSave && name.trim()) ? 'pointer' : 'not-allowed',
                fontSize: 14,
                fontWeight: 600,
                boxShadow: (canSave && name.trim()) ? '0 4px 12px rgba(16, 185, 129, 0.3)' : 'none',
                transition: 'all 0.2s',
                flex: 1,
                minWidth: 140
              }}
              onMouseEnter={(e) => {
                if (canSave && name.trim()) {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = (canSave && name.trim()) ? '0 4px 12px rgba(16, 185, 129, 0.3)' : 'none';
              }}
            >
              {isEdit ? '💾 Save Changes' : '➕ Add Member'}
            </button>

            {isEdit && onMoveToPool && isOnCanvas && (
              <button 
                type="button" 
                onClick={() => onMoveToPool(member._id)} 
                style={{ 
                  padding: '11px 18px', 
                  borderRadius: 8, 
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', 
                  color: '#fff', 
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                  boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(245, 158, 11, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(245, 158, 11, 0.3)';
                }}
              >
                📦 Move to Pool
              </button>
            )}

            {isEdit && onDelete && (
              <button 
                type="button" 
                onClick={() => onDelete(member._id)} 
                style={{ 
                  padding: '11px 18px', 
                  borderRadius: 8, 
                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', 
                  color: '#fff', 
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(239, 68, 68, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
                }}
              >
                🗑️ Delete
              </button>
            )}

            <button 
              type="button" 
              onClick={onClose} 
              style={{ 
                padding: '11px 18px', 
                borderRadius: 8, 
                background: '#ffffff', 
                color: '#374151', 
                border: '2px solid #d1d5db',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f3f4f6';
                e.currentTarget.style.borderColor = '#9ca3af';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#ffffff';
                e.currentTarget.style.borderColor = '#d1d5db';
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to { 
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}
