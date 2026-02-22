import { Request, Response } from "express";
import { SessionService } from "../services/sessionService";

const sessionService = new SessionService();

export class SessionController {
  async optIn(req: Request, res: Response) {
    const { userId, assessmentId } = req.body;
    const session = await sessionService.optIn(userId, assessmentId);
    res.status(201).json(session);
  }

  async start(req: Request, res: Response) {
    const { sessionId, userId } = req.body;
    const session = await sessionService.start(sessionId, userId);
    res.json(session);
  }

  async submitSection(req: Request, res: Response) {
    const { userId, sectionId, sectionIndex, answers } = req.body;
    const result = await sessionService.submitSection({
      sessionId: req.params.sessionId,
      userId,
      sectionId,
      sectionIndex,
      answers,
    });
    res.json(result);
  }

  async complete(req: Request, res: Response) {
    const { userId } = req.body;
    const result = await sessionService.complete(req.params.sessionId, userId);
    res.json(result);
  }

  async getSession(req: Request, res: Response) {
    const { userId } = req.query as { userId: string };
    const session = await sessionService.getSession(req.params.sessionId, userId);
    res.json(session);
  }
}
