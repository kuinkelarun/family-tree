# Validation Rule Metadata & Admin Configuration

This document explains the new server-provided validation rule metadata endpoint and how the Admin UI uses it for per-tree severity overrides.

## Overview
Relationship validation now exposes authoritative rule definitions (ID, description, default severity) from the server so the client no longer relies on a hardcoded list. Admins (or authorized editors) can tune rule severities per tree: `error` (blocks operation), `warn` (allows but surfaces warning), or `off` (suppresses rule).

## Endpoint Summary

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/admin/validation/rules` | GET | Retrieve list of all rule metadata (id, description, defaultSeverity) | Admin (current gating) |
| `/api/admin/trees/:treeId/severities` | GET | Fetch current per-tree severity overrides | Admin + owner/editor check |
| `/api/admin/trees/:treeId/severities` | PATCH | Upsert severity overrides `{ updates: { ruleId: severity } }` | Admin + owner/editor check |
| `/api/admin/trees/:treeId/severities/:ruleId` | DELETE | Remove a custom override (reverts to default) | Admin + owner/editor check |

> Note: Access is admin-gated at the router; controllers further enforce owner/editor for the target tree.

## Metadata Structure
Returned JSON from `/api/admin/validation/rules`:
```json
{
  "ok": true,
  "rules": [
    { "id": "no-self", "description": "Cannot create a relationship with self.", "defaultSeverity": "error" },
    { "id": "warn-multiple-spouses", "description": "Warn when adding additional spouses.", "defaultSeverity": "warn" }
    // ... etc.
  ]
}
```
Generated from `validationRuleMetadata` in `server/utils/relationshipRules.js`.

## Rule IDs & Defaults
| Rule ID | Default | Description |
|---------|---------|-------------|
| no-self | error | Cannot create a relationship with self. |
| same-tree | error | Both members must belong to the same tree. |
| no-duplicate | error | Duplicate relationship already exists. |
| no-duplicate-reciprocal | error | Duplicate exists via reciprocal entry. |
| max-two-parents | error | Members cannot have more than two parents. |
| no-cycle | error | Prevents cycles in ancestry (parent/child). |
| no-parent-child-between-siblings | error | Siblings cannot be linked as parent/child. |
| no-parent-child-between-spouses | error | Spouses cannot be linked as parent/child. |
| no-grandparent-as-parent | error | Blocks setting a grandparent (or higher) as direct parent. |
| no-grandchild-as-child | error | Blocks setting a grandchild (or lower) as direct child. |
| generation-order | error | Enforces plausible generation ordering when known. |
| no-siblings-ancestor-descendant | error | Cannot set siblings between ancestor and descendant. |
| no-siblings-between-spouses | error | Cannot set siblings between spouses. |
| no-incest-ancestor-descendant | error | Blocks spouse relationship between ancestor and descendant. |
| no-incest-siblings | error | Blocks spouse relationship between siblings. |
| no-spouse-between-co-spouses | error | Blocks spouse relationship between co-spouses (share a spouse). |
| warn-multiple-spouses | warn | Warn when adding additional spouses. |
| no-direct-between-inlaws | error | Blocks direct links between in-law relations. |
| no-direct-affinal-ancestor-descendant | error | Blocks direct links to spouse-of an ancestor. |
| no-direct-co-spouse-of-ancestor | error | Blocks direct links to co-spouse of an ancestor. |
| warn-direct-step-parent-link | warn | Allows but warns on direct parent/child link to a step-parent. |

## Per-Tree Severity Overrides
Stored in `FamilyTree.validationConfig.severities` (Mongoose Map):
```js
validationConfig: {
  severities: Map<string,'error'|'warn'|'off'>
}
```
If a rule ID is absent, its defaultSeverity applies. Overrides persist in Mongo and are passed into `validateProposedRelationship` through `relationshipController`.

### Example PATCH Request
```http
PATCH /api/admin/trees/64f1.../severities
Content-Type: application/json
Authorization: Bearer <token>

{
  "updates": {
    "warn-multiple-spouses": "off",
    "no-direct-affinal-ancestor-descendant": "warn"
  }
}
```
Response:
```json
{
  "ok": true,
  "severities": {
    "warn-multiple-spouses": "off",
    "no-direct-affinal-ancestor-descendant": "warn"
  }
}
```

### Delete Override
```http
DELETE /api/admin/trees/64f1.../severities/no-direct-affinal-ancestor-descendant
```
Reverts the rule to its default severity.

## How Severities Affect Validation
1. Collect errors & warnings from logical checks.
2. Apply severityOverrides:
   - `off`: suppress message entirely.
   - `warn` (when message was error): downgrade to warning.
   - `error` (when message was warning): upgrade to error.
3. Deduplicate and perform category collapsing (adds `(+N more <category> issues)` suffix).
4. Final `ok` is true if no errors remain.

Label-only update bypass: if the relationship type is unchanged on update, structural rules are skipped regardless of severities.

## Admin UI Behavior
- Navigating to `#/admin` shows Admin panel; the Validation Rules tab is the default initial view.
- Closing panel exits admin mode entirely (hash cleared). This is intentional to provide a single modal escape route.
- Rule list is fetched from the metadata endpoint; each row shows ID, description, and a severity selector.
- "Revert" button appears only when a custom override exists for that rule.
- Saving sends the full current severities map (future optimization: diff-only PATCH).

## Extending Metadata
To add a new rule:
1. Implement the validation logic in `validateProposedRelationship` and push a new ruleId into `ruleIds` when triggered.
2. Add an entry to `validationRuleMetadata` with defaultSeverity.
3. Optionally update `VALIDATION-RULES.md` with deeper semantics.
4. Client automatically lists it; no UI code changes required.

## Backward Compatibility
- If the metadata endpoint is unreachable, the client list will be empty; severity editing will appear blank. A fallback static list could be reintroduced if desired.
- Existing severities in Mongo remain valid; unknown rule IDs stored previously are ignored unless reintroduced.

## Suggested Future Enhancements
- Add `category` field to metadata for precise client grouping instead of heuristic substring matching.
- Provide a non-admin GET `/api/validation/rules` for read-only visibility.
- Track rule hit counts for analytics.
- Diff-only PATCH to minimize payload size.

## Troubleshooting
| Issue | Cause | Resolution |
|-------|-------|------------|
| Rules table empty | Endpoint blocked / auth | Confirm admin privileges and network tab for 200 response. |
| Override not applied | RuleId mismatch | Ensure ruleId matches metadata `id` exactly. |
| Unexpected downgrade/upgrade | Severity map includes extra ruleId | Inspect saved severities via GET and remove unintended entries. |

## Example UI Flow
1. Open Admin panel (`#/admin`).
2. Adjust severities (e.g., set `warn-multiple-spouses` to `off`).
3. Click Save – PATCH request issued; UI refreshes severities.
4. Attempt operation (add second spouse) – previous warning suppressed.

---
**End of Document**
