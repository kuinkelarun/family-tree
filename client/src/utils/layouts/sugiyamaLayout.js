/**
 * Sugiyama Hierarchical Layout Algorithm
 * Optimized for family tree visualization with generational layers
 */

/**
 * Applies Sugiyama layout to family tree members
 * @param {Array} members - Array of member objects
 * @param {Map} familyUnits - Map of family unit structures
 * @param {Object} options - Layout configuration
 * @returns {Map} - memberId -> { x, y } positions
 */
export function applySugiyamaLayout(members, familyUnits, options = {}) {
  const {
    nodeWidth = 160,
    nodeHeight = 80,
    horizontalSpacing = 60,
    verticalSpacing = 140,
    centerX = 600,
    startY = 100,
  } = options;

  // Phase 1: Assign layers (generations)
  const layers = assignLayers(members);
  
  // Phase 2: Minimize edge crossings
  const orderedLayers = minimizeCrossings(layers, members);
  
  // Phase 3: Assign X coordinates with proper spacing
  const positions = assignHorizontalPositions(
    orderedLayers, 
    familyUnits,
    nodeWidth,
    horizontalSpacing,
    centerX
  );
  
  // Phase 4: Assign Y coordinates for generation spacing
  assignVerticalPositions(positions, verticalSpacing, startY);
  
  return positions;
}

/**
 * Phase 1: Assign members to generational layers
 */
function assignLayers(members) {
  const layers = new Map(); // generation number -> [members]
  const visited = new Set();
  
  // Find root nodes (members with no parents)
  const roots = members.filter(m => !hasParent(m));
  
  if (roots.length === 0 && members.length > 0) {
    // No clear root, start from first member
    traverseAndAssignLayer(members[0], 0, layers, visited, members);
  } else {
    // Start from each root
    roots.forEach(root => {
      traverseAndAssignLayer(root, 0, layers, visited, members);
    });
  }
  
  // Handle any unvisited members (disconnected components)
  members.forEach(member => {
    if (!visited.has(member._id)) {
      const generation = member.generation || 0;
      traverseAndAssignLayer(member, generation, layers, visited, members);
    }
  });
  
  return layers;
}

function traverseAndAssignLayer(member, layer, layers, visited, allMembers) {
  if (!member || visited.has(member._id)) return;
  visited.add(member._id);
  
  if (!layers.has(layer)) {
    layers.set(layer, []);
  }
  layers.get(layer).push(member);
  
  // Store generation on member object
  member._computedGeneration = layer;
  
  // Recursively assign children to next layer
  const children = getChildren(member, allMembers);
  children.forEach(child => {
    traverseAndAssignLayer(child, layer + 1, layers, visited, allMembers);
  });
}

/**
 * Phase 2: Minimize edge crossings using barycenter heuristic
 */
function minimizeCrossings(layers, members) {
  const orderedLayers = new Map();
  
  // Initialize ordered layers
  layers.forEach((layerMembers, generation) => {
    orderedLayers.set(generation, [...layerMembers]);
  });
  
  const maxIterations = 8;
  const layerCount = orderedLayers.size;
  
  for (let iter = 0; iter < maxIterations; iter++) {
    // Downward sweep: order by parent positions
    for (let i = 1; i < layerCount; i++) {
      if (!orderedLayers.has(i)) continue;
      
      const layer = Array.from(orderedLayers.get(i));
      const prevLayer = orderedLayers.get(i - 1);
      
      if (!prevLayer) continue;
      
      layer.sort((a, b) => {
        const posA = getBarycenter(a, prevLayer, 'parent');
        const posB = getBarycenter(b, prevLayer, 'parent');
        return posA - posB;
      });
      
      orderedLayers.set(i, layer);
    }
    
    // Upward sweep: order by children positions
    for (let i = layerCount - 2; i >= 0; i--) {
      if (!orderedLayers.has(i)) continue;
      
      const layer = Array.from(orderedLayers.get(i));
      const nextLayer = orderedLayers.get(i + 1);
      
      if (!nextLayer) continue;
      
      layer.sort((a, b) => {
        const posA = getBarycenter(a, nextLayer, 'child');
        const posB = getBarycenter(b, nextLayer, 'child');
        return posA - posB;
      });
      
      orderedLayers.set(i, layer);
    }
  }
  
  return orderedLayers;
}

