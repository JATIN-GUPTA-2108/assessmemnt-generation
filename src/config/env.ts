import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  GEMINI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("gemini-1.5-flash"),
  AI_MAX_RETRIES: z.coerce.number().default(3),
  AI_INITIAL_BACKOFF_MS: z.coerce.number().default(500),
});

export const env = envSchema.parse(process.env);
