import pdfParse from "pdf-parse";
import { prisma } from "../config/db";

export class SyllabusService {
  async uploadFromPdfFiles(files: Express.Multer.File[]) {
    const rows = [] as { subjectName: string; rawText: string; sourceFile: string }[];

    for (const file of files) {
      const parsed = await pdfParse(file.buffer);
      rows.push({
        subjectName: file.originalname.replace(/\.pdf$/i, ""),
        rawText: parsed.text || "",
        sourceFile: file.originalname,
      });
    }

    if (rows.length === 0) return [];

    await prisma.syllabus.createMany({ data: rows });

    return prisma.syllabus.findMany({
      orderBy: { createdAt: "desc" },
      take: rows.length,
    });
  }
}
