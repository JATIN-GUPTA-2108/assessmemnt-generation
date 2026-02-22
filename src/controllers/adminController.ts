import { Request, Response } from "express";
import { SyllabusService } from "../services/syllabusService";
import { AssessmentService } from "../services/assessmentService";
import { AppError } from "../utils/errors";

const syllabusService = new SyllabusService();
const assessmentService = new AssessmentService();

export class AdminController {
  async uploadSyllabus(req: Request, res: Response) {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      throw new AppError("At least one PDF is required", 400);
    }

    const saved = await syllabusService.uploadFromPdfFiles(files);
    res.status(201).json({ count: saved.length, items: saved });
  }

  async generateAssessment(_req: Request, res: Response) {
    const data = await assessmentService.triggerGeneration();
    res.status(202).json(data);
  }

  async getJobStatus(req: Request, res: Response) {
    const job = await assessmentService.getJob(req.params.jobId);
    if (!job) throw new AppError("Job not found", 404);
    res.json(job);
  }
}
