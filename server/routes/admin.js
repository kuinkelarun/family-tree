import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { getRecomputeQueue, postForceRetry, postRemoveJob, getRuleSeverities, patchRuleSeverities, deleteRuleSeverity, getValidationRulesMetadata, listTrees, getTreeDetails, postArchiveTree, postTransferTree, deleteTree, bulkTreesAction, getGlobalSeverities, patchGlobalSeverities, deleteGlobalSeverity } from '../controllers/adminController.js';
import { getValidateTree } from '../controllers/validationController.js';

const router = Router();

// Admin endpoints - require auth + admin role (ADMIN_EMAILS env controls allowed emails)
router.get('/recompute-queue', requireAuth, requireAdmin, getRecomputeQueue);
router.post('/recompute-queue/:jobId/retry', requireAuth, requireAdmin, postForceRetry);
router.delete('/recompute-queue/:jobId', requireAuth, requireAdmin, postRemoveJob);

// Validation endpoint (admin/editor per tree also checked inside controller)
router.get('/trees/:id/validate', requireAuth, requireAdmin, getValidateTree);

// Admin Trees listing & management
// Allow authenticated users to fetch trees; controller will restrict data for non-admins
router.get('/trees', requireAuth, listTrees);
router.get('/trees/:id', requireAuth, getTreeDetails);
router.post('/trees/:id/archive', requireAuth, requireAdmin, postArchiveTree);
router.post('/trees/:id/transfer', requireAuth, requireAdmin, postTransferTree);
router.delete('/trees/:id', requireAuth, requireAdmin, deleteTree);
router.post('/trees/bulk', requireAuth, requireAdmin, bulkTreesAction);

// Validation rule severity management (owner/editor check inside controllers)
// Allow authenticated owners/editors to manage severities; controllers enforce tree-level permissions.
router.get('/trees/:treeId/severities', requireAuth, getRuleSeverities);
router.patch('/trees/:treeId/severities', requireAuth, patchRuleSeverities);
router.delete('/trees/:treeId/severities/:ruleId', requireAuth, deleteRuleSeverity);
// Rule metadata is safe to expose to authenticated users (no tree data)
router.get('/validation/rules', requireAuth, getValidationRulesMetadata);
// Global severities (admins only)
router.get('/validation/global-severities', requireAuth, requireAdmin, getGlobalSeverities);
router.patch('/validation/global-severities', requireAuth, requireAdmin, patchGlobalSeverities);
router.delete('/validation/global-severities/:ruleId', requireAuth, requireAdmin, deleteGlobalSeverity);

export default router;