/**
 * Calculate barycenter (average position) of connected nodes
 */
function getBarycenter(member, adjacentLayer, relationType) {
  const connected = adjacentLayer.filter(m => 
    isConnected(member, m, relationType)
  );
  
  if (connected.length === 0) {
    return adjacentLayer.indexOf(member); // Fallback to current position
  }
  
  const sum = connected.reduce((acc, m) => {
    const idx = adjacentLayer.indexOf(m);
    return acc + (idx >= 0 ? idx : 0);
  }, 0);
  
  return sum / connected.length;
}

function isConnected(member1, member2, relationType) {
  if (!member1.relationships) return false;
  
  return member1.relationships.some(r => {
    const relativeId = r.relative._id || r.relative;
    const matches = String(relativeId) === String(member2._id);
    
    if (relationType === 'parent') {
      return matches && r.type === 'parent';
    } else if (relationType === 'child') {
      return matches && r.type === 'child';
    }
    
    return matches;
  });
}

/**
 * Phase 3: Assign horizontal positions with spacing
 */
function assignHorizontalPositions(orderedLayers, familyUnits, nodeWidth, horizontalSpacing, centerX) {
  const positions = new Map();
  
  orderedLayers.forEach((layerMembers, generation) => {
    // Group spouses together
    const arranged = arrangeLayerWithSpouses(layerMembers, familyUnits);
    
    // Calculate total width of this layer
    const totalWidth = arranged.length * (nodeWidth + horizontalSpacing) - horizontalSpacing;
    const startX = centerX - totalWidth / 2;
    
    // Assign positions
    arranged.forEach((member, index) => {
      const x = startX + index * (nodeWidth + horizontalSpacing);
      positions.set(member._id, {
        x,
        y: 0, // Will be set in Phase 4
        generation,
      });
    });
  });
  
  return positions;
}

/**
 * Arrange layer members, keeping spouses adjacent
 */
function arrangeLayerWithSpouses(members, familyUnits) {
  const arranged = [];
  const processed = new Set();
  
  members.forEach(member => {
    if (processed.has(member._id)) return;
    
    // Check if member has spouse in same layer
    const spouse = findSpouseInLayer(member, members);
    
    if (spouse && !processed.has(spouse._id)) {
      // Add both spouses together
      arranged.push(member);
      arranged.push(spouse);
      processed.add(member._id);
      processed.add(spouse._id);
    } else if (!spouse) {
      // No spouse or spouse already processed
      arranged.push(member);
      processed.add(member._id);
    }
  });
  
  return arranged;
}

function findSpouseInLayer(member, layerMembers) {
  if (!member.relationships) return null;
  
  const spouseRel = member.relationships.find(r => r.type === 'spouse');
  if (!spouseRel) return null;
  
  const spouseId = spouseRel.relative._id || spouseRel.relative;
  return layerMembers.find(m => String(m._id) === String(spouseId));
}

/**
 * Phase 4: Assign vertical positions based on generation
 */
function assignVerticalPositions(positions, verticalSpacing, startY) {
  positions.forEach((pos, memberId) => {
    pos.y = startY + pos.generation * verticalSpacing;
  });
}

// Helper functions

function hasParent(member) {
  if (!member.relationships) return false;
  return member.relationships.some(r => r.type === 'parent');
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
 * Apply layout to existing graph structure
 */
export function applyLayoutToGraph(graph, options = {}) {
  const members = Array.from(graph.nodes.values());
  const positions = applySugiyamaLayout(members, graph.familyUnits, options);
  
  // Update node positions in graph
  positions.forEach((pos, memberId) => {
    const node = graph.nodes.get(memberId);
    if (node) {
      node.position = { x: pos.x, y: pos.y };
    }
  });
  
  return graph;
}
