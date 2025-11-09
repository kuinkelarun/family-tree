# Testing the Recompute Queue

## Quick Test Steps

### 1. Create Test Data
1. Create a new family tree
2. Add 3-4 family members
3. Create parent → child relationships between them

### 2. Monitor the Queue
1. Navigate to Admin Panel → Recompute Queue tab
2. You should see a job entry for your tree
3. Refresh every few seconds to watch status changes:
   - `pending` → `processing` → `done`

### 3. Expected Behavior

**Normal Operation:**
- Job appears within 1 second of relationship change
- Status changes to `done` within 5-10 seconds
- `attempts` should be 1
- `lastError` should be empty

**If Something Goes Wrong:**
- Status shows `failed` after 10 attempts
- `lastError` contains error message
- Can manually retry using "Force Retry" button
- Can delete stuck jobs using "Delete" button

## What Each Column Means

| Column | Description |
|--------|-------------|
| **Tree ID** | The family tree being recalculated |
| **Status** | `pending`, `processing`, `done`, or `failed` |
| **Attempts** | Number of times the job has been tried (max 10) |
| **Next Attempt** | When the next retry will happen (for pending jobs) |
| **Last Error** | Error message if job failed |
| **Updated** | Last time the job status changed |

## Retry Schedule (Exponential Backoff)

- Attempt 1: Immediate (1 second)
- Attempt 2: 15 seconds
- Attempt 3: 30 seconds
- Attempt 4: 60 seconds
- Attempt 5: 120 seconds
- Attempt 6: 240 seconds (4 minutes)
- Attempt 7: 480 seconds (8 minutes)
- Attempt 8: 960 seconds (16 minutes)
- Attempt 9: 1920 seconds (32 minutes)
- Attempt 10: Final attempt, then marked `failed`

## Common Scenarios

### Empty Queue
**Normal** - All generation calculations are up to date. No recent changes to family relationships.

### Jobs Stuck in "Pending"
**Check:**
- Is MongoDB connected? (Look for "Mongo connected" in server logs)
- Is the server running? (Worker runs every 5 seconds)
- Check server console for errors

### Jobs Keep Failing
**Investigate:**
- Look at `lastError` column for error details
- Check if tree has circular parent-child relationships
- Verify tree and members exist in database

## Manual Controls

**Force Retry Button:**
- Resets `nextAttempt` to now
- Resets `attempts` to 0
- Changes status to `pending`
- Worker will pick it up on next run (within 5 seconds)

**Delete Button:**
- Permanently removes job from queue
- Use for stuck/orphaned jobs
- Job will be recreated if you modify relationships again

## Monitoring Tips

1. **Keep Admin Panel open** during bulk imports
2. **Watch the Total count** to see queue draining
3. **Check for failed jobs** after large operations
4. **Use Force Retry** for transient network errors
5. **Delete orphaned jobs** for deleted trees
