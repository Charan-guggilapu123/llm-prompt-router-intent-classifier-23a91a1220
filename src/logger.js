const fs = require("node:fs/promises");
const path = require("node:path");

function resolveLogPath(customPath) {
  const configuredPath = customPath || process.env.ROUTE_LOG_PATH || "route_log.jsonl";
  return path.resolve(process.cwd(), configuredPath);
}

async function logRouteDecision({
  intent,
  confidence,
  userMessage,
  finalResponse,
  logPath,
}) {
  const targetPath = resolveLogPath(logPath);

  const entry = {
    timestamp_utc: new Date().toISOString(),
    intent: String(intent || "unclear"),
    confidence: Number.isFinite(Number(confidence)) ? Number(confidence) : 0,
    user_message: String(userMessage || ""),
    final_response: String(finalResponse || ""),
  };

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.appendFile(targetPath, `${JSON.stringify(entry)}\n`, "utf8");

  return entry;
}

module.exports = {
  logRouteDecision,
  resolveLogPath,
};