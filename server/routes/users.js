import { Router } from 'express';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { ensureDbReady } from '../middleware/dbReady.js';

const router = Router();

router.get('/me', ensureDbReady, requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id).select('_id email');
  res.json(user);
});

export default router;
