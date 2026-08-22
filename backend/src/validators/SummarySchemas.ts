// V1.1: week and month summaries always use the current period in the user's
// timezone. No query parameters are accepted for these endpoints.

import { z } from "zod";

/** Path params schema for GET /summaries/week/:telegramId and /month/:telegramId */
export const TelegramIdParamSchema = z.object({
  telegramId: z.string().min(1, "telegramId is required"),
});

export type TelegramIdParams = z.infer<typeof TelegramIdParamSchema>;
