import assert from 'assert';
import { validateProposedRelationship } from '../utils/relationshipRules.js';

function makeGraph(parentsMap = {}) {
  const ids = ['A','B','C','X'];
  const index = new Map(ids.map(id => [id, { _id: id, name: id }]));
  const parentsOf = new Map(ids.map(id => [id, new Set(parentsMap[id] || [])]));
  const childrenOf = new Map(ids.map(id => [id, new Set()]));
  const spousesOf = new Map(ids.map(id => [id, new Set()]));
  const siblingsOf = new Map(ids.map(id => [id, new Set()]));

  // Build childrenOf from parentsOf
  for (const [child, pset] of parentsOf.entries()) {
    for (const p of pset) {
      childrenOf.get(p)?.add(child);
    }
  }

  // helper to make A and B spouses
  spousesOf.get('A').add('B');
  spousesOf.get('B').add('A');

  return { index, parentsOf, childrenOf, spousesOf, siblingsOf };
}

// Test 1: C has one parent (A). Adding B (spouse of A) as parent should be allowed silently
{
  const graph = makeGraph({ C: ['A'] });
  const res = validateProposedRelationship(graph, 'C', 'B', 'parent', {});
  assert.strictEqual(res.ok, true, 'Expected adding spouse-as-parent to be allowed when child has <=1 parent');
  assert.ok(!res.ruleIds.includes('warn-direct-step-parent-link'), 'Should not include step-parent warning');
}

// Test 2: C already has two parents (A and X). Adding B should trigger capacity handling (error or warning)
{
  const graph = makeGraph({ C: ['A','X'] });
  const res = validateProposedRelationship(graph, 'C', 'B', 'parent', {});
  // Expect either explicit max-two-parents error or the step-parent warning to appear
  assert.strictEqual(res.ok, false, 'Expected operation to be invalid when adding more than two parents');
  const hasCapacityIssue = res.ruleIds.includes('max-two-parents') || res.ruleIds.includes('warn-direct-step-parent-link');
  assert.ok(hasCapacityIssue, 'Expected capacity-related rule id to be present');
}

console.log('relationshipRules.stepParent tests passed');
