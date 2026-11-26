import { Router } from 'express';
import {
  createTicketController,
  getTicketController,
  listTicketsController,
  replyTicketController,
  updateTicketStatusController,
} from './support.controller.ts';
import { authenticate } from '../../middleware/auth.ts';
import { authorizeRoles } from '../../middleware/rbac.ts';
import { validateRequest } from '../../middleware/validate.ts';
import {
  createTicketSchema,
  replyTicketSchema,
  updateTicketStatusSchema,
} from './support.validator.ts';
import { UserRole } from '../../utils/constants.ts';

const supportRouter = Router();

supportRouter.use(authenticate);

supportRouter.get('/', listTicketsController);
supportRouter.post(
  '/',
  authorizeRoles(UserRole.SELLER, UserRole.TRANSPORTER),
  validateRequest({ body: createTicketSchema }),
  createTicketController
);
supportRouter.get('/:id', getTicketController);
supportRouter.post(
  '/:id/messages',
  validateRequest({ body: replyTicketSchema }),
  replyTicketController
);
supportRouter.patch(
  '/:id/status',
  validateRequest({ body: updateTicketStatusSchema }),
  updateTicketStatusController
);

export { supportRouter };
