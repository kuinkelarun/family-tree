# Ancestry/Descendant Validation Design

This document describes a robust, configurable validation system that decides, before creating an edge, whether a proposed relationship between a source member (from) and a target member (to) is valid given the current family graph.

## Goals

- Preserve family-hierarchy integrity with deterministic, explainable rules.
- Use computed ancestry/descendant facts to decide if an edge is allowed, warned, or blocked.
- Be configurable per-deployment (and eventually per-tree) with rule severities: error | warn | off.
- Provide descriptive messages and, when possible, an explanation path.
- Keep performance acceptable for medium-sized trees (hundreds to low-thousands of nodes) and be safe-by-default.

## Validation Contract

Input
- treeId: string
- fromId: string (source node)
- toId: string (target node)
- type: 'parent' | 'child' | 'spouse' | 'sibling' | 'custom'
- options (optional):
  - mode: 'create' | 'update'
  - previousType?: string (when updating)
  - depthLimit?: number (BFS limit, default 10)
  - severityOverrides?: Record<ruleId, 'error'|'warn'|'off'> (optional, future-ready)

Output
- ok: boolean
- errors: string[]
- warnings: string[]
- ruleIds: string[] (all rules triggered; type is reflected by which list the message landed in)
- (optional) facts: computed booleans and distances (debuggable; returned only when requested)
- (optional) explain: minimal path elements (list of member IDs and hops to show "why")

Success criteria
- If any rule with severity=error triggers, ok=false and errors contain descriptive reasons.
- If only warn-level rules trigger, ok=true with warnings populated.
- If all triggered rules are off, ok=true and no messages are returned.

## Pipeline Overview

1) Graph Build (loadTreeGraph)
- Query members for a tree with fields: _id, name, generation, relationships.
- Build adjacency maps:
  - parentsOf: Map<id, Set<id>>
  - childrenOf: Map<id, Set<id>>
  - spousesOf: Map<id, Set<id>> (symmetric)
  - siblingsOf: Map<id, Set<id>> (merge explicit siblings with those derived from shared parents)
- Unify parent sets inside explicit sibling components, so siblings share known parents.

2) Facts (ancestry/descendant)
- Compute with bounded BFS (default depthLimit=10):
  - anc = ancestorsOf(from), desc = descendantsOf(from)
  - ancOfTo = ancestorsOf(to), descOfTo = descendantsOf(to)
- Derive fast checks from these maps:
  - isAncestor(from, to) ⇔ ancOfTo.has(from)
  - isDescendant(from, to) ⇔ descOfTo.has(from)
  - isSibling ⇔ siblingsOf[from].has(to)
  - areSpouses ⇔ spousesOf[from].has(to)
  - sharedSpouses = intersection(spousesOf[from], spousesOf[to]) (co-spouses)
  - isAffinalAncestor(from, to) ⇔ from is spouse-of an ancestor of to
  - isCoSpouseOfAncestor(from, to) ⇔ from shares a spouse with an ancestor of to

3) Rule Engine (relationshipRules)
- A rules registry (implicit today, refactor-ready) runs against the facts for the proposed type.
- Each rule returns a message keyed by ruleId.
- A severity map determines whether to emit as error, warning, or ignore.

4) Response Assembly
- Partition results into errors / warnings by severity.
- Include ruleIds and optional explain elements.

## Rule Set (current & extended)

