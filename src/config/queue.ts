import { Queue, type ConnectionOptions } from "bullmq";
import { env } from "./env";

export const redisConnection: ConnectionOptions = {
  url: env.REDIS_URL,
  maxRetriesPerRequest: null,
};

export const generationQueue = new Queue("assessment-generation", {
  connection: redisConnection,
});

export const evaluationQueue = new Queue("assessment-evaluation", {
  connection: redisConnection,
});
