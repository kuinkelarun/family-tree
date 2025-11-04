import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { ensureDbReady } from '../middleware/dbReady.js';
import { createTree, getTree, listMyTrees, deleteTree, updateMarriagePoint, recomputeGenerations } from '../controllers/treeController.js';
import { getKinshipBetween, getKinshipMapForMember } from '../controllers/kinshipController.js';

const router = Router();

router.post('/', ensureDbReady, requireAuth, createTree);
router.get('/:id', ensureDbReady, requireAuth, getTree);
router.get('/', ensureDbReady, requireAuth, listMyTrees);
router.delete('/:id', ensureDbReady, requireAuth, deleteTree);
router.put('/:id/marriage-points', ensureDbReady, requireAuth, updateMarriagePoint);
router.post('/:id/recompute-generations', ensureDbReady, requireAuth, recomputeGenerations);
// Kinship inference (on-demand)
router.get('/:id/kinship', ensureDbReady, requireAuth, getKinshipBetween);
router.get('/:id/kinship/:memberId', ensureDbReady, requireAuth, getKinshipMapForMember);

export default router;
