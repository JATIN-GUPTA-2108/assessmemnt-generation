import { JobStatus, Prisma, SessionStatus } from "@prisma/client";
import { prisma } from "../config/db";
import { evaluationQueue } from "../config/queue";
import { AppError } from "../utils/errors";

const INACTIVITY_MS = 30 * 60 * 1000;

export class SessionService {
  private async expireIfInactive(tx: Prisma.TransactionClient, sessionId: string) {
    const session = await tx.session.findUnique({ where: { id: sessionId } });
    if (!session || session.status !== SessionStatus.ACTIVE || !session.lastActivityAt) {
      return session;
    }

    if (Date.now() - session.lastActivityAt.getTime() > INACTIVITY_MS) {
      await tx.session.update({
        where: { id: session.id },
        data: { status: SessionStatus.EXPIRED },
      });
      throw new AppError("Session expired due to inactivity", 409);
    }

    return session;
  }

  async optIn(userId: string, assessmentId: string) {
    const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
    if (!assessment) throw new AppError("Assessment not found", 404);

    const content = assessment.content as { subjects?: Array<{ sections?: unknown[] }> };
    const totalSections =
      content.subjects?.reduce(
        (acc, subject) => acc + (subject.sections?.length ?? 0),
        0
      ) ?? 0;

    if (totalSections === 0) {
      throw new AppError("Assessment has no sections", 400);
    }

    return prisma.session.create({
      data: {
        userId,
        assessmentId,
        status: SessionStatus.OPTED_IN,
        totalSections,
      },
    });
  }

  async start(sessionId: string, userId: string) {
    return prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

        await tx.session.updateMany({
          where: {
            userId,
            status: SessionStatus.ACTIVE,
            lastActivityAt: { lt: new Date(Date.now() - INACTIVITY_MS) },
          },
          data: { status: SessionStatus.EXPIRED },
        });

        const activeCount = await tx.session.count({
          where: { userId, status: SessionStatus.ACTIVE },
        });
        if (activeCount > 0) {
          throw new AppError("User already has an ACTIVE session", 409);
        }

        const updated = await tx.session.updateMany({
          where: { id: sessionId, userId, status: SessionStatus.OPTED_IN },
          data: {
            status: SessionStatus.ACTIVE,
            startedAt: new Date(),
            lastActivityAt: new Date(),
          },
        });

        if (updated.count === 0) {
          throw new AppError("Session must be in OPTED_IN state", 409);
        }

        return tx.session.findUnique({ where: { id: sessionId } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  async submitSection(input: {
    sessionId: string;
    userId: string;
    sectionId: string;
    sectionIndex: number;
    answers: unknown;
  }) {
    return prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.sessionId}))`;

        const session = await this.expireIfInactive(tx, input.sessionId);
        if (!session || session.userId !== input.userId) {
          throw new AppError("Session not found", 404);
        }
        if (session.status !== SessionStatus.ACTIVE) {
          throw new AppError("Session is not ACTIVE", 409);
        }

        if (session.currentSectionIndex !== input.sectionIndex) {
          throw new AppError("Sections must be submitted in strict order", 409);
        }

        await tx.sectionSubmission.create({
          data: {
            sessionId: input.sessionId,
            sectionId: input.sectionId,
            sectionIndex: input.sectionIndex,
            answers: input.answers as Prisma.InputJsonValue,
          },
        });

        await tx.session.update({
          where: { id: input.sessionId },
          data: {
            currentSectionIndex: { increment: 1 },
            lastActivityAt: new Date(),
          },
        });

        return { ok: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  async complete(sessionId: string, userId: string) {
    return prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${sessionId}))`;

        const session = await this.expireIfInactive(tx, sessionId);
        if (!session || session.userId !== userId) {
          throw new AppError("Session not found", 404);
        }
        if (session.status !== SessionStatus.ACTIVE) {
          throw new AppError("Session is not ACTIVE", 409);
        }

        if (session.currentSectionIndex !== session.totalSections) {
          throw new AppError("All sections must be submitted before completion", 409);
        }

        const updated = await tx.session.updateMany({
          where: {
            id: sessionId,
            status: SessionStatus.ACTIVE,
            currentSectionIndex: session.totalSections,
          },
          data: {
            status: SessionStatus.COMPLETED,
            completedAt: new Date(),
            lastActivityAt: new Date(),
          },
        });

        if (updated.count === 0) {
          throw new AppError("Session completion conflict", 409);
        }

        let evalJobId: string | null = null;
        try {
          const evalJob = await tx.aIJob.create({
            data: {
              type: "EVALUATION",
              status: JobStatus.PENDING,
              dedupeKey: `evaluation:${sessionId}`,
              payload: { sessionId },
            },
          });
          evalJobId = evalJob.id;
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            const existing = await tx.aIJob.findFirst({
              where: { dedupeKey: `evaluation:${sessionId}` },
            });
            evalJobId = existing?.id || null;
          } else {
            throw error;
          }
        }

        if (evalJobId) {
          await evaluationQueue.add(
            "evaluate-session",
            { jobId: evalJobId },
            {
              jobId: evalJobId,
              attempts: 3,
              backoff: { type: "exponential", delay: 500 },
              removeOnComplete: 100,
            }
          );
        }

        return { ok: true, evaluationJobId: evalJobId };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  async getSession(sessionId: string, userId: string) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { submissions: true },
    });

    if (!session || session.userId !== userId) {
      throw new AppError("Session not found", 404);
    }

    return session;
  }
}
