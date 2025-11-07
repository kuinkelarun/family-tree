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
 - no-spouse-between-co-spouses: Cannot create spouse relationship between two people who already share a spouse (co-spouses/ex-spouses); suggests the shared spouse in message.
 - no-direct-affinal-ancestor-descendant: Cannot create parent/child/spouse relationships between a descendant and someone who is the spouse of an ancestor (e.g., spouse of a grandparent cannot be parent/child/spouse of the grandchild).
 - no-direct-co-spouse-of-ancestor: Cannot create parent/child/spouse relationships between a descendant and someone who is a co-spouse of an ancestor (e.g., co-spouse of a grandparent cannot be parent/child/spouse of the grandchild).
 - warn-direct-step-parent-link: Direct parent/child link between a step-parent (spouse or co-spouse of the actual parent) and the step-child is allowed but warned; counts toward the two-parent limit.

## When validations run

- Create: Full rule set applies to protect graph integrity.
- Update (label-only): If the relationship type is unchanged, validation is bypassed so labels always update.
- Update (type change): Structural rules still apply (e.g., cycle prevention and two-parent limit). Duplicate-edge checks are skipped in update mode.

## Rule precedence and de-duplication

- Specific topology rules (e.g., no-grandparent-as-parent, no-grandchild-as-child, no-cycle, generation-order) take precedence in messaging. Affinal ancestor messages are suppressed when a more specific topology error already explains the issue.
- We deduplicate repeated messages and rule IDs before returning to the client.
- The UI also collapses repetitive messages when creating multiple child links from a marriage point.

## Examples and notes
## Severity overrides

You can store per-tree overrides in `validationConfig.severities` (Mongo Map: ruleId -> 'error'|'warn'|'off').

Example (conceptual) payload to set severities via a Mongo update:
```
validationConfig.severities = {
  "warn-multiple-spouses": "off",
  "no-direct-affinal-ancestor-descendant": "warn",
  "no-spouse-between-co-spouses": "error"
}
```

Effects:
- 'off': rule is suppressed (no error/warning output; ruleId omitted).
- 'warn': error-class rule downgraded to warning.
- 'error': warning-class rule promoted to error.

Label-only updates (`previousType === type` with mode=update) skip validation entirely.

## Message collapsing

- Server: Deduplicates identical messages and suppresses affinal ancestor messages if a specific topology rule already triggered.
- Server: Groups messages into categories (topology, incest, adjacency, marriage, inlaw, capacity, duplicate) and collapses multiple messages per category into: `first message (+N more <category> issues)`.
- Client (marriage point child creation): Shows only the first condensed message per parent with a `(+N more)` summary.


- Spouse of direct parent ↔ step-parent carve-out: Direct parent/child link is allowed with a warning (warn-direct-step-parent-link). It still counts toward the two-parent limit and may be blocked if it would exceed two parents.
- Co-spouses (share a spouse): Direct spouse links between co-spouses are blocked; kinship labels them as co-spouse/ex-spouse.
- In-laws: Direct parent/child/sibling/spouse edges between parent-in-law and child-in-law are disallowed.
- Generation order: We do not block based only on generation numbers for isolated nodes; we block only when a known ancestry topology contradicts the proposed edge.
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