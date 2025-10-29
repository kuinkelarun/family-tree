# Quick POC Test Plan - Marriage Points System

## 🚨 Current Status Update (December 2024)

### What's Already Implemented ✅

Your **ui-update-nodes-adv** branch already has:
1. ✅ **FamilyNode with 8 handles** - smart position-aware routing
2. ✅ **Smart handle selection** - relationship type-based routing
3. ✅ **Edge deduplication** - bidirectional pairs collapsed
4. ✅ **Color-coded edges** - green (parent), pink (spouse), blue (sibling)

### What's Ready to Integrate (This Test Plan) 🔄

Files created and ready:
1. 🔄 **`graphStructure.js`** - Virtual marriage point logic
2. 🔄 **`FamilyEdge.jsx`** - Custom edge rendering (Bezier, orthogonal)
3. 🔄 **`MarriagePointNode.jsx`** - Virtual connector node component

**Status**: Code complete, **not yet integrated** into TreeBoard/App.jsx

---

## 🧪 Testing Current System (Baseline Before Marriage Points)

**Before testing marriage points**, verify your current smart handle system works:

### Access the Application

**URL**: http://localhost:5174

---

## Part A: Test Current Smart Handle System (Baseline)

### Test A1: Verify Basic Loading ✅

**Steps**:
1. Open http://localhost:5174 in your browser
2. Login or register a new account
3. Create a new family tree

**Expected Result**:
- ✅ Application loads without errors
- ✅ Tree canvas appears with FamilyNode components
- ✅ No console errors

---

### Test A2: Single Parent-Child Connection (Current System)

**Steps**:
1. Drag a member from sidebar to canvas (or click "Add Node")
2. Drag another member to canvas
3. Draw connection from first node to second
4. Select relationship type: "parent"

