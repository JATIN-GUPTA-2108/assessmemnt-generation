import crypto from "crypto";

export const hashText = (value: string): string =>
  crypto.createHash("sha256").update(value).digest("hex");
