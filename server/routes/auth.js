import { Router } from 'express';
import { login, register } from '../controllers/authController.js';
import { ensureDbReady } from '../middleware/dbReady.js';

const router = Router();
router.post('/login', ensureDbReady, login);
router.post('/register', ensureDbReady, register);
export default router;
