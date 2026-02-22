import { Worker } from "bullmq";
import { redisConnection } from "../config/queue";
import { AIService } from "../services/aiService";
import { EvaluationService } from "../services/evaluationService";
import { logger } from "../utils/logger";

const service = new EvaluationService(new AIService());

new Worker(
  "assessment-evaluation",
  async (job) => {
    try {
      await service.evaluateJob(job.data.jobId as string);
    } catch (error) {
      await service.markFailed(job.data.jobId as string, error);
      throw error;
    }
  },
  { connection: redisConnection }
);

logger.info("Evaluation worker started");
