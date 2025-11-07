import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { getRecomputeQueue, postForceRetry, postRemoveJob, getRuleSeverities, patchRuleSeverities, deleteRuleSeverity, getValidationRulesMetadata } from '../controllers/adminController.js';
import { getValidateTree } from '../controllers/validationController.js';

const router = Router();

// Admin endpoints - require auth + admin role (ADMIN_EMAILS env controls allowed emails)
router.get('/recompute-queue', requireAuth, requireAdmin, getRecomputeQueue);
router.post('/recompute-queue/:jobId/retry', requireAuth, requireAdmin, postForceRetry);
router.delete('/recompute-queue/:jobId', requireAuth, requireAdmin, postRemoveJob);

// Validation endpoint (admin/editor per tree also checked inside controller)
router.get('/trees/:id/validate', requireAuth, requireAdmin, getValidateTree);

// Validation rule severity management (owner/editor check inside controllers)
// Allow authenticated owners/editors to manage severities; controllers enforce tree-level permissions.
router.get('/trees/:treeId/severities', requireAuth, getRuleSeverities);
router.patch('/trees/:treeId/severities', requireAuth, patchRuleSeverities);
router.delete('/trees/:treeId/severities/:ruleId', requireAuth, deleteRuleSeverity);
// Rule metadata is safe to expose to authenticated users (no tree data)
router.get('/validation/rules', requireAuth, getValidationRulesMetadata);

export default router;
