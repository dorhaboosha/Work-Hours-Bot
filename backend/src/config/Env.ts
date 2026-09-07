import { z } from "zod";

const envSchema = z.object({
  PORT: z
    .string()
    .default("3000")
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  // Your own numeric Telegram user ID (not @username). Every command/message
  // from anyone else is silently ignored — this bot is personal, single-user.
  // Get yours by messaging https://t.me/userinfobot from your Telegram account.
  OWNER_TELEGRAM_ID: z
    .string()
    .regex(/^\d+$/, "OWNER_TELEGRAM_ID must be a numeric Telegram user ID"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  for (const issue of parsed.error.issues) {
    console.error(` - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const Env = parsed.data;
