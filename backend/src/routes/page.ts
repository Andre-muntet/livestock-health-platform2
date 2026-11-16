import { Router } from "express";
import { confirmUserProfile, getUser } from "../controller/auth.ts";
import { authenticate } from "../packages/middleware/page.ts";

const router = Router();

router.post("/confirm-profile", authenticate, confirmUserProfile);
router.get("/get-profile", authenticate, getUser);

export default router;