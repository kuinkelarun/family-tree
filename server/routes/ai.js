import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { suggestRelationship } from '../controllers/aiController.js';

const router = Router();

router.post('/suggest-relationship', requireAuth, suggestRelationship);

export default router;
