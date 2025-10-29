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
          boxShadow: selected 
            ? '0 0 0 3px rgba(245, 158, 11, 0.3)' 
            : '0 2px 8px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          cursor: 'default',
          transition: 'all 0.2s ease',
        }}
        title={`Family Unit Connector${verified ? ' (Verified)' : ''}`}
      >
        <span style={{ opacity: 0.8 }}>
          {label || '⚭'}
        </span>
      </div>

      {/* Hover tooltip */}
      {selected && (
        <div
          style={{
            position: 'absolute',
            top: -40,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#111827',
            color: 'white',
            padding: '4px 8px',
            borderRadius: 4,
            fontSize: 10,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          }}
        >
          Marriage Point
          {parents.length === 2 && (
            <div style={{ fontSize: 9, opacity: 0.7 }}>
              {parents.length} parents
            </div>
          )}
        </div>
      )}
    </div>
  );
}
