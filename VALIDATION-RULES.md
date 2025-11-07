# Relationship Validation Rules

This project includes a configurable server-side validation layer that prevents logically invalid or redundant relationships before they are saved.

## How it works

- The validator loads a lightweight graph of the current tree (members and their relationships) and evaluates a set of rules.
- It runs automatically on relationship create/update requests on the API, and it’s also exposed via a dedicated endpoint for client-side prechecks.

## API

- Validate only (no mutation):
  - POST `/api/relationships/validate` with `{ fromMemberId, toMemberId, type }`
  - Response: `{ ok: boolean, errors: string[], warnings: string[], ruleIds: string[] }`

- Create:
  - POST `/api/relationships` with `{ fromMemberId, toMemberId, type, label?, authored? }`
  - Runs the same validation first; returns 400 with details if invalid.

- Update:
  - PUT `/api/relationships` with `{ fromMemberId, toMemberId, type, newType? }`
  - Runs validation against the new type.

## Rules enforced

Errors (block the action):
- no-self: Cannot create relationship with self.
- no-duplicate: Exact relationship already exists on the same direction.
- no-duplicate-reciprocal: Relationship already exists via the reciprocal entry (e.g., spouse or parent/child inverse).
- max-two-parents: A person cannot have more than two parents.
- no-cycle: Prevents ancestor/descendant cycles for parent/child.
- no-parent-child-between-siblings: Siblings cannot be linked as parent/child.
- no-parent-child-between-spouses: Spouses cannot be linked as parent/child.
- no-grandparent-as-parent: Do not connect an ancestor (>= grandparent) as a direct parent when the chain already exists.
- no-grandchild-as-child: Do not connect a descendant (>= grandchild) as a direct child when the chain already exists.
- no-incest-ancestor-descendant: Cannot create spouse relationship between ancestor and descendant.
- no-incest-siblings: Cannot create spouse relationship between siblings.
- no-siblings-ancestor-descendant: Cannot create sibling relationship between ancestor and descendant.
- no-siblings-between-spouses: Cannot create sibling relationship between spouses.
- no-direct-between-inlaws: Cannot create parent/child/sibling/spouse relationship directly between a parent-in-law and a child-in-law (e.g., parent of spouse vs. spouse of child). Error messages include directional context.

Warnings (allowed, but surfaced to the client):
- warn-multiple-spouses: Adding an additional spouse.

## Client integration

- The client calls `/api/relationships/validate` before creating an edge and shows messages to the user.
- Marriage-point auto-child creation validates each parent->child link and skips invalid ones with a toast summary.

## Extending rules

- Rules live in `server/utils/relationshipRules.js`. Add checks in `validateProposedRelationship` or compute additional graph indices in `loadTreeGraph`.
- Keep rules deterministic and fast. Prefer graph queries (ancestors/descendants/siblings/spouses) over full DFS where possible.

## Notes

- Reciprocal edges are maintained by the API; validation also blocks duplicates even if a reciprocal exists only on one side.
- Generation consistency is currently a UI warning; we may elevate certain cases to server warnings in a future iteration.