Hard constraints (error by default)
- no-self: Cannot create relationship with self.
- same-tree: Members must exist in same tree.
- no-duplicate: Exact same edge exists.
- no-duplicate-reciprocal: Reciprocal exists (e.g., spouse, child/parent inverse).
- max-two-parents: A child can have at most two parents.
- no-cycle: Parent/child would create a cycle.
- no-parent-child-between-siblings: Siblings cannot be parent/child.
- no-parent-child-between-spouses: Spouses cannot be parent/child.
- no-grandparent-as-parent: Cannot set a grandparent (or higher) as direct parent.
- no-grandchild-as-child: Cannot set a grandchild (or lower) as direct child.
- no-incest-ancestor-descendant: Spouse between ancestor and descendant.
- no-incest-siblings: Spouse between siblings.
- no-siblings-ancestor-descendant: Sibling between ancestor and descendant.
- no-siblings-between-spouses: Sibling between spouses.
- no-spouse-between-co-spouses: Spouse between two people who already share a spouse.
- no-direct-between-inlaws: Block direct parent/child/sibling/spouse between parent-in-law and child-in-law.
- no-direct-affinal-ancestor-descendant: Block parent/child/spouse between descendant and spouse-of an ancestor.
- no-direct-co-spouse-of-ancestor: Block parent/child/spouse between descendant and co-spouse of an ancestor.
- generation-order (topology-based): If known topology contradicts (e.g., proposed parent is already a descendant), block with a specific message.

Soft constraints (warning by default)
- warn-multiple-spouses: Source already has one or more spouses; adding another.

Configurable customizations (future-ready)
- parent-like labels (e.g., guardian, adoptive-parent) treated as parent links in kinship calculation and optionally in validation; configured via options or server config.
- culture toggles: e.g., policies on polygamy visibility (warn vs error).

## Configurability

- Default severity map lives in code, but may be overridden by:
  - Environment variable (path to JSON); or
  - Per-tree config stored with the tree document; or
  - Per-request overrides (for admin tools/testing).

Example JSON:
```
{
  "no-self": "error",
  "no-duplicate": "error",
  "no-spouse-between-co-spouses": "error",
  "warn-multiple-spouses": "warn",
  "no-direct-affinal-ancestor-descendant": "error",
  "no-direct-co-spouse-of-ancestor": "error",
  "generation-order": "error"
}
```

API hooks
- validate endpoint accepts an optional `severityOverrides` map to test configurations safely without server restarts.

## Performance

- BFS depth limit (default 10) prevents pathological traversals.
- Use lean reads and minimal fields.
- Consider caching adjacency maps per tree for the duration of a request burst; invalidate on write.
- Future: Precompute ancestor/descendant closures (transitive closure) for large trees, or use memoized query plans.

## Edge Cases and Safety

- Isolated nodes: Do not block based solely on generation numbers; only block when topology (anc/desc) is known.
- Dangling or cross-tree edges: ignored/skipped during graph build; propose a data cleanup job.
- Partial data: Sibling components unify parent sets to improve inference without over-assuming.
- Polygamy and ex-spouses: Covered by co-spouse rule and soft warnings.
- Step and in-law overlays: Handled in kinship for UI labels; validation rules block logically impossible direct links.

## Test Strategy

- DB-free smoke tests that construct minimal in-memory graphs to hit specific rule paths.
- Examples included:
  - Sibling cannot marry; spouse between co-spouses blocked.
  - In-law direct parent/child/spouse/sibling blocked.
  - Grandparent-as-parent blocked.
  - Spouse/parent/child between spouse-of-ancestor (and co-spouse-of-ancestor) and descendant blocked.
- Optional: route-level tests for /api/relationships/validate ensuring messages and ruleIds are returned correctly.

## Minimal Refactor Path (if we generalize)

- Introduce a tiny registry around the existing checks:
  - `report(ruleId, defaultSeverity, message)` pushes into an internal list.
  - At the end, partition by severity overrides.
- Add `severityOverrides` to `validateProposedRelationship` options (backward-compatible, default empty).
- Optionally return `facts` when an `includeFacts` flag is provided to aid debugging and admin tools.

## Endpoint Contract (validate-only)

POST /api/relationships/validate
- body: { treeId, fromId, toId, type, options? }
- returns: { ok, errors, warnings, ruleIds }
- Behavior: identical to the validation performed before add/update in the controller.

---

This design matches the current implementation and adds clear pathways for configurability, testability, and future performance tuning, while keeping the rule set explainable and culture-aware.
