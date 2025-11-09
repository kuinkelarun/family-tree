import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { ensureDbReady } from '../middleware/dbReady.js';
import { createTree, getTree, listMyTrees, deleteTree, updateMarriagePoint, recomputeGenerations, listArchivedTrees, restoreTree } from '../controllers/treeController.js';
import { getKinshipBetween, getKinshipMapForMember } from '../controllers/kinshipController.js';

const router = Router();

router.post('/', ensureDbReady, requireAuth, createTree);
// Public collection route - list user's trees (non-archived by default)
router.get('/', ensureDbReady, requireAuth, listMyTrees);
// Archived listing must come before parameterized routes to avoid being captured as an id
router.get('/archived', ensureDbReady, requireAuth, listArchivedTrees);
// Parameterized routes (per-tree) - keep after specific collection routes
router.get('/:id', ensureDbReady, requireAuth, getTree);
router.delete('/:id', ensureDbReady, requireAuth, deleteTree);
router.post('/:id/restore', ensureDbReady, requireAuth, restoreTree);
router.put('/:id/marriage-points', ensureDbReady, requireAuth, updateMarriagePoint);
router.post('/:id/recompute-generations', ensureDbReady, requireAuth, recomputeGenerations);
// Kinship inference (on-demand)
router.get('/:id/kinship', ensureDbReady, requireAuth, getKinshipBetween);
router.get('/:id/kinship/:memberId', ensureDbReady, requireAuth, getKinshipMapForMember);

export default router;
