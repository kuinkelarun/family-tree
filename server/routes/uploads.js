import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { uploadImageFromDataUrl } from '../controllers/uploadController.js';

const router = Router();

// Accepts JSON: { dataUrl: "data:image/png;base64,..." }
router.post('/', requireAuth, uploadImageFromDataUrl);

export default router;
