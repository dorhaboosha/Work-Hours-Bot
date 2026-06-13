import { Router } from "express";
import { validate } from "@/middlewares/ValidateMiddleware";
import { SetupSettingsSchema } from "@/validators/SettingsSchemas";
import { setup, getByTelegramId } from "@/controllers/SettingsController";

const router = Router();

router.post("/setup", validate(SetupSettingsSchema), setup);
router.get("/:telegramId", getByTelegramId);

export default router;
