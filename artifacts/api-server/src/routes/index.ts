import { Router, type IRouter } from "express";
import healthRouter from "./health";
import catalogRouter from "./catalog";
import accountRouter from "./account";
import vendorRouter from "./vendors";
import commerceRouter from "./commerce";
import programsRouter from "./programs";
import affiliateRouter from "./affiliate";
import financeRouter from "./finance";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(catalogRouter);
router.use(accountRouter);
router.use(vendorRouter);
router.use(commerceRouter);
router.use(programsRouter);
router.use(affiliateRouter);
router.use(financeRouter);
router.use(adminRouter);

export default router;
