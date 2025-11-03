import React from 'react';
import { Handle, Position } from 'reactflow';

/**
 * Virtual connector node for multi-parent (family unit) connections
 * Appears as a small circle between parents, connecting to children
 */
export default function MarriagePointNode({ data, selected }) {
  const { label, parents = [], verified } = data;

  return (
    <div
      style={{
        position: 'relative',
        width: 20,
        height: 20,
      }}
    >
      {/* Connection handles */}
      <Handle 
        type="target" 
        position={Position.Top} 
        id="top-target"
        style={{ 
          background: '#94a3b8',
          border: '2px solid white',
          width: 8,
          height: 8,
        }}
      />
      <Handle 
        type="source" 
        position={Position.Bottom}
        id="bottom-source"
        style={{ 
          background: '#94a3b8',
          border: '2px solid white',
          width: 8,
          height: 8,
        }}
      />

      {/* Marriage point indicator */}
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: verified ? '#10b981' : '#94a3b8',
          border: `2px solid ${selected ? '#f59e0b' : 'white'}`,
          boxShadow: selected ? '0 0 0 3px rgba(245, 158, 11, 0.3)' : '0 2px 8px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
            cursor: 'grab',
          transition: 'all 0.2s ease',
        }}
      >
        <span style={{ opacity: 0.8 }}>
          {'⚭'}
        </span>
      </div>
    </div>
  );
}
