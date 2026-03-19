# LLM Prompt Router (Intent Classifier)

This project is a Node.js service that routes user requests to specialized AI personas using a two-step flow:

1. Classify intent with a lightweight LLM call.
2. Route to an expert prompt and generate the final response.

Supported intents:

- `code`
- `data`
- `writing`
- `career`
- `unclear`

## Why This Design

A single giant prompt usually produces generic responses. This service uses intent-based routing so each request is handled by a focused persona prompt. It is cheaper and faster to run a short classification prompt first, then use a specialized generation prompt.

## Project Structure

```text
.
├── src/
│   ├── app.js            # CLI entry
│   ├── llmClient.js      # OpenAI call + deterministic mock mode
│   ├── logger.js         # JSONL route logging
│   ├── prompts.js        # classifier + persona prompts
│   ├── routerService.js  # classify_intent + route_and_respond
│   └── server.js         # HTTP API
├── tests/
│   ├── routerService.test.js
│   └── server.test.js
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── route_log.jsonl
```

## Core Functions

### `classify_intent(message)`

- Makes the first LLM call with a strict JSON-only classifier prompt.
- Returns:

```json
{
	"intent": "string",
	"confidence": 0.0
}
```

- Gracefully handles malformed classifier output and defaults to:

```json
{
	"intent": "unclear",
	"confidence": 0.0
}
```

### `route_and_respond(message, intent)`

- Looks up persona prompt by intent.
- Makes second LLM call for final response.
- If intent is `unclear`, returns a clarifying question instead of guessing.
- Logs each decision to `route_log.jsonl`.

## Expert Persona Prompts

Defined in `src/prompts.js` for:

- Code Expert
- Data Analyst
- Writing Coach
- Career Advisor

Each prompt is distinct, role-specific, and reusable from config (not hardcoded in business logic).

## Setup

### Requirements

- Node.js 20+

### Install

```bash
npm install
```

### Environment

Copy `.env.example` to `.env` and set values as needed.

Important variables:

- `OPENAI_API_KEY` (optional if `MOCK_LLM=true`)
- `OPENAI_MODEL_CLASSIFIER`
- `OPENAI_MODEL_GENERATION`
- `INTENT_CONFIDENCE_THRESHOLD`
- `MOCK_LLM`
- `PORT`
- `ROUTE_LOG_PATH`

By default, if no API key is provided, the app runs in deterministic mock mode for local testing.

## Run

### Start HTTP server

```bash
npm start
```

Health check:

```bash
curl http://localhost:3000/health
```

Route request:

```bash
curl -X POST http://localhost:3000/route \
	-H "Content-Type: application/json" \
	-d '{"message":"how do i sort a list of objects in python?"}'
```

### CLI mode

```bash
npm run cli -- "I'm preparing for a job interview, any tips?"
```

## Testing

Run tests:

```bash
npm test
```

The test suite covers:

- valid JSON classifier parsing
- malformed JSON fallback behavior
- confidence threshold handling
- routing behavior for `unclear`
- HTTP server endpoints
- a 15-message classification set (clear, ambiguous, typo-heavy, and unsupported prompts)

## Logging

Every request appends one JSON object line to `route_log.jsonl`.

`route_log.jsonl` is intentionally included in this repository as a submission artifact.

Each entry contains at least:

- `intent`
- `confidence`
- `user_message`
- `final_response`

Example:

```json
{"timestamp_utc":"2026-03-16T13:00:00.000Z","intent":"code","confidence":0.92,"user_message":"how do i sort a list?","final_response":"..."}
```

To generate fresh log entries locally:

```bash
npm run cli -- "help me debug a javascript function"
npm run cli -- "my paragraph sounds awkward, can you improve clarity?"
```

## Containerization

### Docker

```bash
docker build -t prompt-router .
docker run --rm -p 3000:3000 prompt-router
```

### Docker Compose

```bash
docker compose up --build
```

## Submission Artifacts Checklist

- Application code: `src/` and `tests/`
- Containerization files: `Dockerfile` and `docker-compose.yml`
- Documentation: `README.md`
- Environment template: `.env.example` (no secrets)
- Log artifact: `route_log.jsonl`

## Notes

- No secrets are committed.
- `.env.example` documents required environment variables.
- `route_log.jsonl` is generated and appended during runtime/testing.