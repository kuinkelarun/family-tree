import { displayMemberName } from '../utils/format.js';

export default function Sidebar({ 
  onCheckApi, 
  apiStatus, 
  members = [], 
  nodesOnCanvas = [], 
  onAddMemberToCanvas,
  onSelectMember,
  onDeleteMember,
  onAddNewMember,
  currentUser,
  onOpenAdmin,
  canAddMember = false,
  showToast,
  onCollapse, // new: callback to collapse
  collapsed = false, // reserved (not used internally yet)
}) {
  // Members that are NOT yet on canvas
  const membersNotOnCanvas = members.filter(m => !nodesOnCanvas.includes(m._id));
  
  // Members that ARE on canvas
  const membersOnCanvas = members.filter(m => nodesOnCanvas.includes(m._id));

  function handleDragStart(e, member) {
    e.dataTransfer.setData('application/reactflow', 'member');
    e.dataTransfer.setData('memberId', member._id);
    e.dataTransfer.effectAllowed = 'move';
  }

  return (
    <aside style={{ width: 240, padding: 12, borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', transition: 'width 0.25s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <h2 style={{ marginTop: 0, fontSize: 18, color: '#111827', margin: 0, flex: 1 }}>Family Tree</h2>
        {currentUser && Array.isArray(currentUser.roles) && currentUser.roles.includes('admin') && (
          <button onClick={() => onOpenAdmin?.()} title="Admin" style={{ padding: '4px 8px', borderRadius: 6, background: '#111827', color: '#fff', border: 'none' }}>Admin</button>
        )}
        {typeof onCollapse === 'function' && (
          <button onClick={onCollapse} title="Collapse" style={{ padding: '4px 6px', borderRadius: 6, background: '#e2e8f0', color: '#334155', border: '1px solid #cbd5e1', fontSize: 12 }}>◀</button>
        )}
      </div>
      {/* Left pane control area intentionally minimal for production: no debug controls */}
      
  <hr style={{ margin: '12px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />
      
      {/* Member Pool - NOT on canvas */}
  <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <strong style={{ fontSize: 14, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }}></span>
            Member Pool ({membersNotOnCanvas.length})
          </strong>
          <div style={{ marginTop: 8, marginBottom: 8 }}>
            <button
              onClick={() => { if (canAddMember) { onAddNewMember?.(); } else { showToast ? showToast('Create or select a tree to add members.') : null; } }}
              // Use aria-disabled instead of disabled so we can still show a toast when clicked.
              aria-disabled={!canAddMember}
              tabIndex={canAddMember ? 0 : -1}
              title={!canAddMember ? 'Create or select a tree to add members.' : 'Add a new member to this tree'}
              style={{ padding: '6px 10px', borderRadius: 6, background: canAddMember ? '#2563eb' : '#c7d2fe', color: '#fff', border: 'none', cursor: canAddMember ? 'pointer' : 'not-allowed' }}
            >
              + Add New Member
            </button>
          </div>
          {/* <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4, marginBottom: 8 }}>
            Use "+ Add New Member" to create; drag to canvas or click a member to edit
          </div> */}
          {membersNotOnCanvas.length === 0 ? (
            <div style={{ padding: 12, background: '#f9fafb', borderRadius: 6, fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>
              No members in pool. Use the "+ Add New Member" button above to create members.
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0 0', display: 'grid', gap: 6,
              ...(membersNotOnCanvas.length > 5 ? { maxHeight: 5 * 46, overflowY: 'auto', paddingRight: 4 } : {})
            }}>
              {membersNotOnCanvas.map((m) => (
                <li
                  key={m._id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, m)}
                  onClick={() => onSelectMember?.(m._id)}
                  style={{
                    padding: '8px 10px',
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 13,
                    color: '#1f2937',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f3f4f6';
                    e.currentTarget.style.borderColor = '#f97316';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#ffffff';
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                >
                  <span style={{ fontWeight: 500, flex: 1 }}>{displayMemberName(m)}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); onAddMemberToCanvas?.(m); }}
                      style={{
                        padding: '2px 8px',
                        fontSize: 11,
                        borderRadius: 4,
                        background: '#f97316',
                        color: '#fff',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                      title="Add to canvas"
                    >
                      + Add
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <hr style={{ margin: '8px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />

        {/* Members on Canvas */}
        <div>
          <strong style={{ fontSize: 14, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }}></span>
            On Canvas ({membersOnCanvas.length})
          </strong>
          {membersOnCanvas.length === 0 ? (
            <div style={{ padding: 12, background: '#f9fafb', borderRadius: 6, fontSize: 12, color: '#6b7280', fontStyle: 'italic', marginTop: 8 }}>
              No members on canvas yet.
            </div>
          ) : (
            <ul style={{
              listStyle: 'none',
              padding: 0,
              margin: '8px 0 0 0',
              display: 'grid',
              gap: 4,
              height: 9 * 38, // fixed viewport for 10 items
              overflowY: 'auto',
              paddingRight: 4
            }}>
              {membersOnCanvas.map((m) => (
                <li
                  key={m._id}
                  onClick={() => onSelectMember?.(m._id)}
                  style={{
                    padding: '6px 10px',
                    background: '#f0fdf4',
                    border: '1px solid #86efac',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 12,
                    color: '#166534',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#dcfce7';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#f0fdf4';
                  }}
                >
                  {displayMemberName(m)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}
