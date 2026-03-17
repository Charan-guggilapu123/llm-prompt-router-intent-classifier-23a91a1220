const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
	classify_intent,
	handleUserMessage,
	parseClassifierOutput,
	route_and_respond,
} = require("../src/routerService");
const { CLARIFYING_QUESTION } = require("../src/prompts");

test("classify_intent returns parsed JSON schema", async () => {
	const llmCall = async () => '{"intent":"code","confidence":0.92}';
	const result = await classify_intent("how do i sort a list", { llmCall });

	assert.equal(result.intent, "code");
	assert.equal(result.confidence, 0.92);
});

test("classify_intent falls back to unclear on invalid classifier output", async () => {
	const llmCall = async () => "not-valid-json";
	const result = await classify_intent("hello", { llmCall });

	assert.equal(result.intent, "unclear");
	assert.equal(result.confidence, 0);
});

test("classify_intent applies confidence threshold", async () => {
	const llmCall = async () => '{"intent":"career","confidence":0.5}';
	const result = await classify_intent("interview tips", {
		llmCall,
		confidenceThreshold: 0.7,
	});

	assert.equal(result.intent, "unclear");
	assert.equal(result.confidence, 0.5);
});

test("route_and_respond asks clarifying question for unclear intent", async () => {
	const logs = [];
	const response = await route_and_respond(
		"help",
		{ intent: "unclear", confidence: 0.2 },
		{
			logWriter: async (entry) => {
				logs.push(entry);
			},
		}
	);

	assert.equal(response, CLARIFYING_QUESTION);
	assert.equal(logs.length, 1);
	assert.equal(logs[0].intent, "unclear");
	assert.equal(typeof logs[0].finalResponse, "string");
});

test("route_and_respond maps intent to persona prompt and calls LLM", async () => {
	let receivedIntent = null;

	const llmCall = async ({ intent }) => {
		receivedIntent = intent;
		return "generated code response";
	};

	const response = await route_and_respond(
		"fix bug",
		{ intent: "code", confidence: 0.9 },
		{
			llmCall,
			logWriter: async () => {},
		}
	);

	assert.equal(receivedIntent, "code");
	assert.equal(response, "generated code response");
});

test("parseClassifierOutput tolerates markdown-wrapped JSON", () => {
	const parsed = parseClassifierOutput(
		"```json\n{\n  \"intent\": \"data\",\n  \"confidence\": 0.83\n}\n```"
	);

	assert.equal(parsed.intent, "data");
	assert.equal(parsed.confidence, 0.83);
});

test("handleUserMessage logs intent, confidence, user_message, and final_response", async () => {
	process.env.MOCK_LLM = "true";
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "prompt-router-"));
	const tempLogPath = path.join(tempDir, "route_log.jsonl");

	const result = await handleUserMessage("how do i sort a list of objects in python?", {
		confidenceThreshold: 0.5,
		logPath: tempLogPath,
	});

	const logText = await fs.readFile(tempLogPath, "utf8");
	const entry = JSON.parse(logText.trim());

	assert.equal(typeof result.final_response, "string");
	assert.equal(entry.intent, result.intent);
	assert.equal(typeof entry.confidence, "number");
	assert.equal(entry.user_message, "how do i sort a list of objects in python?");
	assert.equal(entry.final_response, result.final_response);
});

test("sample classification set (15 messages)", async () => {
	process.env.MOCK_LLM = "true";

	const samples = [
		["how do i sort a list of objects in python?", "code"],
		["explain this sql query for me", "code"],
		["This paragraph sounds awkward, can you help me fix it?", "writing"],
		["I'm preparing for a job interview, any tips?", "career"],
		["what's the average of these numbers: 12, 45, 23, 67, 34", "data"],
		["Help me make this better.", "unclear"],
		[
			"I need to write a function that takes a user id and returns their profile, but also i need help with my resume.",
			"unclear",
		],
		["hey", "unclear"],
		["Can you write me a poem about clouds?", "unclear"],
		["Rewrite this sentence to be more professional.", "writing"],
		["I'm not sure what to do with my career.", "career"],
		["what is a pivot table", "data"],
		["fxi thsi bug pls: for i in range(10) print(i)", "code"],
		["How do I structure a cover letter?", "career"],
		["My boss says my writing is too verbose.", "writing"],
	];

	for (const [message, expectedIntent] of samples) {
		const result = await classify_intent(message, { confidenceThreshold: 0.5 });
		assert.equal(result.intent, expectedIntent, `message: ${message}`);
	}
});
