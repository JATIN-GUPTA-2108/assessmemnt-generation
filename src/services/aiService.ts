import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env";

type SyllabusInput = {
  subjectName: string;
  rawText: string;
};

export class AIService {
  private client = env.GEMINI_API_KEY
    ? new GoogleGenerativeAI(env.GEMINI_API_KEY)
    : null;

  async generateAssessment(syllabi: SyllabusInput[]): Promise<unknown> {
    if (!this.client) {
      return {
        subjects: syllabi.map((s, idx) => ({
          name: s.subjectName,
          sections: [
            {
              title: `Core Concepts ${idx + 1}`,
              max_score: 10,
              questions: [
                {
                  id: "Q1",
                  question: `Explain one core concept from ${s.subjectName}.`,
                  max_score: 5,
                  difficulty: "medium",
                },
                {
                  id: "Q2",
                  question: `Solve one applied problem from ${s.subjectName}.`,
                  max_score: 5,
                  difficulty: "hard",
                },
              ],
            },
          ],
        })),
      };
    }

    const model = this.client.getGenerativeModel({ model: env.AI_MODEL });
    const prompt = [
      "Generate a structured assessment JSON.",
      "Rules: return valid JSON only, no markdown.",
      "Format: { subjects: [{ name, sections:[{ title, max_score, questions:[{id,question,max_score,difficulty}] }]}] }",
      "Each subject needs sections and each section must have 3-5 questions.",
      `Input syllabi: ${JSON.stringify(syllabi)}`,
    ].join("\n");

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return JSON.parse(text);
  }

  async evaluateSubmission(payload: {
    assessment: unknown;
    answers: unknown;
  }): Promise<unknown> {
    if (!this.client) {
      return { score: 75, feedback: "Mock evaluation result." };
    }

    const model = this.client.getGenerativeModel({ model: env.AI_MODEL });
    const prompt = [
      "Evaluate this completed assessment submission.",
      "Return valid JSON only: { score:number, feedback:string, section_breakdown:array }",
      JSON.stringify(payload),
    ].join("\n");

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
  }
}
