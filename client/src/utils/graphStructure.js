/**
 * Graph Structure Utilities for Family Tree
 * Handles multi-parent connections and hierarchical organization
 */

/**
 * Builds a hierarchical graph structure from flat member array
 * @param {Array} members - Array of member objects with relationships
 * @returns {Object} - { nodes, edges, generations, familyUnits, virtualNodes }
 */
export function buildFamilyGraph(members) {
  const graph = {
    nodes: new Map(), // memberId -> node data
    edges: [], // Array of edge definitions
    generations: new Map(), // generation number -> [memberIds]
    familyUnits: new Map(), // unitId -> { parents: [], children: [], marriagePoint }
    virtualNodes: [], // Marriage point connector nodes
  };

  // Phase 1: Classify nodes by generation
  const visited = new Set();
  const rootMembers = members.filter(m => !hasParent(m));
  
  if (rootMembers.length === 0 && members.length > 0) {
    // No clear root, pick first member
    traverseAndAssign(members[0], 0, visited, graph, members);
  } else {
    rootMembers.forEach(root => {
      traverseAndAssign(root, 0, visited, graph, members);
    });
  }

  // Phase 2: Identify family units (parent pairs + children)
  identifyFamilyUnits(members, graph);

  // Phase 3: Build edge list with grouping metadata
  buildEnhancedEdges(members, graph);

  return graph;
}

/**
 * Recursively assigns generation numbers to members
 */
function traverseAndAssign(member, layer, visited, graph, allMembers) {
  if (!member || visited.has(member._id)) return;
  visited.add(member._id);
  
  if (!graph.generations.has(layer)) {
    graph.generations.set(layer, []);
  }
  graph.generations.get(layer).push(member._id);
  
  graph.nodes.set(member._id, {
    ...member,
    generation: layer,
  });
  
  // Recursively assign children to next layer
  const children = getChildren(member, allMembers);
  children.forEach(child => {
    traverseAndAssign(child, layer + 1, visited, graph, allMembers);
  });
}

/**
 * Identifies parent-parent-children triads (family units)
 * Creates marriage point metadata for multi-parent connections
 */
function identifyFamilyUnits(members, graph) {
  const processedChildren = new Set();
  
  members.forEach(child => {
    if (processedChildren.has(child._id)) return;
    
    const parents = getParents(child, members);
    
    if (parents.length === 2) {
      // Create unique unit ID (sorted to ensure consistency)
      const parentIds = [parents[0]._id, parents[1]._id].sort();
      const unitId = `unit_${parentIds[0]}_${parentIds[1]}`;
      
      if (!graph.familyUnits.has(unitId)) {
        graph.familyUnits.set(unitId, {
          id: unitId,
          parents: parentIds,
          children: [],
          marriagePointId: `mp_${unitId}`,
        });
      }
      
      graph.familyUnits.get(unitId).children.push(child._id);
      processedChildren.add(child._id);
    }
  });
}

/**
 * Creates edge list with multi-parent grouping using virtual nodes
 */
