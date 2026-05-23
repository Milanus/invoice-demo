import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/extract/route.js";

const ENV_KEYS = [
  "RUNPOD_API_KEY",
  "RUNPOD_GLM_RUNSYNC_URL",
  "RUNPOD_QWEN_RUNSYNC_URL",
  "RUNPOD_TIMEOUT_MS",
];

const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const ORIGINAL_FETCH = globalThis.fetch;

function applyTestEnv() {
  process.env.RUNPOD_API_KEY = "test-key";
  process.env.RUNPOD_GLM_RUNSYNC_URL = "https://glm.test/runsync";
  process.env.RUNPOD_QWEN_RUNSYNC_URL = "https://qwen.test/runsync";
  process.env.RUNPOD_TIMEOUT_MS = "1000";
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (ORIGINAL_ENV[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = ORIGINAL_ENV[key];
    }
  }
}

function createRequest(file) {
  const formData = new FormData();
  if (file) {
    formData.set("document", file);
  }

  return new Request("http://localhost/api/extract", {
    method: "POST",
    body: formData,
  });
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test.afterEach(() => {
  restoreEnv();
  globalThis.fetch = ORIGINAL_FETCH;
});

test("rejects missing upload", async () => {
  applyTestEnv();

  const response = await POST(createRequest(null));
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.status, "failed");
  assert.match(payload.error, /chybí soubor|missing invoice file/i);
});

test("rejects unsupported file type", async () => {
  applyTestEnv();

  const response = await POST(
    createRequest(new File(["not an invoice"], "notes.txt", { type: "text/plain" })),
  );
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.status, "failed");
  assert.match(payload.error, /nepodporovaný|unsupported file type/i);
});

test("returns degraded Qwen fallback when GLM fails", async () => {
  applyTestEnv();

  globalThis.fetch = async (url) => {
    if (url === process.env.RUNPOD_GLM_RUNSYNC_URL) {
      return new Response("glm upstream failed", { status: 502 });
    }

    if (url === process.env.RUNPOD_QWEN_RUNSYNC_URL) {
      return jsonResponse(200, {
        ok: true,
        backend: "qwen_compact_adapter",
        qwen_compact: {
          invoice_number: "QWEN-2026-001",
          issue_date: "2026-05-20",
          due_date: "2026-06-03",
          supplier: {
            ico: "27074358",
            dic: "CZ27074358",
          },
          iban: "CZ6508000000192000145399",
          total_with_vat: "1210.00",
          total_vat: "210.00",
        },
        warnings: [],
        timings_ms: {
          decode: 1,
          inference: 9,
          total: 10,
        },
      });
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  const response = await POST(
    createRequest(new File(["invoice"], "invoice.pdf", { type: "application/pdf" })),
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.status, "glm_failed_qwen_fallback");
  assert.equal(payload.invoice.invoice_number, "QWEN-2026-001");
  assert.equal(payload.invoice.supplier.iban, "CZ6508000000192000145399");
  assert.match(payload.warnings.join(" "), /glm_unavailable/i);
  assert.equal(payload.endpoints.glm.ok, false);
  assert.equal(payload.endpoints.qwen.ok, true);
});

test("unwraps RunPod runsync envelopes before merge evaluation", async () => {
  applyTestEnv();

  globalThis.fetch = async (url) => {
    if (url === process.env.RUNPOD_GLM_RUNSYNC_URL) {
      return jsonResponse(200, {
        delayTime: 123,
        executionTime: 456,
        id: "glm-job",
        output: {
          ok: true,
          backend: "glm_ocr_regex",
          regex_invoice: {
            invoice_number: "REGEX-2026-77",
            issue_date: "2026-05-21",
            supplier: {
              ico: "27074358",
            },
          },
          warnings: ["glm_notice"],
          timings_ms: {
            decode: 2,
            ocr: 30,
            regex: 7,
            total: 39,
          },
        },
        status: "COMPLETED",
      });
    }

    if (url === process.env.RUNPOD_QWEN_RUNSYNC_URL) {
      return jsonResponse(200, {
        id: "qwen-job",
        output: {
          ok: true,
          backend: "qwen_compact_adapter",
          qwen_compact: {
            invoice_number: "QWEN-2026-77",
            issue_date: "2026-05-22",
            due_date: "2026-06-02",
            supplier: {
              ico: "27074358",
              dic: "CZ27074358",
            },
            iban: "CZ6508000000192000145399",
            total_with_vat: "1210.00",
            total_vat: "210.00",
          },
          warnings: ["qwen_notice"],
          timings_ms: {
            decode: 1,
            inference: 11,
            total: 12,
          },
        },
        status: "COMPLETED",
      });
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  const response = await POST(
    createRequest(new File(["invoice"], "invoice.pdf", { type: "application/pdf" })),
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.status, "completed_with_conflicts");
  assert.equal(payload.invoice.invoice_number, "QWEN-2026-77");
  assert.match(payload.warnings.join(" "), /glm_notice/i);
  assert.match(payload.warnings.join(" "), /qwen_notice/i);
  assert.equal(payload.endpoints.glm.runpod_status, "COMPLETED");
  assert.equal(payload.endpoints.qwen.runpod_status, "COMPLETED");
});

test("returns GLM result with warning when Qwen is unavailable", async () => {
  applyTestEnv();

  globalThis.fetch = async (url) => {
    if (url === process.env.RUNPOD_GLM_RUNSYNC_URL) {
      return jsonResponse(200, {
        ok: true,
        backend: "glm_ocr_regex",
        ocr_text: "invoice text",
        regex_invoice: {
          invoice_number: "REGEX-42",
          issue_date: "2026-05-21",
          supplier: {
            ico: "27074358",
          },
        },
        warnings: [],
        timings_ms: {
          decode: 2,
          ocr: 20,
          regex: 4,
          total: 26,
        },
      });
    }

    if (url === process.env.RUNPOD_QWEN_RUNSYNC_URL) {
      return new Response("qwen timeout", { status: 504 });
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  const response = await POST(
    createRequest(new File(["invoice"], "invoice.pdf", { type: "application/pdf" })),
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.status, "glm_only_qwen_unavailable");
  assert.equal(payload.invoice.invoice_number, "REGEX-42");
  assert.match(payload.warnings.join(" "), /qwen_unavailable/i);
  assert.equal(payload.endpoints.glm.ok, true);
  assert.equal(payload.endpoints.qwen.ok, false);
});

test("returns hard failure with null invoice when both branches fail", async () => {
  applyTestEnv();

  globalThis.fetch = async () => new Response("upstream failed", { status: 502 });

  const response = await POST(
    createRequest(new File(["invoice"], "invoice.pdf", { type: "application/pdf" })),
  );
  const payload = await response.json();

  assert.equal(response.status, 502);
  assert.equal(payload.status, "failed");
  assert.equal(payload.invoice, null);
  assert.deepEqual(payload.verification, { fields: {}, conflicts: [] });
  assert.deepEqual(payload.sources, { regex: null, qwen: null });
  assert.match(payload.warnings.join(" "), /glm_unavailable/i);
  assert.match(payload.warnings.join(" "), /qwen_unavailable/i);
});
