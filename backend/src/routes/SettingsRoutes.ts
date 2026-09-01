import { Router } from "express";
import { validate } from "@/middlewares/ValidateMiddleware";
import { SetupSettingsSchema, UpdateSettingsSchema } from "@/validators/SettingsSchemas";
import {
  setup,
  getByTelegramId,
  updateByTelegramId,
  getBalance,
} from "@/controllers/SettingsController";

const router = Router();

router.post("/setup", validate(SetupSettingsSchema), setup);
// Declared before /:telegramId so it isn't shadowed by the generic route.
router.get("/:telegramId/balance", getBalance);
router.get("/:telegramId", getByTelegramId);
router.patch("/:telegramId", validate(UpdateSettingsSchema), updateByTelegramId);

export default router;
