const http = require("node:http");
const { handleUserMessage } = require("./routerService");

function writeJson(res, statusCode, payload) {
	const body = JSON.stringify(payload);
	res.writeHead(statusCode, {
		"Content-Type": "application/json",
		"Content-Length": Buffer.byteLength(body),
	});
	res.end(body);
}

function readJsonBody(req) {
	return new Promise((resolve, reject) => {
		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
		});
		req.on("end", () => {
			if (!body.trim()) {
				resolve({});
				return;
			}

			try {
				resolve(JSON.parse(body));
			} catch {
				reject(new Error("Invalid JSON body"));
			}
		});
		req.on("error", (error) => reject(error));
	});
}

function createAppServer({ router = handleUserMessage } = {}) {
	return http.createServer(async (req, res) => {
		if (req.method === "GET" && req.url === "/health") {
			writeJson(res, 200, { status: "ok" });
			return;
		}

		if (req.method === "POST" && req.url === "/route") {
			try {
				const payload = await readJsonBody(req);
				const message = String(payload.message || "").trim();

				if (!message) {
					writeJson(res, 400, {
						error: "'message' is required and must be a non-empty string.",
					});
					return;
				}

				const result = await router(message);
				writeJson(res, 200, {
					intent: result.intent,
					confidence: result.confidence,
					response: result.final_response,
				});
				return;
			} catch (error) {
				const statusCode = error.message === "Invalid JSON body" ? 400 : 500;
				writeJson(res, statusCode, { error: error.message });
				return;
			}
		}

		writeJson(res, 404, { error: "Not found" });
	});
}

if (require.main === module) {
	const port = Number(process.env.PORT) || 3000;
	const server = createAppServer();

	server.listen(port, () => {
		console.log(`Prompt router server listening on port ${port}`);
	});
}

module.exports = {
	createAppServer,
};
