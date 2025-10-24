# Architecture Diagram: Hybrid Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FAMILY TREE BUILDER                                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────┬─────────────────────────────────────────────────────┐
│   LEFT SIDEBAR       │              MAIN CONTENT AREA                      │
│   (320px wide)       │                                                     │
│                      │                                                     │
│ ┌────────────────┐   │  ┌──────────────────────────────────────────────┐  │
│ │ Check API      │   │  │           HEADER BAR                         │  │
│ │ Health         │   │  │  Login | Create Tree | Export | Logout       │  │
│ └────────────────┘   │  └──────────────────────────────────────────────┘  │
│                      │                                                     │
│ ┌─────────────────┐  │  ┌──────────────────────────────────────────────┐  │
│ │ 🔴 Member Pool  │  │  │          CANVAS TOOLBAR                      │  │
│ │   (5 members)   │  │  │  [+ Add Node] [Legend] [Maximize]            │  │
│ │─────────────────│  │  └──────────────────────────────────────────────┘  │
│ │                 │  │                                                     │
│ │ John Doe [+Add] │──┼─▶│  ┌────────────────────────────────────────┐  │  │
│ │ (draggable)     │  │  │  │      REACT FLOW CANVAS                 │  │  │
│ │                 │  │  │  │                                        │  │  │
│ │ Jane Smith [+Add│──┼─▶│  │  ┌──────┐      ┌──────┐               │  │  │
│ │                 │  │  │  │  │Person│──────│Person│               │  │  │
│ │ Bob Lee [+Add]  │──┼─▶│  │  │  1   │      │  2   │               │  │  │
│ │                 │  │  │  │  └──────┘      └──────┘               │  │  │
│ │ ...             │  │  │  │                                        │  │  │
│ └─────────────────┘  │  │  │  (Drag zone - accepts drops)          │  │  │
│                      │  │  │                                        │  │  │
│ ┌─────────────────┐  │  │  └────────────────────────────────────────┘  │  │
│ │ 🟢 On Canvas    │  │  └──────────────────────────────────────────────┘  │
│ │   (2 members)   │  │                                                     │
│ │─────────────────│  │  ┌──────────────────────────────────────────────┐  │
│ │                 │  │  │      MEMBER FORM                             │  │
│ │ Person 1 ◀──────┼──┼──│  (Click node to edit, or create new)         │  │
│ │ Person 2 ◀──────┼──┼──│                                              │  │
│ │                 │  │  │  Name: [___________]                         │  │
│ └─────────────────┘  │  │  DOB:  [___________]                         │  │
│                      │  │  Photo:[___________]                         │  │
│                      │  │  Notes:[___________]                         │  │
│                      │  │                                              │  │
│                      │  │  [Add to Pool / Update Member]               │  │
│                      │  └──────────────────────────────────────────────┘  │
└──────────────────────┴─────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════════
                              DATA FLOW DIAGRAMS
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│  WORKFLOW A: Member Pool → Canvas (Detailed Members)                        │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌───────────┐
    │ User fills│
    │   form    │
    └─────┬─────┘
          │
          ▼
    ┌────────────────┐
    │ Click "Add to  │
    │     Pool"      │
    └────────┬───────┘
             │
             ▼
    ┌─────────────────────────────┐
    │ Members.create()            │
    │ { name, dob, photo, notes } │
    │ (NO position field)         │
    └──────────┬──────────────────┘
               │
               ▼
    ┌─────────────────────────────┐
    │ Saved to MongoDB            │
    │ member: { _id, name, ... }  │
    └──────────┬──────────────────┘
               │
               ▼
    ┌──────────────────────────────┐
    │ Appears in Sidebar           │
    │ 🔴 Member Pool section       │
    │ [John Doe] [+ Add]           │
    └──────────┬───────────────────┘
               │
         ┌─────┴─────┐
         │           │
         ▼           ▼
    ┌────────┐  ┌────────────┐
    │ DRAG   │  │ CLICK      │
    │ to     │  │ "+ Add"    │
    │ canvas │  │ button     │
    └────┬───┘  └─────┬──────┘
         │            │
         └─────┬──────┘
               ▼
    ┌──────────────────────────────┐
    │ Members.update(id, {position})│
    │ position: { x: 100, y: 200 } │
    └──────────┬───────────────────┘
               │
               ▼
    ┌──────────────────────────────┐
    │ loadTree() called            │
    │ Re-fetches all members       │
    └──────────┬───────────────────┘
               │
               ▼
    ┌──────────────────────────────┐
    │ mapTreeToGraph() filters     │
    │ Only shows members WITH pos  │
    └──────────┬───────────────────┘
               │
               ▼
    ┌──────────────────────────────┐
    │ Node appears on canvas       │
    │ Moves to "On Canvas" section │
    │ 🟢 [John Doe]                │
    └──────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│  WORKFLOW B: Quick Node Creation (Fast Prototyping)                         │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌───────────────┐
    │ User clicks   │
    │ "+ Add Node"  │
    └───────┬───────┘
            │
            ▼
    ┌─────────────────────────────┐
    │ handleAddPerson()           │
    │ Generates auto-name         │
    │ Calculates grid position    │
    └──────────┬──────────────────┘
               │
               ▼
    ┌─────────────────────────────┐
    │ Members.create()            │
    │ { name: "Person N",         │
    │   position: {x, y},         │
    │   tree: treeId }            │
    └──────────┬──────────────────┘
               │
               ▼
    ┌─────────────────────────────┐
    │ Saved to MongoDB            │
    │ WITH position immediately   │
    └──────────┬──────────────────┘
               │
               ▼
    ┌─────────────────────────────┐
    │ loadTree() called           │
    │ Fetches member with pos     │
    └──────────┬──────────────────┘
               │
               ▼
    ┌─────────────────────────────┐
    │ Node appears on canvas      │
    │ Appears in "On Canvas" sect │
    │ 🟢 [Person 1]               │
    └─────────────────────────────┘
               │
               ▼
    ┌─────────────────────────────┐
    │ User clicks node to select  │
    │ Form populates with details │
    └──────────┬──────────────────┘
               │
               ▼
    ┌─────────────────────────────┐
    │ User adds details and saves │
    │ Members.update(id, {data})  │
    └─────────────────────────────┘


═══════════════════════════════════════════════════════════════════════════════
                           COMPONENT RELATIONSHIPS
═══════════════════════════════════════════════════════════════════════════════

                            ┌─────────────┐
                            │   App.jsx   │
                            │  (State)    │
                            └──────┬──────┘
                                   │
                ┌──────────────────┼──────────────────┐
                │                  │                  │
                ▼                  ▼                  ▼
         ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
         │  Sidebar    │   │  TreeBoard  │   │ MemberForm  │
         │             │   │             │   │             │
         │ Props:      │   │ Props:      │   │ Props:      │
         │ - members   │   │ - nodes     │   │ - selected  │
         │ - nodesOn   │   │ - edges     │   │ - onSave    │
         │   Canvas    │   │ - onDrop    │   │ - canSave   │
         │ - onAdd     │   │ - onAdd     │   │             │
         │ - onSelect  │   │ - onDrag    │   │             │
         └─────────────┘   └─────────────┘   └─────────────┘
                │                  │                  │
                │                  │                  │
        Emits:  │          Emits:  │          Emits:  │
        - onAddMember     - onDropMember    - onSave(form)
          ToCanvas(m)       (id, pos)       
        - onSelectMember  - onAddPerson()
          (id)            - onNodeClick(id)


═══════════════════════════════════════════════════════════════════════════════
                              DATABASE SCHEMA
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│  Member Document (MongoDB)                                                  │
└─────────────────────────────────────────────────────────────────────────────┘

{
  _id: "507f1f77bcf86cd799439011",
  tree: "507f1f77bcf86cd799439012",  // Reference to FamilyTree
  name: "John Doe",
  dob: "1980-01-15",
  photo: "https://example.com/photo.jpg",
  notes: "Software Engineer",
  
  // 🔑 KEY FIELD: Controls canvas visibility
  position: {                           // ⬅ Only present if on canvas
    x: 100,
    y: 200
  },
  // If position is null/undefined → Member Pool
  // If position has {x, y} → On Canvas
  
  relationships: [
    {
      fromMember: "507f1f77bcf86cd799439011",
      toMember: "507f1f77bcf86cd799439013",
      type: "spouse",
      label: "Married 2005"
    }
  ],
  
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-15T12:30:00Z"
}


═══════════════════════════════════════════════════════════════════════════════
                           VISIBILITY LOGIC
═══════════════════════════════════════════════════════════════════════════════

┌────────────────────────────────────────────────────────────────────────────┐
│  mapTreeToGraph() - Converts members to React Flow nodes                  │
└────────────────────────────────────────────────────────────────────────────┘

function mapTreeToGraph(members, relationships) {
  const nodes = [];
  
  for (const member of members) {
    // ⚠️ CRITICAL: Only add to nodes if position exists
    if (hasPosVal(member.position)) {
      nodes.push({
        id: member._id,
        position: member.position,  // ⬅ Use stored position
        data: { 
          label: member.name,
          member: member  // Full member data for editing
        }
      });
    }
    // If no position → Not added to nodes → Not on canvas
  }
  
  return { nodes, edges };
}

function hasPosVal(pos) {
  return pos && 
         typeof pos.x === 'number' && 
         typeof pos.y === 'number';
}


┌────────────────────────────────────────────────────────────────────────────┐
│  Sidebar Filtering Logic                                                  │
└────────────────────────────────────────────────────────────────────────────┘

// In Sidebar component
const nodesOnCanvas = nodes.map(n => n.id);  // IDs of visible nodes

const membersNotOnCanvas = members.filter(m => 
  !nodesOnCanvas.includes(m._id)
);  // → 🔴 Member Pool

const membersOnCanvas = members.filter(m => 
  nodesOnCanvas.includes(m._id)
);  // → 🟢 On Canvas


═══════════════════════════════════════════════════════════════════════════════
                              API ENDPOINTS
═══════════════════════════════════════════════════════════════════════════════

POST   /api/members                  → Create member (with/without position)
PUT    /api/members/:id              → Update member (add/change position)
GET    /api/trees/:id                → Get tree with all members
GET    /api/members?tree=:treeId     → Get all members in tree

Key: Position field determines visibility
- Create with position → On canvas immediately
- Create without position → Member pool only
- Update with position → Moves to canvas
