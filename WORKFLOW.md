# Family Tree Builder - Hybrid Workflow Guide

## Overview

The application now uses a **hybrid workflow** that separates **member data management** (sidebar) from **tree visualization** (canvas). This gives you flexibility to:

1. Create a pool of family members with detailed information
2. Selectively add members to the visual tree
3. Quickly add basic nodes for structure building

---

## Two Ways to Build Your Tree

### 🎨 Method 1: Member Pool Workflow (Recommended for detailed trees)

**Use this when**: You want to collect all family member details first, then build the visual tree.

#### Steps:

1. **Create Members** (Sidebar → "Add New Member" form)
   - Fill in name, date of birth, photo URL, notes
   - Click "Add to Pool"
   - Member is saved but NOT shown on canvas yet
   - Appears in **"Member Pool"** section (red indicator)

2. **Add to Canvas** (Two ways)
   - **Drag & Drop**: Drag member from pool onto canvas
   - **Click Button**: Click the "+ Add" button next to member name

3. **Build Relationships**
   - Connect nodes by dragging from one node's edge to another
   - Choose relationship type (parent, spouse, sibling, etc.)

4. **Edit Details**
   - Click any node on canvas to select it
   - Edit form populates with member details
   - Update and save

---

### ⚡ Method 2: Quick Node Workflow (Fast structure building)

**Use this when**: You want to quickly sketch out the family tree structure.

#### Steps:

1. **Add Basic Nodes** (Canvas toolbar → "+ Add Node" button)
   - Creates a node with auto-generated name ("Person 1", "Person 2", etc.)
   - Immediately appears on canvas
   - No detailed info yet

2. **Add Details Later**
   - Click the node to select it
   - Fill in the "Edit Member Details" form
   - Update with real information

3. **Build Relationships**
   - Connect nodes as needed
   - Add relationship types

---

## UI Sections Explained

### Left Sidebar

#### 1. Member Pool (Red indicator 🔴)
- Shows members **NOT yet on canvas**
- These exist in the database but aren't visualized
- **Actions**:
  - Drag to canvas
  - Click "+ Add" button
  - Click name to edit details

#### 2. On Canvas (Green indicator 🟢)
- Shows members **currently visible on canvas**
- Click any member to select and edit

### Canvas (Center)

- Visual representation of your family tree
- **Toolbar**:
  - **"+ Add Node"**: Quick basic node creation
  - **Legend**: Color-coded relationship types
  - **Maximize**: Fullscreen mode

### Bottom Section

- **Member Form**: Create new members or edit selected member
- **Workflow indicators**:
  - "Add New Member" (no selection) → Adds to pool
  - "Edit Member Details" (node selected) → Updates existing member

---

## Key Differences from Before

| Feature | Old Behavior | New Behavior |
|---------|--------------|--------------|
| "Add Member" form | Created node on canvas | Adds to **member pool** (not canvas) |
| "Add Person" button | Created with auto-name | Still creates node, renamed to "+ Add Node" |
| Member visibility | All members always visible | Only members with positions visible |
| Workflow | Single-stage (create = visible) | Two-stage (create → add to canvas) |

---

## Relationship Color Coding

Edges between nodes are color-coded by relationship type:

- 🟢 **Green** (`#10b981`): Parent/Child relationships
- 💗 **Pink** (`#ec4899`): Spouse relationships
- 🔵 **Blue** (`#3b82f6`): Sibling relationships
- 🟣 **Purple** (`#8b5cf6`): Custom relationships

Legend is always visible in the canvas toolbar.

---

## Best Practices

### For Large Family Trees
1. Start with Member Pool workflow
2. Collect all family member details using the form
3. Review member pool before adding to canvas
4. Drag members to canvas in chronological/hierarchical order
5. Connect relationships as you go

### For Quick Prototyping
1. Use "+ Add Node" to quickly create structure
2. Connect relationships immediately
3. Fill in details later by clicking nodes

### Mixing Both Workflows
1. Create detailed members for close family (pool workflow)
2. Use quick nodes for distant relatives you'll research later
3. Gradually upgrade quick nodes to detailed members

---

## Technical Details

### How Members Appear on Canvas

A member appears on canvas when they have a `position` field:

```javascript
// Member WITHOUT position = in pool only
{
  _id: "123",
  name: "John Doe",
  // no position field
}

// Member WITH position = on canvas
{
  _id: "123",
  name: "John Doe",
  position: { x: 100, y: 200 }
}
```

### Data Flow

**Creating in Pool**:
```
Form Submit → Members.create() → DB → Sidebar "Member Pool" → (not on canvas)
```

**Adding to Canvas**:
```
Drag/Click → Members.update(id, {position}) → DB → Canvas renders node
```

**Quick Node Creation**:
```
"+ Add Node" → Members.create({position}) → DB → Canvas renders immediately
```

---

## Troubleshooting

**Q: I created a member but don't see it on canvas**  
A: Check the "Member Pool" section in sidebar - drag it to canvas or click "+ Add"

**Q: Member disappeared from canvas after refresh**  
A: Position data might not have persisted - this is a known issue we're debugging

**Q: Can I remove a member from canvas without deleting them?**  
A: Not yet - this feature is planned (remove position field)

**Q: How do I delete a member completely?**  
A: Member deletion is not yet implemented

---

## Future Enhancements

- [ ] Remove member from canvas (keep in pool)
- [ ] Delete members
- [ ] Bulk import from CSV
- [ ] Search/filter members in pool
- [ ] Member categories/tags
- [ ] Timeline view

---

## Keyboard Shortcuts

- **Escape**: Exit fullscreen mode
- **Scroll**: Zoom in/out on canvas
- **Click + Drag** (canvas): Pan view
- **Click + Drag** (node): Move node
- **Click + Drag** (edge handle): Create relationship

---

## Questions or Issues?

If you encounter any problems or have suggestions, please document:
1. What you were trying to do
2. What happened instead
3. Any error messages in browser console (F12)
4. Server logs (if applicable)
