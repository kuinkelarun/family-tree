import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { ensureDbReady } from '../middleware/dbReady.js';
import { createMember, deleteMember, updateMember } from '../controllers/memberController.js';

const router = Router();

router.post('/', ensureDbReady, requireAuth, createMember);
router.put('/:id', ensureDbReady, requireAuth, updateMember);
router.delete('/:id', ensureDbReady, requireAuth, deleteMember);

export default router;
