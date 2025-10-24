export default function Sidebar({ 
  onCheckApi, 
  apiStatus, 
  members = [], 
  nodesOnCanvas = [], 
  onAddMemberToCanvas,
  onSelectMember,
  onDeleteMember 
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

  function handleDeleteFromPool(member, e) {
    e.stopPropagation(); // Prevent drag from triggering
    if (onDeleteMember) {
      onDeleteMember(member._id, true); // Delete entirely (from pool)
    }
  }

  return (
    <aside style={{ width: 320, padding: 16, borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <h2 style={{ marginTop: 0, fontSize: 20, color: '#111827' }}>Family Tree</h2>
      <button onClick={onCheckApi} style={{ padding: '8px 12px', borderRadius: 6, background: '#1f6feb', color: '#fff', border: 'none', fontSize: 13 }}>
        Check API Health
      </button>
      <div style={{ marginTop: 8, fontSize: 12, color: apiStatus === 'ok' ? '#10b981' : '#6b7280' }}>
        API: {apiStatus || 'unknown'}
      </div>
      
      <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />
      
      {/* Member Pool - NOT on canvas */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <strong style={{ fontSize: 14, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }}></span>
            Member Pool ({membersNotOnCanvas.length})
          </strong>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4, marginBottom: 8 }}>
            Drag to canvas or click to add
          </div>
          {membersNotOnCanvas.length === 0 ? (
            <div style={{ padding: 12, background: '#f9fafb', borderRadius: 6, fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>
              No members in pool. Use "Add New Member" form below to create members.
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0 0', display: 'grid', gap: 6 }}>
              {membersNotOnCanvas.map((m) => (
                <li
                  key={m._id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, m)}
                  style={{
                    padding: '8px 10px',
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    cursor: 'grab',
                    fontSize: 13,
                    color: '#1f2937',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f3f4f6';
                    e.currentTarget.style.borderColor = '#3b82f6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#ffffff';
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                >
                  <span style={{ fontWeight: 500, flex: 1 }}>{m.name || 'Unnamed'}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      onClick={() => onAddMemberToCanvas?.(m)}
                      style={{
                        padding: '2px 8px',
                        fontSize: 11,
                        borderRadius: 4,
                        background: '#3b82f6',
                        color: '#fff',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                      title="Add to canvas"
                    >
                      + Add
                    </button>
                    <button
                      onClick={(e) => handleDeleteFromPool(m, e)}
                      style={{
                        padding: '2px 8px',
                        fontSize: 11,
                        borderRadius: 4,
                        background: '#dc2626',
                        color: '#fff',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                      title="Delete member permanently"
                    >
                      🗑️
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
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0 0', display: 'grid', gap: 4 }}>
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
                  {m.name || 'Unnamed'}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}
