import { Router } from "express";
import { validate } from "@/middlewares/ValidateMiddleware";
import { SetupSettingsSchema, UpdateSettingsSchema } from "@/validators/SettingsSchemas";
import { setup, getByTelegramId, updateByTelegramId } from "@/controllers/SettingsController";

const router = Router();

router.post("/setup", validate(SetupSettingsSchema), setup);
router.get("/:telegramId", getByTelegramId);
router.patch("/:telegramId", validate(UpdateSettingsSchema), updateByTelegramId);

export default router;
