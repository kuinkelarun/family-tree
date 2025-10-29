import React from 'react';
import { Handle } from 'reactflow';

const nodeStyle = {
  padding: 8,
  borderRadius: 6,
  background: '#fff',
  border: '1px solid #e6edf3',
  boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minWidth: 100,
  justifyContent: 'center',
};

const baseHandle = {
  background: '#fff',
  width: 6,
  height: 6,
  borderRadius: 6,
  zIndex: 6,
};

export default function FamilyNode({ id, data }) {
  return (
    <div style={{ position: 'relative', padding: 2 }}>
      {/* Top handles */}
      <Handle type="target" position="top" id="top-target" style={{ ...baseHandle, border: '1px solid #0f172a' }} />
      <Handle type="source" position="top" id="top-source" style={{ ...baseHandle, border: '1px solid #10b981' }} />

      {/* Left handles */}
      <Handle type="target" position="left" id="left-target" style={{ ...baseHandle, border: '1px solid #0f172a' }} />
      <Handle type="source" position="left" id="left-source" style={{ ...baseHandle, border: '1px solid #10b981' }} />

      <div style={nodeStyle}>
        <div style={{ fontSize: 13, color: '#0f172a' }}>{data?.label ?? id}</div>
      </div>

      {/* Right handles */}
      <Handle type="source" position="right" id="right-source" style={{ ...baseHandle, border: '1px solid #10b981' }} />
      <Handle type="target" position="right" id="right-target" style={{ ...baseHandle, border: '1px solid #0f172a' }} />

      {/* Bottom handles */}
      <Handle type="target" position="bottom" id="bottom-target" style={{ ...baseHandle, border: '1px solid #0f172a' }} />
      <Handle type="source" position="bottom" id="bottom-source" style={{ ...baseHandle, border: '1px solid #10b981' }} />
    </div>
  );
}
