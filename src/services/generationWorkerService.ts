import { prisma } from "../config/db";
import { AIService } from "./aiService";
import { JobStatus } from "@prisma/client";
import { AppError } from "../utils/errors";

export class GenerationWorkerService {
  constructor(private readonly aiService: AIService) {}

  async processJob(jobId: string): Promise<void> {
    const job = await prisma.aIJob.findUnique({ where: { id: jobId } });
    if (!job) throw new AppError("Job not found", 404);

    await prisma.aIJob.update({
      where: { id: jobId },
      data: {
        status: JobStatus.PROCESSING,
        attempts: { increment: 1 },
      },
    });

    const { syllabusHash } = job.payload as { syllabusHash: string };
    const existing = await prisma.assessment.findUnique({ where: { syllabusHash } });

    if (existing) {
      await prisma.aIJob.update({
        where: { id: jobId },
        data: { status: JobStatus.COMPLETED, result: { assessmentId: existing.id } },
      });
      return;
    }

    const syllabi = await prisma.syllabus.findMany();
    const assessmentJson = await this.aiService.generateAssessment(
      syllabi.map((s) => ({ subjectName: s.subjectName, rawText: s.rawText }))
    );

    const created = await prisma.$transaction(async (tx) => {
      const assessment = await tx.assessment.create({
        data: {
          syllabusHash,
          content: assessmentJson,
        },
      });

      await tx.aIJobAttempt.create({
        data: {
          jobId,
          attempt: job.attempts + 1,
          status: JobStatus.COMPLETED,
        },
      });

      await tx.aIJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.COMPLETED,
          result: { assessmentId: assessment.id },
        },
      });

      return assessment;
    });

    void created;
  }

  async markFailed(jobId: string, error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const current = await prisma.aIJob.findUnique({ where: { id: jobId } });
    const attempt = (current?.attempts ?? 0) + 1;

    await prisma.$transaction(async (tx) => {
      await tx.aIJobAttempt.create({
        data: {
          jobId,
          attempt,
          status: JobStatus.FAILED,
          error: message,
        },
      });

      await tx.aIJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.FAILED,
          errorMessage: message,
        },
      });
    });
  }
}
