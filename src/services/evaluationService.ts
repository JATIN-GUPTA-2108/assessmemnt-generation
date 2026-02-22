import { JobStatus, Prisma, SessionStatus } from "@prisma/client";
import { prisma } from "../config/db";
import { AIService } from "./aiService";
import { AppError } from "../utils/errors";

export class EvaluationService {
  constructor(private readonly aiService: AIService) {}

  async evaluateJob(jobId: string): Promise<void> {
    const job = await prisma.aIJob.findUnique({ where: { id: jobId } });
    if (!job) throw new AppError("Job not found", 404);

    await prisma.aIJob.update({
      where: { id: jobId },
      data: { status: JobStatus.PROCESSING, attempts: { increment: 1 } },
    });

    const sessionId = (job.payload as { sessionId: string }).sessionId;
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { submissions: true, assessment: true },
    });

    if (!session) throw new AppError("Session not found", 404);
    if (session.status !== SessionStatus.COMPLETED) {
      throw new AppError("Session not completed", 409);
    }

    const result = await this.aiService.evaluateSubmission({
      assessment: session.assessment.content,
      answers: session.submissions,
    });

    await prisma.$transaction(async (tx) => {
      await tx.aIJobAttempt.create({
        data: {
          jobId,
          attempt: job.attempts + 1,
          status: JobStatus.COMPLETED,
        },
      });

      await tx.aIJob.update({
        where: { id: jobId },
        data: { status: JobStatus.COMPLETED, result: result as Prisma.InputJsonValue },
      });
    });
  }

  async markFailed(jobId: string, error: unknown): Promise<void> {
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
