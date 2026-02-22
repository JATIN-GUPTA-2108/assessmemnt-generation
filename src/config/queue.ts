import IORedis from "ioredis";
import { Queue } from "bullmq";
import { env } from "./env";

export const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const generationQueue = new Queue("assessment-generation", {
  connection: redis,
});

export const evaluationQueue = new Queue("assessment-evaluation", {
  connection: redis,
});
