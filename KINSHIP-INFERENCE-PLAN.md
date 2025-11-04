# Kinship Inference Engine — Technical & Functional Plan

Last updated: 2025-11-04

## 1) Purpose and outcomes

Enable the system to infer extended family relationships between any two members in a tree — beyond direct edges — and expose these in a reliable, explainable, and efficient way.

Outcomes:
- For any two members A and B, return an accurate kinship label (e.g., "second cousin once removed", "great-grandfather", "sister-in-law", "half-brother").
- Provide an explanation path and metadata (MRCA, steps up/down, affinal/step flags).
- Offer on-demand API queries and (optionally) a precomputed per-tree kinship index for fast lookups.

Non-goals (for now):
- Cultural/region-specific naming beyond the standard Anglo-American kinship system.
- Complex marriage customs (e.g., levirate/sororate, parallel/cross-cousin specifics) unless codified later.
- Marriage-point visualization logic (purely UI) — inference uses member relationships only.

## 2) Glossary
- Consanguine: blood relation (via parent/child chains).
- Affinal: by marriage (through spouse edge only). Suffix “-in-law”.
- Step: spouse-mediated parent/child/sibling with no shared biological parent.
- MRCA/NCA: (Nearest) Most Recent Common Ancestor of two members.
- Degree (cousins): min(k, l) - 1 where k,l are steps up from A,B to MRCA.
- Removal: |k - l| in cousinship.

## 3) Functional requirements (user stories)
- As a user, I can ask “What is A to B?” and get a human-readable label with details.
- As a user, I can view a brief explanation (e.g., “A’s grandfather is X; B descends from X via Y (2 up, 1 down) → first cousin once removed”).
- As an admin, I can toggle a feature flag to enable/disable precomputed kinship index.
- As an editor, changes to relationships eventually update the kinship index automatically via the recompute worker.

Acceptance criteria:
- Correctness on canonical scenarios (lineal, sibling, half-sibling, aunt/uncle, cousin + removal, in-law, step).
- Bounded runtime for on-demand queries on typical tree sizes (< O(N) BFS).
- Safe fallbacks (e.g., return “related (undetermined)” with details when classification is ambiguous).

## 4) Data model and normalization

Existing:
- Member.relationships: `{ type: 'parent'|'child'|'spouse'|custom, relative: ObjectId|Member, label?, authored? }`

Normalization for inference (server-only):
- parentsOf[id]: Set<MemberId>
- childrenOf[id]: Set<MemberId>
- spousesOf[id]: Set<MemberId>

Rules:
- parent/child entries produce symmetric parent/child maps.
- spouse produces symmetric spouse map.
- Ignore marriage-point nodes (UI only).
- Custom types are ignored by default unless mapped (see §9 Config hooks).

Optional schema (new collection): `KinshipIndex`:
- `{ _id, tree: ObjectId, version: Number, computedAt: Date, index: Map<MemberId, Array<{ to: MemberId, label: String, meta: {...} }>> }`
- Indexes: `{ tree: 1 }`, maybe `{ tree: 1, 'index.to': 1 }` (or shard on tree).

## 5) Public API (contracts)

- GET `/api/trees/:treeId/kinship?from=<id>&to=<id>&mode=consanguine|all`
  - Response 200:
    ```json
    {
      "label": "first cousin once removed",
      "class": "collateral", // lineal | collateral | affinal | step | none
      "meta": {
        "mrcaIds": ["<id>", "<id>"],
        "k": 2, "l": 3, "degree": 1, "removal": 1,
        "half": false, "affinal": false, "step": false
      },
      "explain": [
        { "via": "ancestor", "member": "<id>", "depth": 2 },
        { "via": "ancestor", "member": "<id>", "depth": 3 }
      ]
    }
    ```
  - 404 if either member not in tree.

- GET `/api/trees/:treeId/kinship/:memberId?maxDepth=6&mode=consanguine|all`
  - Returns inferred kinships from memberId to others within a bound.

- Admin (optional):
  - POST `/api/trees/:treeId/kinship/recompute` → enqueue index recomputation.
  - GET `/api/trees/:treeId/kinship/status` → job state.

RBAC:
- Require read access to tree; admin endpoints require admin/editor roles.

## 6) Core algorithms

Build adjacency:
- Iterate all `member.relationships`; fill parentsOf/childrenOf/spousesOf using symmetric rules.

Reachability:
- BFS up (ancestors) / BFS down (descendants) with depth limits (default 10 levels, configurable).

MRCA / classification:
- Ancestors maps: `ancA = bfsUp(A)`, `ancB = bfsUp(B)`; MRCA candidates = intersection.
- Choose best MRCA minimizing `k + l` (k=ancA[mrca], l=ancB[mrca]).
- Classification rules:
  - Self: `A === B` → self.
  - Lineal: if B in descendantsOf(A) or A in ancestorsOf(B) → child/grandchild/great-… or parent/grandparent/great-…
  - Sibling vs half-sibling: count shared parents (2=full, 1=half, >2 allowed but label as sibling).
  - Aunt/Uncle/Niece/Nephew: if `min(k,l)=1` and `max(k,l) ≥ 2`; great- count = `max(k,l)-2`.
  - Cousins: if `min(k,l) ≥ 2`; degree = `min(k,l)-1`; removal = `|k-l|`.
  - Fallback: `related (undetermined collateral)` with MRCA metadata.

