import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../middleware/auth.ts';
import { authorizeRoles } from '../../middleware/rbac.ts';
import { validateRequest } from '../../middleware/validate.ts';
import { UserRole } from '../../utils/constants.ts';
import { env } from '../../config/env.ts';
import {
  listSystemIncidents,
  sendRealtimeAlert,
  sendTestAlert,
} from '../../services/alerting.service.ts';
import {
  clientErrorReportSchema,
  listAlertsQuerySchema,
  testAlertSchema,
} from './alerts.validator.ts';

export const alertsRouter = Router();

const clientErrorLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: env.isTest ? 500 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many error reports submitted from this client.',
    errorCode: 'ALERT_RATE_LIMITED',
  },
});

alertsRouter.post(
  '/client-error',
  clientErrorLimiter,
  validateRequest({ body: clientErrorReportSchema }),
  async (req, res, next) => {
    try {
      const body = req.body as {
        severity: 'WARN' | 'ERROR' | 'FATAL';
        errorCode: string;
        message: string;
        route?: string;
        statusCode?: number;
        stack?: string;
        meta?: Record<string, unknown>;
      };

      const result = await sendRealtimeAlert({
        source: 'FRONTEND_UI',
        severity: body.severity,
        errorCode: body.errorCode,
        message: body.message,
        route: body.route,
        statusCode: body.statusCode,
        stack: body.stack,
        requestId: req.requestId,
        userId: req.user?.id,
        userRole: req.user?.role,
        meta: body.meta,
      });

      res.status(202).json({
        success: true,
        message: 'Incident captured.',
        data: {
          recorded: result.recorded,
          incidentId: result.incidentId,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

alertsRouter.get(
  '/',
  authenticate,
  authorizeRoles(UserRole.ADMIN),
  validateRequest({ query: listAlertsQuerySchema }),
  async (req, res, next) => {
    try {
      const data = await listSystemIncidents({
        severity: typeof req.query.severity === 'string' ? req.query.severity : undefined,
        source: typeof req.query.source === 'string' ? req.query.source : undefined,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        limit: Number(req.query.limit) || 50,
      });

      res.status(200).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  }
);

alertsRouter.post(
  '/test',
  authenticate,
  authorizeRoles(UserRole.ADMIN),
  validateRequest({ body: testAlertSchema }),
  async (req, res, next) => {
    try {
      const body = req.body as { message?: string };
      const data = await sendTestAlert(req.user?.email || 'admin@zipit.in', body.message);
      res.status(200).json({
        success: true,
        message: 'Test alert processed.',
        data,
      });
    } catch (err) {
      next(err);
    }
  }
);
