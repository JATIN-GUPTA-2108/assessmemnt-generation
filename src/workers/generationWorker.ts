import { Worker } from "bullmq";
import { redis } from "../config/queue";
import { AIService } from "../services/aiService";
import { GenerationWorkerService } from "../services/generationWorkerService";
import { logger } from "../utils/logger";

const service = new GenerationWorkerService(new AIService());

new Worker(
  "assessment-generation",
  async (job) => {
    try {
      await service.processJob(job.data.jobId as string);
    } catch (error) {
      await service.markFailed(job.data.jobId as string, error);
      throw error;
    }
  },
  { connection: redis }
);

logger.info("Generation worker started");
