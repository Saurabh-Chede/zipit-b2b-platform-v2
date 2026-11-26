import { Router } from 'express';
import { getWalletController, rechargeWalletController } from './wallet.controller.ts';
import { authenticate } from '../../middleware/auth.ts';
import { authorizeRoles } from '../../middleware/rbac.ts';
import { validateRequest } from '../../middleware/validate.ts';
import { rechargeWalletSchema } from './wallet.validator.ts';
import { UserRole } from '../../utils/constants.ts';

const walletRouter = Router();

walletRouter.use(authenticate, authorizeRoles(UserRole.SELLER));

walletRouter.get('/', getWalletController);
walletRouter.post('/recharge', validateRequest({ body: rechargeWalletSchema }), rechargeWalletController);

export { walletRouter };
