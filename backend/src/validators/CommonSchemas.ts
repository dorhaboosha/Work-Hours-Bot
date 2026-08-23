import { z } from "zod";

/** Path params schema for any route taking only :telegramId (e.g. GET /workdays/status/:telegramId) */
export const TelegramIdParamSchema = z.object({
  telegramId: z.string().min(1, "telegramId is required"),
});

export type TelegramIdParams = z.infer<typeof TelegramIdParamSchema>;
