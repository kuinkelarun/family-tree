# Move to Pool Fix

## 🐛 The Problem

When clicking "Move to Pool" on a canvas node, the request failed with:
```
PUT http://localhost:5173/api/members/... 400 (Bad Request)
```

**Error Details**:
```javascript
[Members.update] Sending to /api/members/68fb9b5ca0908257f4a99cda 
payload: {position: null}

❌ 400 Bad Request
```

---

## 🔍 Root Cause

### Issue #1: Validation Schema Rejected `null`

The Zod validation schema was defined as:
```javascript
position: positionSchema.optional()
```

This accepts:
- ✅ `undefined` (field omitted)
- ✅ `{x: number, y: number}` (valid position)
- ❌ `null` (explicitly set to null)

When we sent `{position: null}`, Zod rejected it because `.optional()` doesn't accept `null`.

### Issue #2: Controller Didn't Handle `null`

Even if validation passed, the controller logic was:
```javascript
if (parsed.data.position) {
  member.position = parsed.data.position;
}
```

When `position: null`:
- `if (parsed.data.position)` evaluates to `false` (null is falsy)
- Position never gets updated
- Member stays on canvas

---

## ✅ The Fix

### Fix #1: Allow `null` in Validation Schema

**File**: `server/utils/validate.js`

**Before**:
```javascript
position: positionSchema.optional()
```

**After**:
```javascript
position: positionSchema.nullable().optional()  // ⬅ Added .nullable()
```

This now accepts:
- ✅ `undefined` (field omitted)
- ✅ `{x: number, y: number}` (valid position)
- ✅ `null` (clear position - move to pool)

### Fix #2: Handle `null` Explicitly in Controller

**File**: `server/controllers/memberController.js`

**Before**:
```javascript
if (parsed.data.position) {
  member.position = parsed.data.position;
}
```

**After**:
```javascript
if ('position' in parsed.data) {
  if (parsed.data.position === null) {
    // Explicitly clear position (move to pool)
    member.position = undefined;
    console.log('[updateMember] Clearing position (move to pool)');
  } else if (parsed.data.position) {
    // Set new position
    member.position = parsed.data.position;
    console.log('[updateMember] Setting position:', member.position);
  }
}
```

**Key changes**:
1. Use `'position' in parsed.data` instead of `if (parsed.data.position)`
   - This checks if the field exists (even if null)
2. Explicitly check `=== null` to clear position
3. Set to `undefined` (not `null`) so Mongoose removes the field

---

## 🧪 How It Works Now

### Workflow: Move to Pool

1. User clicks "Move to Pool" button
2. Client sends:
   ```javascript
   PUT /api/members/:id
   Body: { position: null }
   ```

3. **Validation** (Zod):
   ```javascript
   positionSchema.nullable().optional()
   ✅ Accepts null
   ```

4. **Controller Logic**:
   ```javascript
   if ('position' in parsed.data) {
     if (parsed.data.position === null) {
       member.position = undefined;  // ⬅ Clear field
     }
   }
   ```

5. **Mongoose Save**:
   - `position: undefined` → Field removed from document
   - Member saved without position

6. **Database Result**:
   ```javascript
   // Before: { _id: "123", name: "John", position: {x: 100, y: 200} }
   // After:  { _id: "123", name: "John" }  ← No position field
   ```

7. **Client Reload**:
   - `mapTreeToGraph()` filters members without positions
   - Member NOT included in canvas nodes
   - Member appears in 🔴 Member Pool

---

## 📊 Position Field States

| Client Sends | Validation | Controller | Mongoose | Result |
|--------------|------------|------------|----------|--------|
| `{position: {x, y}}` | ✅ Pass | Sets position | Saves position | On Canvas |
| `{position: null}` | ✅ Pass | Clears to `undefined` | Removes field | In Pool |
| `{}` (omit field) | ✅ Pass | No change | No change | Unchanged |

---

## 🔧 Testing

### Test Case 1: Move to Pool
```javascript
// Action: Click "Move to Pool" on canvas node
// Client sends: { position: null }
// Expected: Member removed from canvas, appears in pool
```

### Test Case 2: Add to Canvas
```javascript
// Action: Drag from pool or click "+ Add"
// Client sends: { position: {x: 100, y: 200} }
// Expected: Member appears on canvas at position
```

### Test Case 3: Update Name (No Position Change)
```javascript
// Action: Edit member name, click "Update Member"
// Client sends: { name: "New Name" }  // No position field
// Expected: Name updated, position unchanged
```

---

## 📁 Files Changed

| File | Change |
|------|--------|
| `server/utils/validate.js` | Added `.nullable()` to position field in memberUpdateSchema |
| `server/controllers/memberController.js` | Added explicit null handling to clear position field |

---

## 🎯 Key Insight

**The Problem**: We needed to distinguish between three cases:
1. **Set position** → `{position: {x, y}}`
2. **Clear position** → `{position: null}`
3. **Don't touch position** → `{}` (field omitted)

**The Solution**:
- Use `.nullable().optional()` in validation (accepts null or undefined)
- Use `'position' in parsed.data` to check if field exists
- Use `=== null` to detect clearing intent
- Set to `undefined` so Mongoose removes the field

**Why `undefined` not `null`?**
- Mongoose treats `undefined` as "delete this field"
- Mongoose treats `null` as "set field to null value"
- We want the field removed completely (not present in document)

---

## ✅ Verification

After this fix, "Move to Pool" should work:

1. **Click "Move to Pool"** on a canvas node
2. **Confirm dialog** → Click OK
3. **Server logs** show:
   ```
   [updateMember] Clearing position (move to pool)
   [updateMember] Member AFTER save: { name: 'John', position: undefined }
   [updateMember] Fresh from DB: { name: 'John' }  ← No position field
   ```
4. **Client** reloads tree
5. **Member appears in 🔴 Member Pool**
6. **Member NOT on canvas**

All working as expected! ✨