Affinal (in-law) and step overlay:
- If no consanguine path exists but a path appears when including spouse edges, classify as in-law of the consanguine role (e.g., spouse’s brother → brother-in-law).
- Step relations: when a role (parent/child/sibling) is only reachable via a spouse edge and no shared parent exists.

## 7) Contracts (internal) and pseudo-APIs

Module: `server/utils/kinship.js`
- `buildAdjacency(members): { parentsOf, childrenOf, spousesOf }`
- `bfsUp(id, parentsOf, limit)`; `bfsDown(id, childrenOf, limit)`
- `findMRCA(A, B, parentsOf) -> { id, k, l } | null`
- `classifyConsanguine(A, B, graphs) -> { label, class, meta }`
- `overlayAffinalStep(A, B, graphs, consanguineResult) -> { label, class, meta }`
- `kinshipBetween(A, B, members, options) -> { label, class, meta, explain }`
- `mapAllKinships(memberId, members, options) -> Array<{ to, label, class, meta }>`

## 8) Performance and scaling

Modes:
- On-demand: compute per query (BFS up/down are O(E) for sparse trees, acceptable for hundreds/thousands of nodes).
- Cached: precompute `KinshipIndex` via worker.

Caching plan:
- Trigger recompute on mutations to relationships (same place we enqueue generation recompute).
- Version the index to invalidate stale reads.
- Depth limit: default 8–10. Expose per-tree config in the future.
- Add `maxTimeMS` guards and depth ceilings to avoid runaway graphs.

Indexes:
- Mongo collection: `{ tree: 1 }` for fast retrieval; keep payload compressed if needed.

## 9) Config and special cases

- Relationship-type mapping: allow config to treat `guardian`/`adoptive-parent` as `parent` for inference.
- Multi-parent scenarios: allow ≥2 parents; sibling classification favors full vs half based on shared-parent count.
- Polygamy/multiple marriages: supported—MRCA logic remains valid.
- Cycles: detect and cap via visited sets in BFS.
- Missing data: return best-effort "related (undetermined)" with MRCA when available.

## 10) Observability and debugging

- Structured logs around:
  - adjacency sizing (#members, #edges)
  - MRCA search time and results
  - classification decisions (which rule fired)
  - affinal/step toggles
- Feature flag: `KINSHIP_INDEX_ENABLED`.
- Admin status endpoint to expose index version, computedAt, counts.

## 11) Testing strategy

Unit tests (server):
- Fixtures for micro-trees covering: lineal (up to great-great), siblings/half, aunt/uncle (with great-), cousins (1st–3rd, removals), in-law, step.
- Property tests (optional): symmetry checks where applicable; consistency of degree/removal.

Integration tests:
- Build adjacency from DB-like documents and assert classifications.

E2E (optional):
- Add a client panel to query A↔B and show label + explanation.

Acceptance tests:
- Person 10 vs Person 15 in your sample: classification should match the computed MRCA outcome.

## 12) Security and RBAC

- Public kinship endpoints require read access to the tree (`viewer`+). 
- Recompute endpoints require `editor` or `admin`.
- Response must filter to members within the same tree.

## 13) Rollout plan

Phase 1 — On-demand API
- Implement `kinshipBetween` and GET `/kinship?from&to`.
- No cache; behind feature flag.

Phase 2 — UI explorer (optional)
- Small client widget to query pairwise kinship.

Phase 3 — Cached index
- Worker job to precompute `KinshipIndex` for a tree.
- Admin UI to monitor jobs.

Phase 4 — Incremental updates
- Targeted recompute for affected neighborhoods on relationship changes.

## 14) Milestones & estimates

- M1: Adjacency + BFS + MRCA + core classifier — 1–2 days
- M2: API endpoint + tests — 1 day
- M3: UI explorer — 0.5–1 day
- M4: Cached index + worker integration — 1–2 days
- M5: Incremental recompute + metrics — 1–2 days

## 15) Risks and mitigations

- Complex/ambiguous family structures → return best-effort label with MRCA metadata; expose explain path.
- Performance on very large trees → depth limits, on-demand first, cache later, metrics for hotspots.
- Data quality (missing/duplicate/conflicting edges) → sanitize adjacency, prefer authored edges when conflicts appear.

## 16) Open questions

- Should custom relationships (e.g., "guardian") count as parent for inference? (Proposed: configurable mapping.)
- How deep should default inference go (8 vs 10)?
- Do we need localization for labels (e.g., “bhai”) in addition to standard labels?

## 17) Example: Person 10 ↔ Person 15 (from screenshot)

- The engine collects ancestors for both and finds MRCA(s).
- If both are descendants of the same ancestor at k,l steps up: compute cousin degree/removal.
- If one descends from the other: lineal (grandchild / great-…-grandchild).
- If only connected via marriage: append “-in-law” or mark as step.

## 18) Minimal internal contract (JS)

```js
// server/utils/kinship.js
module.exports = {
  buildAdjacency, bfsUp, bfsDown, findMRCA,
  classifyConsanguine, overlayAffinalStep,
  kinshipBetween, mapAllKinships,
};
```

## 19) Next actions
- Implement `server/utils/kinship.js` with the functions above.
- Add GET `/api/trees/:id/kinship` and wire RBAC.
- Add unit tests with canonical fixtures.
- Optional: add a tiny Kinship tab in the client to query a pair and render label + path.