**Expected Result with CURRENT system**:
- ✅ Edge uses **top-source** handle on parent node
- ✅ Edge uses **bottom-target** handle on child node
- ✅ Edge is **GREEN** (#10b981)
- ✅ Edge has arrow marker
- ✅ Edge label shows "parent" if custom label added

**Visual**:
```
  [Parent]
     │  (green edge from top-source to bottom-target)
     ↓
  [Child]
```

---

### Test A3: Multi-Parent Connection (Current System - BASELINE)

**This shows what happens WITHOUT marriage points**

**Steps**:
1. Add three members: "Mother", "Father", "Child"
2. Connect Mother → Father as "spouse"
3. Connect Mother → Child as "parent"
4. Connect Father → Child as "parent"

**Expected Result with CURRENT system**:
1. **Spouse Edge** (Mother ↔ Father):
   - PINK (#ec4899) horizontal line
   - Uses left/right handles based on node positions
   - Deduplication: Only 1 edge shows (not 2)

2. **Parent Edges** (2 separate edges):
   - Mother → Child: GREEN edge from Mother's **top-source** to Child's **bottom-target**
   - Father → Child: GREEN edge from Father's **top-source** to Child's **bottom-target**
   - ⚠️ **These two edges may cross or overlap** depending on layout

**Visual (Current System)**:
```
[Mother] ←(pink)→ [Father]
    │                │
    └────(green)─────┘
            ↓
         [Child]
   (2 edges converging, potential crossing)
```

**Note**: This is your **baseline** for comparison. It works, but can be cluttered with complex families.

---

## Part B: Test Marriage Point System (After Integration)

**⚠️ IMPORTANT**: These tests will only work **after** you integrate the marriage point system per IMPLEMENTATION-GUIDE.md

### Test B1: Marriage Point Appears

After integrating `graphStructure.js`:

**Steps**:
Same as Test A3 (create Mother, Father, Child with relationships)

**Expected Result with MARRIAGE POINTS** ✨:

1. **Spouse Edge** (Mother ↔ Father):
   - Still PINK, but now may be **orthogonal** (step-wise) routing
   - Connects to marriage point node

2. **Virtual Marriage Point Node Appears**:
   - Small circle (20px diameter) appears
   - Positioned as midpoint between/below the parents
   - Shows marriage symbol (⚭)
   - Gray/white styling with border
   - **This is the key visual difference!**

3. **Parent Edges Restructured**:
   - Mother → [Marriage Point]: Dashed green line or orthogonal routing
   - Father → [Marriage Point]: Dashed green line or orthogonal routing  
   - [Marriage Point] → Child: Solid green Bezier curve
   - **NO CROSSING** - all edges flow through marriage point

**Visual (Marriage Point System)**:
```
[Mother]      [Father]
    │            │
    └────[⚭]────┘
          │
          ↓
       [Child]
   (3 edges via marriage point, zero crossings!)
```

---

### Test B2: Verify Custom Edge Styling

**Expected if FamilyEdge.jsx integrated**:
- Parent-child edges: **Smooth Bezier curves** (not ReactFlow default)
- Spouse edges: **Straight lines** with thicker stroke
- Marriage connector edges: **Orthogonal routing** (step-wise paths)

**Verification**:
- Inspect edge in browser DevTools
- Should see custom SVG path with Bezier curves
- Should NOT see ReactFlow's default `react-flow__edge-path` class only

---

### Test B3: Multiple Children from Same Parents

**Steps**:
1. Use same Mother + Father + marriage point
2. Add second child "Child2"
3. Connect Father → Child2 as "parent" (Mother already implied via marriage point)

**Expected Result**:
- Marriage point now has **2 outgoing edges**
- Both children connect to same marriage point
- Visual clarity: "These 2 children share these 2 parents"

**Visual**:
```
[Mother]      [Father]
    │            │
    └────[⚭]────┘
          │
          ├──→ [Child1]
          │
          └──→ [Child2]
```
  Mother ──────────── Father
     │                  │
     └────────●─────────┘
              │
           Child
```

**If You Don't See the Marriage Point**:
- Check browser console for errors
- Marriage point might be hidden (very small) - look carefully
- Try zooming in on the canvas
- Check that both parents are connected to the child with "parent" type

---

### Test Scenario 4: Drag and Update

**Steps**:
1. Using the multi-parent setup from Scenario 3
2. Click and drag the "Mother" node to a new position
3. Release

**Expected Result**:
- ✅ Marriage point automatically updates its position
- ✅ Marriage point stays at the midpoint between parents
- ✅ All edge paths recalculate smoothly

---

### Test Scenario 5: Multiple Children from Same Parents

**Steps**:
1. Using the multi-parent setup from Scenario 3
2. Add a second child: "Child 2"
3. Connect Mother → Child 2 (relationship: parent)
4. Connect Father → Child 2 (relationship: parent)

**Expected Result**:
- ✅ Same marriage point is reused for both children
- ✅ Two edges from marriage point to children
- ✅ Clean, organized visual layout
- ✅ No edge crossings

**Visual Layout**:
```
  Mother ──────────── Father
     │                  │
     └────────●─────────┘
              │
         ┌────┴────┐
      Child1    Child2
```

---

## 🐛 Debugging Checklist

### If You See Errors in Console

**Common Error 1**: `Cannot find module './edges/FamilyEdge'`
- **Fix**: Check that `FamilyEdge.jsx` exists in `client/src/components/edges/`
- **Verify**: File should have been created earlier

**Common Error 2**: `Cannot find module './utils/graphStructure'`
- **Fix**: Check that `graphStructure.js` exists in `client/src/utils/`
- **Verify**: File should have been created earlier

**Common Error 3**: `getBezierPath is not a function`
- **Fix**: Check ReactFlow version in `package.json`
- **Should be**: ReactFlow v11 or higher
- **Action**: Run `npm install reactflow@latest` in client directory if needed

**Common Error 4**: Marriage points not appearing
- **Debug**: Open browser DevTools → Console
- **Look for**: Logs starting with `[mapTreeToGraph]`
- **Should see**: "Created X nodes (Y virtual)"
- **If Y = 0**: No family units detected - verify parent relationships are set correctly

---

## 📊 Success Criteria for POC

### ✅ Phase 1 POC is Successful If:

1. **Application Loads** without errors
2. **Custom edges render** with color coding
3. **Marriage point nodes appear** when creating multi-parent connections
4. **Edges don't cross** in multi-parent scenario
5. **Marriage points update** when dragging parent nodes

### 🎯 What We've Achieved

**Before**:
```
  Mother ╲              Father
          ╲            ╱
           ╲          ╱
            ╲        ╱
             ╲      ╱  (edges cross - cluttered!)
              ╲    ╱
               ╲  ╱
                ╲╱
               Child
```

**After** (with our POC):
```
  Mother ──────────── Father
     │                  │
     └────────●─────────┘
              │
           Child
```

**Improvement**: Zero crossings, clean visual hierarchy!

---

## 🚀 Next Steps

### If POC is Successful ✅

You're ready to proceed to **Phase 2: Enhanced Rendering** which includes:
- Fine-tuning edge styles
- Adding hover effects
- Improving marriage point visuals
- Adding edge legends

### If Issues Occur ⚠️

1. Check browser console for specific errors
2. Verify all files were created correctly
3. Review the code changes in TreeBoard.jsx and App.jsx
4. Check that server is running (backend API)

---

## 📝 Testing Checklist

Mark these as you test:

- [ ] Application loads at http://localhost:5174
- [ ] Can login/register
- [ ] Can create a new tree
- [ ] Can add nodes
- [ ] Single parent-child edge works (green, Bezier curve)
- [ ] Spouse edge works (pink, horizontal)
- [ ] **Marriage point appears** when two parents → one child
- [ ] Marriage point updates when parent is dragged
- [ ] Multiple children can share same marriage point
- [ ] No console errors
- [ ] Edges are color-coded correctly
- [ ] Can export tree (existing feature still works)

---

## 🎓 Understanding What's Happening

### Behind the Scenes

When you connect two parents to one child:

1. **buildFamilyGraph()** detects the pattern:
   - Child has 2 parents → creates a "family unit"
   - Assigns unique ID: `unit_parentId1_parentId2`

2. **Virtual Node Created**:
   - ID: `mp_unit_parentId1_parentId2`
   - Type: `marriagePoint`
   - Position calculated as midpoint between parents

3. **Edges Restructured**:
   - Old: Parent1 → Child, Parent2 → Child (2 edges)
   - New: Parent1 → MarriagePoint, Parent2 → MarriagePoint, MarriagePoint → Child (3 edges)
   - But visually cleaner with no crossings!

4. **Custom Rendering**:
   - `FamilyEdge` component applies appropriate curve type
   - Marriage point edges get dashed style (virtual)
   - Parent-child edges get Bezier curves

---

## 🔍 Visual Inspection Guide

### What to Look For

1. **Edge Colors**:
   - Green: parent/child relationships
   - Pink: spouse relationships
   - Gray/dashed: virtual connectors (to marriage point)

2. **Edge Styles**:
   - Smooth curves: parent-child
   - Straight lines: spouse
   - Dashed lines: virtual connectors

3. **Nodes**:
   - Regular nodes: white background, member names
   - Marriage points: small circles, gray or green

4. **Layout**:
   - No overlapping edges
   - Clear hierarchical flow (top-down)
   - Spouses on same horizontal level

---

## 💡 Pro Tips

1. **Use Browser DevTools**:
   - Open Console (F12)
   - Watch for `[mapTreeToGraph]` logs
   - These show node/edge counts and virtual nodes

2. **Zoom In**:
   - Marriage points are small (20px)
   - Use mouse wheel to zoom
   - Or use the minimap in bottom-left

3. **Test Incrementally**:
   - Don't rush to create complex trees
   - Start with single connections
   - Build up to multi-parent scenarios

4. **Save Your Work**:
   - Tree is saved to MongoDB automatically
   - You can reload and tree structure persists

---

## 📞 Report Back

After testing, report:

1. ✅ POC Success - All tests pass → Ready for Phase 2
2. ⚠️ Partial Success - Some issues → Need debugging
3. ❌ POC Failed - Critical errors → Need troubleshooting

**Questions to Answer**:
- Does the application load?
- Do you see the marriage point in multi-parent scenario?
- Are edges color-coded?
- Any console errors?

---

**POC Status**: Phase 1 Complete - Ready for Testing
**Next**: Test the scenarios above and report results
**Then**: Move to Phase 2 (Enhanced Rendering) or debug issues

---

*Remember: This is a POC to validate the core concept. Some polish and edge cases will be handled in later phases.*
