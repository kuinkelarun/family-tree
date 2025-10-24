# Position Flattening Debug Guide

## Problem
Nodes align horizontally after page refresh, losing their layout.

## Debug Logging Added

### Client-side (App.jsx)
- `[loadTree]` - Shows raw tree data, member positions on load
- `[mapTreeToGraph]` - Shows which position is used for each member (saved vs fallback)
- `[handleNodeDragStop]` - Shows when positions are saved after dragging
- Position initialization logic shows when it detects no positions and tries to persist them

### Server-side
- `[updateMember]` - Shows when position updates are received and saved
- `[getTree]` - Shows positions of all members when tree is fetched

## How to Debug

### Step 1: Open Browser DevTools
1. Open http://localhost:5173/ in your browser
2. Press F12 to open DevTools
3. Go to the Console tab
4. Clear the console (trash icon)

### Step 2: Test Sequence

#### Test A: Load existing tree
1. Login and select your tree
2. Look for `[loadTree] Raw tree data:` in console
3. Expand the members array and check if `position: { x: ..., y: ... }` exists
4. Look for `[mapTreeToGraph]` logs showing which positions are used
5. **Expected**: If positions exist in API response, they should be used
6. **If failing**: Positions are missing from API or not being applied

#### Test B: Drag a node
1. Drag any node to a new position
2. Look for `[handleNodeDragStop] Saving position for ...` 
3. Check server terminal for `[updateMember] Updating member ... with data:`
4. Verify server shows `position now: { x: ..., y: ... }`
5. **Expected**: Position should be saved without errors
6. **If failing**: Check validation errors or network errors

#### Test C: Refresh page
1. After dragging nodes, refresh the page (F5 or Ctrl+R)
2. Look for `[loadTree] Raw tree data:` again
3. Check if members have the `position` field with your saved coordinates
4. Look for `[mapTreeToGraph]` showing `hasPos=true` for dragged nodes
5. **Expected**: Nodes appear where you left them
6. **If failing**: Positions not persisted in database or not returned by API

#### Test D: Initialize positions (for trees with no positions)
1. If all members show `hasPos=false`, look for `[loadTree] Initializing positions for all members...`
2. Check for individual `[loadTree] Setting position for ...` logs
3. Look for `[loadTree] Position updates complete, reloading tree...`
4. After reload, verify `[loadTree] Reloaded tree members:` shows positions
5. Refresh page and check if positions stick
6. **Expected**: First load initializes grid, subsequent loads keep it
7. **If failing**: Initialization failing or not triggering

## Common Issues & Fixes

### Issue 1: Positions not in API response
**Symptom**: `[loadTree]` shows members without `position` field
**Check**: Server terminal for `[getTree]` logs
**Fix**: Verify Member schema has position field, check `.populate('members')` includes it

### Issue 2: Position updates fail
**Symptom**: `[handleNodeDragStop]` shows error or server returns 400/500
**Check**: Server logs for `[updateMember]` validation errors
**Fix**: Ensure validation schema accepts `{ position: { x: number, y: number } }`

### Issue 3: Positions persist but fallback is used
**Symptom**: API returns positions but nodes use fallback grid
**Check**: `[mapTreeToGraph]` shows `hasPos=false` despite position in data
**Fix**: Verify `hasPosVal()` logic - both x and y must be numbers (not null/undefined)

### Issue 4: Initialization doesn't trigger
**Symptom**: No positions, but no `[loadTree] Initializing...` log
**Check**: `[loadTree] noneHavePos:` value
**Fix**: Check if any member has a position (even null breaks the `every()` check)

### Issue 5: Initialization fails
**Symptom**: `[loadTree] Initializing...` appears but fails
**Check**: `[loadTree] Initializing positions failed:` error message
**Fix**: Check network errors, validation errors, or auth issues

## What to Report Back

After running through the tests, share:

1. **Which test fails** (A, B, C, or D)
2. **Console logs** from that test (copy/paste or screenshot)
3. **Server logs** if relevant (especially `[updateMember]` and `[getTree]`)
4. **Network tab** - check the actual request/response for:
   - `GET /api/trees/:id` - Does response include positions?
   - `PUT /api/members/:id` - Is position being sent? What's the response?

## Quick Fixes to Try

### If positions never save:
```javascript
// Check validation schema accepts position
// In server/utils/validate.js, memberUpdateSchema should allow:
position: z.object({ x: z.number(), y: z.number() }).optional()
```

### If positions save but aren't loaded:
```javascript
// Check getTree returns full member documents
// In server/controllers/treeController.js:
const tree = await FamilyTree.findById(req.params.id).populate('members');
// Should populate all fields including position
```

### If React Flow resets positions:
```javascript
// Make sure TreeBoard is controlled by external state
// In App.jsx, TreeBoard should receive:
nodes={nodes}  // external state
setNodes={setNodes}  // external setter
// Not using internal state
```

## Next Steps After Debugging

Once you identify where it's failing, we can:
1. Fix validation if updates are rejected
2. Fix populate if positions aren't returned
3. Fix client logic if positions aren't applied
4. Add error boundaries if initialization fails silently
