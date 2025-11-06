// Quick smoke test for kinship inference
// Scenario:
// 10 -> parent 8
// 8  -> sibling 6
// 6  -> parent 1
// Expect: 1 is grandparent of 10

import { kinshipBetween } from '../utils/kinship.js';

const members = [
  { _id: '1', relationships: [] },
  { _id: '6', relationships: [ { type: 'parent', relative: '1' } ] },
  { _id: '8', relationships: [ { type: 'sibling', relative: '6' } ] },
  { _id: '10', relationships: [ { type: 'parent', relative: '8' } ] },
];

const res = kinshipBetween('10', '1', members, { depthLimit: 6 });
console.log('Kinship(10,1):', res);

const res2 = kinshipBetween('1', '10', members, { depthLimit: 6 });
console.log('Kinship(1,10):', res2);
