import { Router } from "express";
import multer from "multer";
import { AdminController } from "../controllers/adminController";
import { SessionController } from "../controllers/sessionController";
import { asyncHandler } from "../utils/asyncHandler";

const upload = multer({ storage: multer.memoryStorage() });
const adminController = new AdminController();
const sessionController = new SessionController();

export const router = Router();

router.post(
  "/admin/syllabus/upload",
  upload.array("files", 20),
  asyncHandler(adminController.uploadSyllabus.bind(adminController))
);
router.post(
  "/assessments/generate",
  asyncHandler(adminController.generateAssessment.bind(adminController))
);
router.get(
  "/jobs/:jobId",
  asyncHandler(adminController.getJobStatus.bind(adminController))
);

router.post(
  "/sessions/opt-in",
  asyncHandler(sessionController.optIn.bind(sessionController))
);
router.post(
  "/sessions/start",
  asyncHandler(sessionController.start.bind(sessionController))
);
router.post(
  "/sessions/:sessionId/submit-section",
  asyncHandler(sessionController.submitSection.bind(sessionController))
);
router.post(
  "/sessions/:sessionId/complete",
  asyncHandler(sessionController.complete.bind(sessionController))
);
router.get(
  "/sessions/:sessionId",
  asyncHandler(sessionController.getSession.bind(sessionController))
);
