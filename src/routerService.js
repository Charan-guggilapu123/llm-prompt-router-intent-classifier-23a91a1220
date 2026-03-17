const { callLLM } = require("./llmClient");
const { logRouteDecision } = require("./logger");
const {
	CLASSIFIER_PROMPT,
	CLARIFYING_QUESTION,
	EXPERT_PROMPTS,
	SUPPORTED_INTENTS,
} = require("./prompts");

const OVERRIDE_REGEX = /^@(code|data|writing|career|unclear)\b\s*/i;

function clampConfidence(value) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) {
		return 0;
	}
	return Math.max(0, Math.min(1, Number(numeric.toFixed(3))));
}

function normalizeIntent(intent) {
	const candidate = String(intent || "").trim().toLowerCase();
	if (SUPPORTED_INTENTS.includes(candidate)) {
		return candidate;
	}
	return "unclear";
}

function extractLikelyJson(rawText) {
	const text = String(rawText || "").trim();
	if (!text) {
		return null;
	}

	const markdownMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
	if (markdownMatch && markdownMatch[1]) {
		return markdownMatch[1].trim();
	}

	const objectMatch = text.match(/\{[\s\S]*\}/);
	if (objectMatch) {
		return objectMatch[0];
	}

	return null;
}

function parseClassifierOutput(rawResponse) {
	const fallback = { intent: "unclear", confidence: 0.0 };
	if (typeof rawResponse !== "string") {
		return fallback;
	}

	const candidates = [rawResponse, extractLikelyJson(rawResponse)].filter(Boolean);
	for (const candidate of candidates) {
		try {
			const parsed = JSON.parse(candidate);
			return {
				intent: normalizeIntent(parsed.intent),
				confidence: clampConfidence(parsed.confidence),
			};
		} catch {
			continue;
		}
	}

	return fallback;
}

function extractManualOverride(message) {
	const text = String(message || "");
	const match = text.match(OVERRIDE_REGEX);

	if (!match) {
		return null;
	}

	return {
		intent: normalizeIntent(match[1]),
		cleanedMessage: text.replace(OVERRIDE_REGEX, "").trim(),
	};
}

function removeManualOverride(message) {
	return String(message || "").replace(OVERRIDE_REGEX, "").trim();
}

async function classify_intent(message, options = {}) {
	const userMessage = String(message || "").trim();
	const override = extractManualOverride(userMessage);

	if (override) {
		return { intent: override.intent, confidence: 1.0 };
	}

	const thresholdRaw =
		options.confidenceThreshold ?? process.env.INTENT_CONFIDENCE_THRESHOLD ?? 0.7;
	const threshold = Number.isFinite(Number(thresholdRaw))
		? Number(thresholdRaw)
		: 0.7;
	const llmCall = options.llmCall || callLLM;

	try {
		const rawResponse = await llmCall({
			systemPrompt: CLASSIFIER_PROMPT,
			userMessage,
			temperature: 0,
			maxTokens: 120,
			responseFormatJson: true,
		});

		const parsed = parseClassifierOutput(rawResponse);
		if (parsed.intent !== "unclear" && parsed.confidence < threshold) {
			return { intent: "unclear", confidence: parsed.confidence };
		}

		return parsed;
	} catch {
		return { intent: "unclear", confidence: 0.0 };
	}
}

async function route_and_respond(message, intentResult, options = {}) {
	const llmCall = options.llmCall || callLLM;
	const logWriter = options.logWriter || logRouteDecision;
	const userMessage = removeManualOverride(message);

	const normalizedIntent = normalizeIntent(intentResult?.intent);
	const confidence = clampConfidence(intentResult?.confidence);

	let finalResponse = CLARIFYING_QUESTION;

	if (normalizedIntent !== "unclear") {
		const systemPrompt = EXPERT_PROMPTS[normalizedIntent];

		try {
			finalResponse = await llmCall({
				systemPrompt,
				userMessage,
				intent: normalizedIntent,
				temperature: 0.3,
				maxTokens: 600,
			});
		} catch {
			finalResponse =
				"I ran into a generation error. Could you rephrase your request with a bit more detail?";
		}
	}

	await logWriter({
		intent: normalizedIntent,
		confidence,
		userMessage,
		finalResponse,
		logPath: options.logPath,
	});

	return finalResponse;
}

async function handleUserMessage(message, options = {}) {
	const intentResult = await classify_intent(message, options);
	const finalResponse = await route_and_respond(message, intentResult, options);

	return {
		intent: intentResult.intent,
		confidence: intentResult.confidence,
		final_response: finalResponse,
	};
}

module.exports = {
	classify_intent,
	route_and_respond,
	handleUserMessage,
	parseClassifierOutput,
	normalizeIntent,
};
