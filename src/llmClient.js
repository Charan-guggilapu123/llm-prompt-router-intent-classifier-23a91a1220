function shouldUseMock() {
	const mockValue = (process.env.MOCK_LLM || "").trim().toLowerCase();

	if (mockValue === "true") {
		return true;
	}

	if (mockValue === "false") {
		return false;
	}

	return !process.env.OPENAI_API_KEY;
}

function clampConfidence(value) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) {
		return 0;
	}
	return Math.max(0, Math.min(1, Number(numeric.toFixed(3))));
}

function scoreIntent(message) {
	const text = String(message || "").toLowerCase();
	const scores = {
		code: 0,
		data: 0,
		writing: 0,
		career: 0,
	};

	if (!text.trim() || text.trim().length < 3) {
		return { intent: "unclear", confidence: 0.05 };
	}

	if (/\b(poem|song|story|joke|riddle|lyrics)\b/.test(text)) {
		return { intent: "unclear", confidence: 0.25 };
	}

	const codePatterns = [
		/\b(code|coding|debug|bug|function|class|array|list|loop|syntax|compile|stack|algorithm|python|javascript|typescript|java|c\+\+|c#|sql query|api|endpoint)\b/,
		/\bprint\(|for\s+\w+\s+in\s+range\(/,
	];
	const dataPatterns = [
		/\b(data|dataset|analytics?|analysis|average|mean|median|pivot table|correlation|distribution|outlier|trend|variance|numbers)\b/,
		/\b(bar chart|line chart|histogram|scatter|visuali[sz]ation)\b/,
	];
	const writingPatterns = [
		/\b(writing|paragraph|sentence|rewrite|rephrase|grammar|clarity|tone|awkward|verbose|professional|passive voice|editing?)\b/,
	];
	const careerPatterns = [
		/\b(career|job|resume|cv|interview|cover letter|promotion|role|hiring|salary|networking)\b/,
	];

	for (const pattern of codePatterns) {
		if (pattern.test(text)) {
			scores.code += 2;
		}
	}
	for (const pattern of dataPatterns) {
		if (pattern.test(text)) {
			scores.data += 2;
		}
	}
	for (const pattern of writingPatterns) {
		if (pattern.test(text)) {
			scores.writing += 2;
		}
	}
	for (const pattern of careerPatterns) {
		if (pattern.test(text)) {
			scores.career += 2;
		}
	}

	if (/\bsql\b/.test(text) && !/\baverage|mean|distribution|pivot\b/.test(text)) {
		scores.code += 1;
	}

	const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
	const [bestIntent, bestScore] = ranked[0];
	const secondScore = ranked[1] ? ranked[1][1] : 0;

	if (bestScore === 0) {
		return { intent: "unclear", confidence: 0.15 };
	}

	if (bestScore > 0 && secondScore > 0 && Math.abs(bestScore - secondScore) <= 1) {
		return { intent: "unclear", confidence: 0.45 };
	}

	const confidence = clampConfidence(0.58 + bestScore * 0.11);
	return { intent: bestIntent, confidence };
}

function mockGeneration(intent, userMessage) {
	switch (intent) {
		case "code":
			return [
				"Here is a production-minded coding approach:",
				"1. Validate inputs and handle edge cases first.",
				"2. Use clear, idiomatic code for the target language.",
				"3. Add at least one happy-path and one failure-path test.",
				`Request: ${userMessage}`,
			].join("\n");
		case "data":
			return [
				"From a data-analysis perspective:",
				"- Focus on distribution, central tendency, and anomalies.",
				"- Check for outliers and potential correlation drivers.",
				"- A bar chart or histogram is often a strong first visualization.",
				`Request: ${userMessage}`,
			].join("\n");
		case "writing":
			return [
				"Writing feedback:",
				"- Tighten sentence structure and remove filler words.",
				"- Prefer active voice and consistent tone.",
				"- Identify one paragraph to simplify for clarity.",
				`Request: ${userMessage}`,
			].join("\n");
		case "career":
			return [
				"Before I recommend next steps, please clarify:",
				"1. What role are you targeting next?",
				"2. What is your current experience level?",
				"3. What is your timeline?",
			].join("\n");
		default:
			return "Could you clarify your goal? Are you asking for help with coding, data analysis, writing feedback, or career advice?";
	}
}

async function callOpenAI({
	systemPrompt,
	userMessage,
	model,
	temperature = 0.2,
	maxTokens = 500,
	responseFormatJson = false,
}) {
	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) {
		throw new Error("OPENAI_API_KEY is not set. Enable MOCK_LLM=true for local testing.");
	}

	const selectedModel =
		model ||
		(responseFormatJson
			? process.env.OPENAI_MODEL_CLASSIFIER || "gpt-4o-mini"
			: process.env.OPENAI_MODEL_GENERATION || "gpt-4o-mini");

	const payload = {
		model: selectedModel,
		messages: [
			{ role: "system", content: systemPrompt },
			{ role: "user", content: userMessage },
		],
		temperature,
		max_tokens: maxTokens,
	};

	if (responseFormatJson) {
		payload.response_format = { type: "json_object" };
	}

	const response = await fetch("https://api.openai.com/v1/chat/completions", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		const errorBody = await response.text();
		throw new Error(`OpenAI request failed (${response.status}): ${errorBody}`);
	}

	const data = await response.json();
	const content = data?.choices?.[0]?.message?.content;
	if (typeof content !== "string" || !content.trim()) {
		throw new Error("OpenAI returned an empty completion.");
	}

	return content.trim();
}

async function callLLM(options) {
	const {
		systemPrompt,
		userMessage,
		responseFormatJson = false,
		intent = "unclear",
	} = options;

	if (shouldUseMock()) {
		if (responseFormatJson) {
			return JSON.stringify(scoreIntent(userMessage));
		}
		return mockGeneration(intent, userMessage);
	}

	return callOpenAI({ systemPrompt, userMessage, ...options });
}

module.exports = {
	callLLM,
	callOpenAI,
	shouldUseMock,
	scoreIntent,
};
