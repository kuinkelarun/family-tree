import { useEffect, useState, useRef } from 'react';
import { api } from '../utils/api.js';

export default function MemberModal({
  open,
  member, // optional; if present => edit mode
  onSave,
  onClose,
  canSave = true,
  onDelete, // optional; only for edit mode
  onMoveToPool, // optional; only when on canvas
  allMembers = [], // for duplicate-name validation
}) {
  const isEdit = !!(member && member._id);
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [dob, setDob] = useState('');
  const [photo, setPhoto] = useState('');
  const [notes, setNotes] = useState('');
  const [location, setLocation] = useState('');
  const [gender, setGender] = useState('unknown');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [photoEditOpen, setPhotoEditOpen] = useState(false);
  const fileInputRef = useRef(null);

  const isOnCanvas = !!(
    member && member.position &&
    typeof member.position.x === 'number' &&
    typeof member.position.y === 'number'
  );
  // Normalize input for case-insensitive and unicode-stable comparisons
  const normalize = (s) => String(s || '').trim().normalize('NFC').toLocaleLowerCase();

  const duplicateName = (() => {
    const trimmed = normalize(name);
    if (!trimmed) return false;
    return allMembers.some(m => (normalize(m.name) === trimmed) && (!member || String(m._id) !== String(member._id)));
  })();

  const duplicateSameNickname = (() => {
    const nm = normalize(name);
    const nick = normalize(nickname);
    if (!nm || !nick) return false;
    return allMembers.some(m => (
      normalize(m.name) === nm &&
      normalize(m.nickname) === nick &&
      (!member || String(m._id) !== String(member._id))
    ));
  })();
  useEffect(() => {
    if (open) {
      setName(member?.name || '');
      setNickname(member?.nickname || '');
      const isoDob = member?.dob ? new Date(member.dob).toISOString().slice(0, 10) : '';
      setDob(isoDob);
      setPhoto(member?.photo || '');
      setNotes(member?.notes || '');
      setLocation(member?.location || '');
      setGender(member?.gender || 'unknown');
      setLightboxOpen(false);
      setPhotoEditOpen(false);
      setUploadError('');
      setUploading(false);
    }
  }, [open, member]);

  // Global Escape-to-close handling: close in priority order -> photo popup, lightbox, main modal
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        if (photoEditOpen) {
          e.preventDefault();
          e.stopPropagation();
          setPhotoEditOpen(false);
          return;
        }
        if (lightboxOpen) {
          e.preventDefault();
          e.stopPropagation();
          setLightboxOpen(false);
          return;
        }
        if (open) {
          e.preventDefault();
          e.stopPropagation();
          onClose && onClose();
        }
      }
    };
    if (open || photoEditOpen || lightboxOpen) {
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }
  }, [open, photoEditOpen, lightboxOpen, onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = { name: name.trim(), nickname: nickname.trim() };
    if (dob && String(dob).trim()) payload.dob = dob;
    if (photo && String(photo).trim()) payload.photo = String(photo).trim();
    if (notes && String(notes).trim()) payload.notes = notes;
    if (location && String(location).trim()) payload.location = location;
  if (gender) payload.gender = gender;

    if (import.meta.env.DEV) {
      // Debug: log the payload being submitted (helps track 400 validation issues)
      // eslint-disable-next-line no-console
      console.log('[MemberModal] submit payload:', payload);
    }

    onSave && onSave(payload);
  };

  // Don't render the modal UI unless it's open
  if (!open) return null;

  return (
    <div 
      onClick={() => { if (!photoEditOpen && !lightboxOpen) { onClose && onClose(); } }}
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
          width: 'min(560px, 94vw)', 
          background: '#ffffff', 
          borderRadius: 14, 
          boxShadow: '0 16px 44px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(0, 0, 0, 0.05)', 
          // Allow vertical scroll inside the dialog if content exceeds viewport height
          maxHeight: '92vh',
          overflowY: 'auto',
          overflowX: 'hidden',
          animation: 'slideUp 0.25s ease-out'
        }}
      >
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          padding: '14px 16px', 
          borderBottom: '2px solid #e5e7eb', 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ 
              width: 32, 
              height: 32, 
              borderRadius: 8, 
              background: 'rgba(255, 255, 255, 0.2)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              fontSize: 18
            }}>
              {isEdit ? '✏️' : '👤'}
            </div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#ffffff' }}>
              {isEdit ? 'Edit Member Details' : 'Add New Member'}
            </h3>
          </div>
          <button 
            onClick={onClose} 
            title="Close dialog"
            style={{ 
              padding: '6px 10px', 
              borderRadius: 6, 
              background: 'rgba(255, 255, 255, 0.2)', 
              color: '#ffffff', 
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
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
  <form onSubmit={handleSubmit} style={{ padding: '16px', paddingBottom: '12px', display: 'grid', gap: 12, background: '#f9fafb' }}>
          {/* Top section: left photo panel, right details */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 180px) 1fr', gap: 12, alignItems: 'start' }}>
            {/* Left: Photo panel */}
            <div style={{ display: 'grid', gap: 10, marginLeft: 0, position: 'relative', zIndex: 1 }}>
              <div style={{ position: 'relative', width: 112, height: 112 }}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (photo?.trim()) {
                      // View larger when clicking on existing photo
                      setLightboxOpen(true);
                    } else {
                      // No image yet: open upload/change UI
                      setPhotoEditOpen(true);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (photo?.trim()) setLightboxOpen(true);
                      else setPhotoEditOpen(true);
                    }
                  }}
                  title={photo?.trim() ? 'Click to view' : 'Upload Photo'}
                  aria-label={photo?.trim() ? 'Click to view' : 'Upload Photo'}
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: 12,
                    overflow: 'hidden',
                    border: '2px solid #e5e7eb',
                    background: photo?.trim() ? '#f3f4f6' : '#f8fafc',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                >
                  {photo?.trim() ? (
                    <img
                      src={photo}
                      alt="Photo preview"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const box = e.currentTarget.parentElement;
                        if (box) { box.style.background = '#fee2e2'; box.style.borderColor = '#fecaca'; }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setPhotoEditOpen(true); }}
                      style={{
                        padding: '6px 10px',
                        fontSize: 12,
                        border: '2px solid #e5e7eb',
                        borderRadius: 6,
                        background: '#f3f4f6',
                        color: '#111827',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        whiteSpace: 'nowrap'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#e5e7eb'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '#f3f4f6'; }}
                    >
                      Upload Photo
                    </button>
                  )}
                </div>

                {/* Edit button when photo exists */}
                {photo?.trim() && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setPhotoEditOpen(true); }}
                    title="Edit photo"
                    style={{
                      position: 'absolute',
                      right: 6,
                      bottom: 6,
                      background: 'rgba(0,0,0,0.55)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      padding: '4px 6px',
                      fontSize: 12,
                      cursor: 'pointer'
                    }}
                  >
                    ✎ Edit
                  </button>
                )}
              </div>

              {/* Photo edit panel moved to centered glass-style modal overlay below */}
              {photoEditOpen && null}

              {/* Lightbox overlay */}
              {lightboxOpen && (
                <div
                  onClick={(e) => { e.stopPropagation(); setLightboxOpen(false); }}
                  style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.8)',
                    zIndex: 3000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 16,
                  }}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}
                  >
                    <img
                      src={photo}
                      alt="Full-size preview"
                      referrerPolicy="no-referrer"
                      style={{
                        maxWidth: '90vw',
                        maxHeight: '90vh',
                        width: 'auto',
                        height: 'auto',
                        display: 'block',
                        borderRadius: 12,
                        boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
                      }}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setLightboxOpen(false)}
                      aria-label="Close image preview"
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        background: 'rgba(0,0,0,0.6)',
                        color: '#fff',
                        border: 'none',
                        padding: '8px 10px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontSize: 14,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Details panel */}
            <div style={{ display: 'grid', gap: 10, marginLeft: -6 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', letterSpacing: '0.3px' }}>
                  Name <span style={{ color: '#dc2626' }}>*</span>
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  type="text"
                  placeholder="Enter full name"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: 13,
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

              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', letterSpacing: '0.3px' }}>
                  Nickname
                </span>
                <input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  type="text"
                  placeholder="e.g., Jr., Sr., Mike, AJ"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: 13,
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
              {/* Duplicate name hint and rule: require nickname when duplicate */}
              {duplicateName && !nickname.trim() && (
                <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>
                  This name is already taken. Please add a nickname to distinguish.
                </div>
              )}
              {duplicateSameNickname && (
                <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>
                  This name and nickname are already used. Please choose a different nickname.
                </div>
              )}

              {/* Gender radio group inserted below Name/Nickname and above Date of Birth/Location */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '96px 1fr',
                alignItems: 'center',
                gap: 6,
                marginTop: 0,
                marginBottom: 0
              }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', letterSpacing: '0.3px', lineHeight: '32px', marginLeft: -12 }}>Gender</span>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#1f2937', whiteSpace: 'nowrap' }}>
                    <input
                      type="radio"
                      name="gender"
                      value="male"
                      checked={gender === 'male'}
                      onChange={(e) => setGender(e.target.value)}
                    />
                    Male
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#1f2937', whiteSpace: 'nowrap' }}>
                    <input
                      type="radio"
                      name="gender"
                      value="female"
                      checked={gender === 'female'}
                      onChange={(e) => setGender(e.target.value)}
                    />
                    Female
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#1f2937', whiteSpace: 'nowrap' }}>
                    <input
                      type="radio"
                      name="gender"
                      value="nonbinary"
                      checked={gender === 'nonbinary'}
                      onChange={(e) => setGender(e.target.value)}
                    />
                    Non‑binary
                  </label>
                  {/* No hint needed for unknown */}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', letterSpacing: '0.3px' }}>
                    📅 Date of Birth
                  </span>
                  <div
                    style={{
                      position: 'relative',
                      border: '2px solid #e5e7eb',
                      borderRadius: 8,
                      background: '#ffffff',
                      transition: 'all 0.2s',
                      padding: '8px 12px',
                      height: '40px',
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
                        height: '100%',
                        fontSize: 13,
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
                    {/* Using the built-in calendar indicator only; removed custom trigger button */}
                  </div>
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', letterSpacing: '0.3px' }}>
                    📍 Location
                  </span>
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    type="text"
                    placeholder="City, Country"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      height: '40px',
                      fontSize: 13,
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
              {/* Removed old select-based gender selector */}
            </div>
          </div>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', letterSpacing: '0.3px' }}>
              📝 Notes
            </span>
            <textarea 
              value={notes} 
              onChange={(e) => setNotes(e.target.value)} 
              rows={4} 
              placeholder="Add notes, occupation, interesting facts..."
              style={{ 
                width: '100%', 
                padding: '8px 12px', 
                fontSize: 13, 
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
            position: 'sticky',
            bottom: 0,
            background: 'linear-gradient(to top, rgba(249,250,251,0.98), rgba(249,250,251,0.92), rgba(249,250,251,0))',
            backdropFilter: 'blur(2px)',
            display: 'flex', 
            gap: 10, 
            flexWrap: 'wrap', 
            marginTop: 4,
            paddingTop: 8,
            paddingBottom: 8,
            borderTop: '1px solid rgba(17,24,39,0.06)'
          }}>
            <button 
              type="submit" 
              disabled={!canSave || !name.trim() || (duplicateName && !nickname.trim()) || duplicateSameNickname} 
              style={{ 
                padding: '8px 12px', 
                borderRadius: 6, 
                background: (canSave && name.trim() && !(duplicateName && !nickname.trim()) && !duplicateSameNickname) ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : '#94a3b8', 
                color: '#fff', 
                border: 'none', 
                cursor: (canSave && name.trim() && !(duplicateName && !nickname.trim()) && !duplicateSameNickname) ? 'pointer' : 'not-allowed',
                fontSize: 12,
                fontWeight: 600,
                boxShadow: (canSave && name.trim() && !(duplicateName && !nickname.trim()) && !duplicateSameNickname) ? '0 2px 8px rgba(16, 185, 129, 0.25)' : 'none',
                transition: 'all 0.2s',
                flex: 1,
                minWidth: 110
              }}
              onMouseEnter={(e) => {
                if (canSave && name.trim() && !(duplicateName && !nickname.trim()) && !duplicateSameNickname) {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = (canSave && name.trim() && !(duplicateName && !nickname.trim()) && !duplicateSameNickname) ? '0 4px 12px rgba(16, 185, 129, 0.3)' : 'none';
              }}
            >
              {isEdit ? 'Save Changes' : 'Add Member'}
            </button>

            {isEdit && onMoveToPool && isOnCanvas && (
              <button 
                type="button" 
                onClick={() => onMoveToPool(member._id)} 
                style={{ 
                  padding: '8px 12px', 
                  borderRadius: 6, 
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', 
                  color: '#fff', 
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  boxShadow: '0 2px 8px rgba(245, 158, 11, 0.25)',
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
                Move to Pool
              </button>
            )}

            {isEdit && onDelete && (
              <button 
                type="button" 
                onClick={() => onDelete(member._id)} 
                style={{ 
                  padding: '8px 12px', 
                  borderRadius: 6, 
                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', 
                  color: '#fff', 
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  boxShadow: '0 2px 8px rgba(239, 68, 68, 0.25)',
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
                Delete
              </button>
            )}

            <button 
              type="button" 
              onClick={onClose} 
              style={{ 
                padding: '8px 12px', 
                borderRadius: 6, 
                background: '#ffffff', 
                color: '#374151', 
                border: '2px solid #d1d5db',
                cursor: 'pointer',
                fontSize: 12,
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

      {/* Centered glass-style popup for photo add/change */}
      {photoEditOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => { e.stopPropagation(); setPhotoEditOpen(false); }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 3500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.35)', // slate-900/35 overlay tint
            backdropFilter: 'blur(6px) saturate(120%)',
            WebkitBackdropFilter: 'blur(6px) saturate(120%)',
            animation: 'fadeIn 0.15s ease-out'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(520px, 92vw)',
              background: 'rgba(255, 255, 255, 0.58)',
              border: '1px solid rgba(255, 255, 255, 0.7)',
              borderRadius: 16,
              boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
              backdropFilter: 'blur(14px) saturate(160%)',
              WebkitBackdropFilter: 'blur(14px) saturate(160%)',
              padding: 14,
              display: 'grid',
              gap: 10,
              animation: 'slideUp 0.2s ease-out'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: 13, color: '#111827' }}>{photo?.trim() ? 'Change Photo' : 'Add Photo'}</strong>
              <button
                type="button"
                onClick={() => setPhotoEditOpen(false)}
                style={{ fontSize: 12, background: 'transparent', border: 'none', color: '#374151', cursor: 'pointer' }}
                aria-label="Close add photo popup"
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'stretch', flexWrap: 'wrap' }}>
              <input
                value={photo}
                onChange={(e) => setPhoto(e.target.value)}
                type="text"
                placeholder="https://... or /uploads/your-file.jpg"
                style={{
                  flex: 1,
                  minWidth: 200,
                  padding: '8px 12px',
                  height: '38px',
                  fontSize: 12,
                  border: '2px solid rgba(229, 231, 235, 0.9)',
                  borderRadius: 10,
                  outline: 'none',
                  transition: 'all 0.2s',
                  background: 'rgba(255,255,255,0.75)',
                  color: '#111827',
                  boxSizing: 'border-box'
                }}
                onInput={(e) => {
                  const input = e.currentTarget;
                  const val = input.value.trim();
                  if (!val) { input.setCustomValidity(''); return; }
                  const ok = /^https?:\/\//i.test(val) || /^\/uploads\//.test(val);
                  input.setCustomValidity(ok ? '' : 'Enter a full URL (https://...) or an uploaded path like /uploads/filename.jpg');
                }}
                onFocus={(e) => { e.target.style.borderColor = '#667eea'; e.target.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.15)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'rgba(229, 231, 235, 0.9)'; e.target.style.boxShadow = 'none'; }}
              />

              {/* Hidden native file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const f = e.target.files && e.target.files[0];
                  if (!f) return;
                  setUploadError('');
                  try {
                    const dataUrl = await new Promise((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(reader.result);
                      reader.onerror = reject;
                      reader.readAsDataURL(f);
                    });
                    setUploading(true);
                    const resp = await api('/api/uploads', { method: 'POST', body: { dataUrl } });
                    setPhoto(resp.url || '');
                    setPhotoEditOpen(false);
                  } catch (err) {
                    setUploadError(err?.message || 'Upload failed');
                  } finally {
                    setUploading(false);
                    e.target.value = '';
                  }
                }}
              />

              {/* Styled trigger button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  padding: '7px 10px',
                  fontSize: 12,
                  border: '2px solid rgba(229, 231, 235, 0.9)',
                  borderRadius: 10,
                  background: 'rgba(243, 244, 246, 0.85)',
                  color: '#111827',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                  height: '38px'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(229, 231, 235, 0.9)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(243, 244, 246, 0.85)'; }}
                title="Upload a photo from your device"
              >
                Choose File to Upload
              </button>

              {uploading && <span style={{ alignSelf: 'center', fontSize: 11, color: '#1f6feb' }}>Uploading…</span>}
              {uploadError && <span style={{ alignSelf: 'center', fontSize: 11, color: '#dc2626' }}>{uploadError}</span>}
            </div>

            <span style={{ fontSize: 11, color: '#374151' }}>Tip: paste a https:// URL or use Choose File to Upload to create a /uploads/... path.</span>
          </div>
        </div>
      )}

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
