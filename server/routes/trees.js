import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { ensureDbReady } from '../middleware/dbReady.js';
import { createTree, getTree, listMyTrees } from '../controllers/treeController.js';

const router = Router();

router.post('/', ensureDbReady, requireAuth, createTree);
router.get('/:id', ensureDbReady, requireAuth, getTree);
router.get('/', ensureDbReady, requireAuth, listMyTrees);

export default router;
