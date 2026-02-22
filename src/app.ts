import express from "express";
import pinoHttp from "pino-http";
import { router } from "./routes";
import { errorHandler } from "./middlewares/errorHandler";
import { logger } from "./utils/logger";

export const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(pinoHttp({ logger }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use(router);
app.use(errorHandler);
