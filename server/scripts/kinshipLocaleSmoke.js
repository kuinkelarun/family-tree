// Smoke test for localization without DB
import { kinshipBetween } from '../utils/kinship.js';
import { localizeKinship } from '../utils/kinshipLocalization.js';

const members = [
  { _id: '1', relationships: [] },
  { _id: '6', relationships: [ { type: 'parent', relative: '1' } ] },
  { _id: '8', relationships: [ { type: 'sibling', relative: '6' } ] },
  { _id: '10', relationships: [ { type: 'parent', relative: '8' } ] },
];

const res = kinshipBetween('1', '10', members, { depthLimit: 6 });
console.log('EN:', res.label, '| NP:', localizeKinship(res, 'np'));

const res2 = kinshipBetween('10', '1', members, { depthLimit: 6 });
console.log('EN:', res2.label, '| NP:', localizeKinship(res2, 'np'));

const cousins = [
  { _id: 'A', relationships: [ { type: 'parent', relative: 'X' } ] },
  { _id: 'B', relationships: [ { type: 'parent', relative: 'Y' } ] },
  { _id: 'X', relationships: [ { type: 'sibling', relative: 'Y' }, { type: 'parent', relative: 'G' } ] },
  { _id: 'Y', relationships: [ { type: 'sibling', relative: 'X' }, { type: 'parent', relative: 'G' } ] },
  { _id: 'G', relationships: [] }
];
const rc = kinshipBetween('A', 'B', cousins, { depthLimit: 6 });
console.log('EN:', rc.label, '| NP:', localizeKinship(rc, 'np'));
