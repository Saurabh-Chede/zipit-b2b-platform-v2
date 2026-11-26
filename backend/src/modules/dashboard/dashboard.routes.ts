import { Router } from 'express';
import { getBackendHealthController, getDashboardStatsController } from './dashboard.controller.ts';
import { authenticate } from '../../middleware/auth.ts';
import { authorizeRoles } from '../../middleware/rbac.ts';
import { UserRole } from '../../utils/constants.ts';

const dashboardRouter = Router();

dashboardRouter.get('/stats', authenticate, getDashboardStatsController);
dashboardRouter.get('/health', authenticate, authorizeRoles(UserRole.ADMIN), getBackendHealthController);

export { dashboardRouter };
