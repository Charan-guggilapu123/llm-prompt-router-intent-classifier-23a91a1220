const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");

const { createAppServer } = require("../src/server");

function requestJson({ port, path, method = "GET", payload }) {
  return new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : "";

    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            body: raw ? JSON.parse(raw) : {},
          });
        });
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

test("GET /health returns ok", async () => {
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, resolve));

  const port = server.address().port;
  const response = await requestJson({ port, path: "/health" });
  server.close();

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "ok");
});

test("POST /route returns routed response", async () => {
  const server = createAppServer({
    router: async () => ({
      intent: "code",
      confidence: 0.95,
      final_response: "Use sorted(items, key=lambda x: x.id)",
    }),
  });

  await new Promise((resolve) => server.listen(0, resolve));

  const port = server.address().port;
  const response = await requestJson({
    port,
    path: "/route",
    method: "POST",
    payload: { message: "sort list" },
  });
  server.close();

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.intent, "code");
  assert.equal(response.body.confidence, 0.95);
  assert.equal(response.body.response, "Use sorted(items, key=lambda x: x.id)");
});

test("POST /route rejects missing message", async () => {
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, resolve));

  const port = server.address().port;
  const response = await requestJson({
    port,
    path: "/route",
    method: "POST",
    payload: {},
  });
  server.close();

  assert.equal(response.statusCode, 400);
  assert.match(response.body.error, /message/);
});