# Admin Trees: TODO & Implementation Plan

This document captures requirements, design decisions, API contract, DB notes, and an implementation plan for the Admin landing page that lists every tree in the application.

## Summary
- New admin route: `/admin/trees`
- Default Admin landing page showing all trees with metadata and management actions.
- Backend: paginated, searchable, sortable API protected by admin role.
- Frontend: route-based React page with table (desktop) and cards (mobile), actions, bulk selection, and accessibility.

## Requirements (from request)
- Route: `/admin/trees` (route-based page)
- Columns/fields: Tree name, Tree ID, Owner (id/email), Created at, Updated at, Status, Node count
- Actions: View/Open, Export PNG, Archive/Unarchive, Transfer Ownership, Soft-delete
- Server-side pagination (10/25/50), sorting, search by name or owner email
- Bulk actions for delete/archive/export
- Row details drawer/modal for audit info
- Accessibility & responsive design
- Only admin users may access endpoints and UI
- Audit-log admin actions

## High-level design decisions
- Keep admin endpoints under `/api/admin/*` and protect them with `requireAuth` and `requireAdmin` middleware.
- Use server-side pagination (limit/offset) initially; allow replacing with cursor pagination later if needed.
- Return owner email with trees via populate/lookup, but keep a server setting to mask emails if privacy required.
- Implement soft-delete via `deletedAt` on the `FamilyTree` collection.

## API contract (initial)

### GET /api/admin/trees
Query params: limit (default 25), offset (default 0), sort (field), dir (asc|desc), search (string)
Response:
```
{
  "items": [{ "id":"", "name":"", "ownerId":"", "ownerEmail":"", "createdAt":"", "updatedAt":"", "status":"", "nodeCount": 0 }],
  "total": 123,
  "limit": 25,
  "offset": 0
}
```

### GET /api/admin/trees/:id
Return full metadata and recent audit events.

### POST /api/admin/trees/:id/transfer
Body: { newOwnerId }

### POST /api/admin/trees/:id/archive
Body: { archive: true|false }

### DELETE /api/admin/trees/:id
Soft-delete the tree (set deletedAt). Body optional: { hard: true } — admin-only and audited.

### POST /api/admin/trees/bulk
Body: { action: 'archive'|'delete'|'export', ids: [..] }

## Backend implementation notes
- Use existing `FamilyTree` Mongoose model. Add `deletedAt` if not present.
- Implement query using `find()` and `populate('owner','email')` to avoid N+1.
- Add an `AdminAudit` model (or extend RecomputeJob style) to record admin actions: { actorId, action, treeId, timestamp, details }.

## Frontend notes
- New page component: `client/src/components/AdminTrees.jsx` reachable at `/admin/trees`.
- Use `client/src/utils/api.js` Admin.* helpers to fetch and perform actions.
- Build a table with paginated controls, sortable headers, search input, and bulk-select checkboxes.
- For mobile, collapse rows into compact cards showing core metadata and actions.

## Step-by-step plan (short term)
1. Add server endpoints (controllers + routes) - return paginated list with owner email.
2. Add client API helper methods in `client/src/utils/api.js`.
3. Create `AdminTrees.jsx` page component and wire route in `App.jsx` for `/admin/trees`.
4. Implement table UI with pagination and search; wire actions to API stubs.
5. Add audit logging hooks in controllers when actions are performed.

## Testing & acceptance
- Unit tests for controllers and query behavior (pagination, search).
- Integration test: admin user can fetch page and perform archive/delete resulting in audit entry.
- Frontend: component tests for table behavior and e2e scenario simulating admin flows.

## Next steps — starting implementation
- I'll add server controller stubs and routes for the admin trees API and a client skeleton page + API helpers so we can iterate quickly.
