/**
 * Relationship validation utilities
 * Prevents invalid relationships and ensures data integrity
 */

/**
 * Validates adding a new relationship
 * @param {Object} fromMember - Source member object
 * @param {String} toMemberId - Target member ID
 * @param {String} type - Relationship type
 * @param {Array} allMembers - All members in tree
 * @returns {Object} - { valid: Boolean, errors: Array, warnings: Array }
 */
export function validateRelationship(fromMember, toMemberId, type, allMembers) {
  const errors = [];
  const warnings = [];

  // Rule 1: No self-relationships
  if (String(fromMember._id) === String(toMemberId)) {
    errors.push('Cannot create relationship with self');
  }

  // Rule 2: No duplicate relationships
  const existing = fromMember.relationships?.find(
    r => String(r.relative._id || r.relative) === String(toMemberId) && r.type === type
  );
  if (existing) {
    errors.push(`${type} relationship already exists`);
  }

  // Rule 3: Maximum 2 parents
  if (type === 'parent') {
    const parentCount = fromMember.relationships?.filter(r => r.type === 'parent').length || 0;
    if (parentCount >= 2) {
      errors.push('Member already has 2 parents (maximum limit reached)');
    }
  }

  // Rule 4: Prevent cyclical parent-child relationships
  if (type === 'parent' || type === 'child') {
    if (wouldCreateCycle(fromMember._id, toMemberId, type, allMembers)) {
      errors.push('Would create circular parent-child relationship');
    }
  }

  // Rule 5: Generation consistency
  if (type === 'parent' || type === 'child' || type === 'sibling') {
    const genWarnings = validateGenerationalConsistency(fromMember, toMemberId, type, allMembers);
    warnings.push(...genWarnings);
  }

  // Rule 6: Multiple spouses warning
  if (type === 'spouse') {
    const spouseCount = fromMember.relationships?.filter(r => r.type === 'spouse').length || 0;
    if (spouseCount >= 1) {
      warnings.push('Member already has a spouse (adding additional spouse)');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Detects if adding a relationship would create a cycle
 */
function wouldCreateCycle(fromId, toId, relType, allMembers) {
  const visited = new Set();
  return detectCycle(toId, fromId, relType, allMembers, visited);
}

function detectCycle(currentId, targetId, relType, allMembers, visited) {
  if (visited.has(currentId)) return false;
  if (String(currentId) === String(targetId)) return true;
  
  visited.add(currentId);
  
  const current = allMembers.find(m => String(m._id) === String(currentId));
  if (!current || !current.relationships) return false;
  
  // Follow the relationship chain in the appropriate direction
  const nextType = relType === 'parent' ? 'child' : 'parent';
  const nextRels = current.relationships.filter(r => r.type === nextType);
  
  return nextRels.some(r => {
    const nextId = r.relative._id || r.relative;
    return detectCycle(nextId, targetId, relType, allMembers, visited);
  });
}

/**
 * Validates generational consistency
 */
function validateGenerationalConsistency(fromMember, toMemberId, type, allMembers) {
  const warnings = [];
  
  const toMember = allMembers.find(m => String(m._id) === String(toMemberId));
  if (!toMember) return warnings;
  
  const fromGen = fromMember.generation || fromMember._computedGeneration || 0;
  const toGen = toMember.generation || toMember._computedGeneration || 0;
  
  if (type === 'parent') {
    // Parent should be in previous generation
    if (toGen >= fromGen) {
      warnings.push(`Parent (gen ${toGen}) should be in generation before child (gen ${fromGen})`);
    }
  } else if (type === 'child') {
    // Child should be in next generation
    if (toGen <= fromGen) {
      warnings.push(`Child (gen ${toGen}) should be in generation after parent (gen ${fromGen})`);
    }
  } else if (type === 'sibling' || type === 'spouse') {
    // Should be same generation
    if (toGen !== fromGen) {
      warnings.push(`${type} should be in same generation (currently gen ${fromGen} and ${toGen})`);
    }
  }
  
  return warnings;
}

/**
 * Validates that member can be deleted
 */
export function validateMemberDeletion(memberId, allMembers) {
  const warnings = [];
  
  const member = allMembers.find(m => String(m._id) === String(memberId));
  if (!member) return { valid: true, warnings: [] };
  
  // Check for dependent relationships
  const childCount = member.relationships?.filter(r => r.type === 'child').length || 0;
  const spouseCount = member.relationships?.filter(r => r.type === 'spouse').length || 0;
  
  if (childCount > 0) {
    warnings.push(`Member has ${childCount} child(ren) - their parent links will be removed`);
  }
  
  if (spouseCount > 0) {
    warnings.push(`Member has ${spouseCount} spouse(s) - marriage links will be removed`);
  }
  
  // Check if other members reference this one
  const referencingMembers = allMembers.filter(m => 
    m.relationships?.some(r => String(r.relative._id || r.relative) === String(memberId))
  );
  
  if (referencingMembers.length > 0) {
    warnings.push(`${referencingMembers.length} other member(s) have relationships with this member`);
  }
  
  return {
    valid: true, // Deletion is allowed, but show warnings
    warnings,
  };
}

/**
 * Validates edge path doesn't create excessive crossings
 */
export function validateEdgeCrossings(sourceNode, targetNode, existingEdges, nodes) {
  const crossings = countEdgeCrossings(sourceNode, targetNode, existingEdges, nodes);
  
  return {
    valid: crossings < 5, // Allow up to 4 crossings
    warnings: crossings > 0 ? [`New edge will cross ${crossings} existing edge(s)`] : [],
    crossingCount: crossings,
  };
}

function countEdgeCrossings(sourceNode, targetNode, existingEdges, nodes) {
  let count = 0;
  
  const p1 = sourceNode.position;
  const p2 = targetNode.position;
  
  existingEdges.forEach(edge => {
    const edgeSource = nodes.find(n => n.id === edge.source);
    const edgeTarget = nodes.find(n => n.id === edge.target);
    
    if (!edgeSource || !edgeTarget) return;
    
    const p3 = edgeSource.position;
    const p4 = edgeTarget.position;
    
    if (doLineSegmentsIntersect(p1, p2, p3, p4)) {
      count++;
    }
  });
  
  return count;
}

/**
 * Check if two line segments intersect
 */
function doLineSegmentsIntersect(p1, p2, p3, p4) {
  const det = (p2.x - p1.x) * (p4.y - p3.y) - (p4.x - p3.x) * (p2.y - p1.y);
  
  if (det === 0) return false; // Parallel lines
  
  const lambda = ((p4.y - p3.y) * (p4.x - p1.x) + (p3.x - p4.x) * (p4.y - p1.y)) / det;
  const gamma = ((p1.y - p2.y) * (p4.x - p1.x) + (p2.x - p1.x) * (p4.y - p1.y)) / det;
  
  return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
}

/**
 * Deduplicates edges to prevent double rendering
 */
export function deduplicateEdges(edges) {
  const seen = new Set();
  return edges.filter(edge => {
    // Create normalized key
    const ids = [edge.source, edge.target].sort();
    const key = `${ids[0]}|${ids[1]}|${edge.data?.type || ''}`;
    
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Auto-fixes common relationship issues
 */
export function autoFixRelationships(members) {
  const fixes = [];
  
  members.forEach(member => {
    if (!member.relationships) return;
    
    // Fix: Ensure reciprocal relationships
    member.relationships.forEach(rel => {
      const relativeId = rel.relative._id || rel.relative;
      const relative = members.find(m => String(m._id) === String(relativeId));
      
      if (!relative) {
        fixes.push({
          type: 'missing_relative',
          memberId: member._id,
          relativeId,
        });
        return;
      }
      
      // Check for reciprocal
      const reciprocalType = getReciprocalType(rel.type);
      if (reciprocalType) {
        const hasReciprocal = relative.relationships?.some(r => 
          String(r.relative._id || r.relative) === String(member._id) && 
          r.type === reciprocalType
        );
        
        if (!hasReciprocal) {
          fixes.push({
            type: 'missing_reciprocal',
            fromId: member._id,
            toId: relativeId,
            originalType: rel.type,
            neededType: reciprocalType,
          });
        }
      }
    });
  });
  
  return fixes;
}

function getReciprocalType(type) {
  const reciprocals = {
    parent: 'child',
    child: 'parent',
    spouse: 'spouse',
    sibling: 'sibling',
  };
  return reciprocals[type];
}
