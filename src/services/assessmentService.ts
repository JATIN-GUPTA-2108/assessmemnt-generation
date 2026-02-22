import { JobStatus, JobType, Prisma } from "@prisma/client";
import { generationQueue, prisma } from "../config";
import { hashText } from "../utils/hash";
import { AppError } from "../utils/errors";

export class AssessmentService {
  async triggerGeneration(): Promise<{ jobId: string; status: JobStatus }> {
    const syllabi = await prisma.syllabus.findMany();
    if (syllabi.length === 0) {
      throw new AppError("No syllabus uploaded", 400);
    }

    const syllabusHash = hashText(
      syllabi
        .map((s) => `${s.subjectName}:${s.rawText}`)
        .sort()
        .join("||")
    );

    const existingAssessment = await prisma.assessment.findUnique({
      where: { syllabusHash },
    });

    if (existingAssessment) {
      const completedJob = await prisma.aIJob.findFirst({
        where: {
          type: JobType.GENERATION,
          dedupeKey: `generation:${syllabusHash}`,
          status: JobStatus.COMPLETED,
        },
      });

      if (completedJob) {
        return { jobId: completedJob.id, status: completedJob.status };
      }
    }

    let jobId: string;
    let jobStatus: JobStatus;

    try {
      const created = await prisma.aIJob.create({
        data: {
          type: JobType.GENERATION,
          status: JobStatus.PENDING,
          dedupeKey: `generation:${syllabusHash}`,
          payload: { syllabusHash },
        },
      });
      jobId = created.id;
      jobStatus = created.status;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existing = await prisma.aIJob.findFirstOrThrow({
          where: { dedupeKey: `generation:${syllabusHash}` },
        });
        return { jobId: existing.id, status: existing.status };
      }
      throw error;
    }

    await generationQueue.add(
      "generate-assessment",
      { jobId },
      {
        jobId,
        attempts: 3,
        backoff: { type: "exponential", delay: 500 },
        removeOnComplete: 100,
      }
    );

    return { jobId, status: jobStatus };
  }

  async getJob(jobId: string) {
    return prisma.aIJob.findUnique({ where: { id: jobId } });
  }
}
