// Kinship overlay smoke tests for co-spouses and step relations (no DB required)
import { kinshipBetween } from '../utils/kinship.js';
import { localizeKinship } from '../utils/kinshipLocalization.js';

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`PASS: ${msg}`);
}

function run() {
  // Co-spouses: A and B share spouse C
  const members1 = [
    { _id: 'A', name: 'A', relationships: [ { type: 'spouse', relative: 'C' } ] },
    { _id: 'B', name: 'B', relationships: [ { type: 'spouse', relative: 'C' } ] },
    { _id: 'C', name: 'C', relationships: [ { type: 'spouse', relative: 'A' }, { type: 'spouse', relative: 'B' } ] },
  ];
  const rc1 = kinshipBetween('A', 'B', members1, { depthLimit: 6 });
  console.log('Co-spouse EN:', rc1.label, '| NP:', localizeKinship(rc1, 'np'));
  assert(rc1.label.toLowerCase().includes('co-spouse'), 'classify co-spouses');

  // Step-parent and step-child: S is spouse of P; P is parent of C
  const members2 = [
    { _id: 'S', name: 'Step', relationships: [ { type: 'spouse', relative: 'P' } ] },
    { _id: 'P', name: 'Parent', relationships: [ { type: 'spouse', relative: 'S' }, { type: 'child', relative: 'C' } ] },
    { _id: 'C', name: 'Child', relationships: [ { type: 'parent', relative: 'P' } ] },
  ];
  const rc2 = kinshipBetween('S', 'C', members2, { depthLimit: 6 });
  console.log('Step-parent EN:', rc2.label, '| NP:', localizeKinship(rc2, 'np'));
  assert(rc2.label === 'step-parent' && rc2.meta?.relationCode?.type === 'step' && rc2.meta?.relationCode?.role === 'parent', 'classify step-parent with relationCode role=parent');

  const rc3 = kinshipBetween('C', 'S', members2, { depthLimit: 6 });
  console.log('Step-child EN:', rc3.label, '| NP:', localizeKinship(rc3, 'np'));
  assert(rc3.label === 'step-child' && rc3.meta?.relationCode?.type === 'step' && rc3.meta?.relationCode?.role === 'child', 'classify step-child with relationCode role=child');

  // Step-sibling: A has parent P1; B has parent P2; P1 and P2 are spouses; A and B share no parents
  const members3 = [
    { _id: 'A', name: 'A', relationships: [ { type: 'parent', relative: 'P1' } ] },
    { _id: 'B', name: 'B', relationships: [ { type: 'parent', relative: 'P2' } ] },
    { _id: 'P1', name: 'P1', relationships: [ { type: 'spouse', relative: 'P2' }, { type: 'child', relative: 'A' } ] },
    { _id: 'P2', name: 'P2', relationships: [ { type: 'spouse', relative: 'P1' }, { type: 'child', relative: 'B' } ] },
  ];
  const rc4 = kinshipBetween('A', 'B', members3, { depthLimit: 6 });
  console.log('Step-sibling EN:', rc4.label, '| NP:', localizeKinship(rc4, 'np'));
  assert(rc4.label === 'step-sibling' && rc4.meta?.relationCode?.type === 'step' && rc4.meta?.relationCode?.role === 'sibling', 'classify step-sibling with relationCode role=sibling');

  // Aunt/Uncle vs Niece/Nephew (MRCA path): 30 is sibling of 4; 13 is child of 4
  const members4 = [
    { _id: 'GP1', relationships: [] },
    { _id: 'GP2', relationships: [] },
    { _id: '4', relationships: [ { type: 'parent', relative: 'GP1' }, { type: 'parent', relative: 'GP2' }, { type: 'child', relative: '13' } ] },
    { _id: '30', relationships: [ { type: 'parent', relative: 'GP1' }, { type: 'parent', relative: 'GP2' } ] },
    { _id: '13', relationships: [ { type: 'parent', relative: '4' } ] },
  ];
  const rc5 = kinshipBetween('13', '30', members4, { depthLimit: 6 });
  console.log('13 vs 30 EN:', rc5.label, '| NP:', localizeKinship(rc5, 'np'));
  assert(rc5.label === 'niece/nephew' && rc5.meta?.relationCode?.type === 'niece_nephew', 'classify 13 as niece/nephew of 30');
  const rc6 = kinshipBetween('30', '13', members4, { depthLimit: 6 });
  console.log('30 vs 13 EN:', rc6.label, '| NP:', localizeKinship(rc6, 'np'));
  assert(rc6.label === 'aunt/uncle' && rc6.meta?.relationCode?.type === 'aunt_uncle', 'classify 30 as aunt/uncle of 13');

  console.log('\nAll kinship overlay smoke tests PASSED');
}

try {
  run();
} catch (e) {
  console.error(e.message || e);
  process.exitCode = 1;
}