function buildEnhancedEdges(members, graph) {
  const createdEdges = new Set(); // Track to prevent duplicates
  
  // Process family units (multi-parent connections)
  graph.familyUnits.forEach(unit => {
    const { parents, children, marriagePointId } = unit;
    
    if (parents.length === 2) {
      const [parent1Id, parent2Id] = parents;
      
      // 1. Create spouse edge between parents (horizontal)
      // Ensure consistent visual direction: left-most node -> right-most node
      const p1 = graph.nodes.get(parent1Id);
      const p2 = graph.nodes.get(parent2Id);
      let leftId = String(parent1Id);
      let rightId = String(parent2Id);
      if (p1 && p2) {
        if ((p1.position?.x || 0) > (p2.position?.x || 0)) {
          leftId = String(parent2Id);
          rightId = String(parent1Id);
        }
      }
      const spouseEdgeId = `spouse_${leftId}_${rightId}`;
      if (!createdEdges.has(spouseEdgeId)) {
        graph.edges.push({
          id: spouseEdgeId,
          source: leftId,
          target: rightId,
          type: 'smoothstep',
          data: { 
            type: 'spouse', 
            label: 'spouse',
            renderStyle: 'horizontal',
          },
        });
        createdEdges.add(spouseEdgeId);
      }
      
      // 2. Create virtual marriage point node
      const parent1 = graph.nodes.get(parent1Id);
      const parent2 = graph.nodes.get(parent2Id);
      
      if (parent1 && parent2) {
        // Calculate marriage point position (will be updated dynamically)
        const mpPosition = {
          x: 0, // Will be calculated as midpoint
          y: 0, // Will be below parents
        };
        
        graph.virtualNodes.push({
          id: marriagePointId,
          type: 'marriagePoint',
          position: mpPosition,
          data: {
            label: '⚭', // Marriage symbol
            parents: parents,
            virtual: true,
          },
        });
        
        // 3. Create edges from parents to marriage point
        [parent1Id, parent2Id].forEach(parentId => {
          const edgeId = `p2mp_${parentId}_${marriagePointId}`;
          graph.edges.push({
            id: edgeId,
            source: String(parentId),
            target: marriagePointId,
            type: 'smoothstep',
            data: {
              type: 'parent-connector',
              virtual: true,
              renderStyle: 'orthogonal',
            },
            style: {
              strokeDasharray: '5,5',
              opacity: 0.4,
            },
          });
        });
        
        // 4. Create edges from marriage point to children
        children.forEach(childId => {
          const edgeId = `mp2c_${marriagePointId}_${childId}`;
          graph.edges.push({
            id: edgeId,
            source: marriagePointId,
            target: String(childId),
            type: 'smoothstep',
            data: {
              type: 'parent',
              label: 'parent',
              fromMarriagePoint: true,
            },
          });
        });
      }
    }
  });
  
  // Process single-parent children and other relationships
  members.forEach(member => {
    const relationships = member.relationships || [];
    
    relationships.forEach(rel => {
      const relativeId = rel.relative._id || rel.relative;
      const type = rel.type;
      
      // Skip if already handled by family unit
      if (type === 'parent') {
        const parents = getParents(member, members);
        if (parents.length === 2) {
          return; // Handled by family unit logic
        }
      }
      
      // Skip child relationships (handled by parent side)
      if (type === 'child') {
        return;
      }
      
      // Skip spouse relationships if already created
      const edgeKey = [member._id, relativeId].sort().join('_');
      if (type === 'spouse' && createdEdges.has(`spouse_${edgeKey}`)) {
        return;
      }
      
      // Create edge for single-parent or other relationships
      const edgeId = `${type}_${member._id}_${relativeId}`;
      if (!createdEdges.has(edgeId)) {
        graph.edges.push({
          id: edgeId,
          source: String(member._id),
          target: String(relativeId),
          type: 'smoothstep',
          data: {
            type,
            label: rel.label || type,
          },
        });
        createdEdges.add(edgeId);
      }
    });
  });
  
  return graph;
}

/**
 * Updates marriage point positions based on parent node positions
 */
export function updateMarriagePointPositions(nodes, virtualNodes) {
  return virtualNodes.map(vpNode => {
    const { parents } = vpNode.data;
    if (!parents || parents.length !== 2) return vpNode;
    
    const parent1 = nodes.find(n => n.id === String(parents[0]));
    const parent2 = nodes.find(n => n.id === String(parents[1]));
    
    if (parent1 && parent2) {
      const midX = (parent1.position.x + parent2.position.x) / 2;
      const maxY = Math.max(parent1.position.y, parent2.position.y);
      
      return {
        ...vpNode,
        position: {
          x: midX,
          y: maxY + 60, // Below parents
        },
      };
    }
    
    return vpNode;
  });
}

// Helper functions

function hasParent(member) {
  if (!member.relationships) return false;
  return member.relationships.some(r => r.type === 'parent');
}

function getParents(member, allMembers) {
  if (!member.relationships) return [];
  
  const parentIds = member.relationships
    .filter(r => r.type === 'parent')
    .map(r => r.relative._id || r.relative);
  
  return allMembers.filter(m => 
    parentIds.some(pid => String(pid) === String(m._id))
  );
}

function getChildren(member, allMembers) {
  if (!member.relationships) return [];
  
  const childIds = member.relationships
    .filter(r => r.type === 'child')
    .map(r => r.relative._id || r.relative);
  
  return allMembers.filter(m => 
    childIds.some(cid => String(cid) === String(m._id))
  );
}

/**
 * Converts enhanced graph structure to ReactFlow format
 */
export function graphToReactFlow(graph, existingPositions = new Map()) {
  const nodes = [];
  const edges = [];
  
  // Convert member nodes
  graph.nodes.forEach((member, memberId) => {
    const existingPos = existingPositions.get(String(memberId));
    
    nodes.push({
      id: String(memberId),
      type: 'default',
      position: existingPos || member.position || { x: 0, y: member.generation * 180 },
      data: {
        label: member.name || 'Unnamed',
        generation: member.generation,
        photo: member.photo,
        relationships: member.relationships || [],
      },
    });
  });
  
  // Add virtual marriage point nodes
  graph.virtualNodes.forEach(vNode => {
    nodes.push({
      id: vNode.id,
      type: 'marriagePoint',
      position: vNode.position,
      data: vNode.data,
    });
  });
  
  // Convert edges
  edges.push(...graph.edges);
  
  return { nodes, edges };
}

/**
 * Deduplicates edges to prevent double rendering
 */
export function deduplicateEdges(edges) {
  const seen = new Set();
  return edges.filter(edge => {
    const key = `${edge.source}|${edge.target}|${edge.data?.type || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
