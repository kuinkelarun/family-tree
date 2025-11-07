import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { ensureDbReady } from '../middleware/dbReady.js';
import { addRelationship, updateRelationship, deleteRelationship, validateRelationship } from '../controllers/relationshipController.js';

const router = Router();

router.post('/', ensureDbReady, requireAuth, addRelationship);
router.post('/validate', ensureDbReady, requireAuth, validateRelationship);
router.put('/', ensureDbReady, requireAuth, updateRelationship);
router.delete('/', ensureDbReady, requireAuth, deleteRelationship);

export default router;
