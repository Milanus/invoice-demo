import { NextResponse } from "next/server.js";
import { deriveUiState, mergeExtractionResults } from "../../../lib/merge.js";
import {
  documentPayloadFromFile,
  postRunpodDocument,
  validateUploadFile,
} from "../../../lib/runpod.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function readRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Chybí povinná proměnná prostředí: ${name}`);
  }
  return value;
}

function normalizeSettledResult(result, backend) {
  if (result.status === "fulfilled") {
    return result.value;
  }

  return {
    ok: false,
    backend,
    status: 0,
    elapsed_ms: 0,
    error: result.reason instanceof Error ? result.reason.message : String(result.reason),
  };
}

function mergeWarnings(...groups) {
  return [...new Set(groups.flat().filter(Boolean))];
}

function isUploadValidationError(message) {
  return (
    message.includes("Ve formuláři chybí soubor") ||
    message.includes("Nepodporovaný typ souboru") ||
    message.includes("Missing invoice file") ||
    message.includes("Unsupported file type")
  );
}

function extractBackendPayload(response) {
  if (!response || typeof response !== "object") {
    return null;
  }

  const visited = new Set();
  const queue = [response];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || visited.has(current)) {
      continue;
    }

    visited.add(current);

    if (
      "ok" in current ||
      "regex_invoice" in current ||
      "qwen_compact" in current ||
      "backend" in current
    ) {
      return current;
    }

    if (current.output && typeof current.output === "object") {
      queue.push(current.output);
    }

    if (current.data && typeof current.data === "object") {
      queue.push(current.data);
    }
  }

  return null;
}

function summarizeEndpointResult(result) {
  const payload = extractBackendPayload(result.response);

  return {
    ok: Boolean(payload?.ok),
    http_ok: Boolean(result.ok),
    backend: result.backend,
    status: result.status ?? 0,
    elapsed_ms: result.elapsed_ms ?? 0,
    warnings: payload?.warnings ?? [],
    error: result.error ?? result.response?.error ?? null,
    timings_ms: payload?.timings_ms ?? {},
    runpod_status:
      result.response && typeof result.response === "object"
        ? result.response.status ?? null
        : null,
  };
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const document = formData.get("document");

    validateUploadFile(document);

    const payload = await documentPayloadFromFile(document);
    const apiKey = readRequiredEnv("RUNPOD_API_KEY");
    const glmUrl = readRequiredEnv("RUNPOD_GLM_RUNSYNC_URL");
    const qwenUrl = readRequiredEnv("RUNPOD_QWEN_RUNSYNC_URL");
    const timeoutMs = Number.parseInt(process.env.RUNPOD_TIMEOUT_MS ?? "120000", 10);

    const [glmSettled, qwenSettled] = await Promise.allSettled([
      postRunpodDocument({
        backend: "glm",
        url: glmUrl,
        apiKey,
        payload,
        timeoutMs,
      }),
      postRunpodDocument({
        backend: "qwen",
        url: qwenUrl,
        apiKey,
        payload,
        timeoutMs,
      }),
    ]);

    const glmResult = normalizeSettledResult(glmSettled, "glm");
    const qwenResult = normalizeSettledResult(qwenSettled, "qwen");
    const glmPayload = extractBackendPayload(glmResult.response);
    const qwenPayload = extractBackendPayload(qwenResult.response);

    const glmOk = Boolean(glmResult.ok && glmPayload?.ok && glmPayload.regex_invoice);
    const qwenOk = Boolean(qwenResult.ok && qwenPayload?.ok && qwenPayload.qwen_compact);

    const merged = mergeExtractionResults({
      regexInvoice: glmOk ? glmPayload.regex_invoice : null,
      qwenCompact: qwenOk ? qwenPayload.qwen_compact : null,
    });

    const status = deriveUiState({
      glmOk,
      qwenOk,
      conflictCount: merged.verification.conflicts.length,
    });

    const warnings = mergeWarnings(
      glmOk ? [] : ["glm_unavailable"],
      qwenOk ? [] : ["qwen_unavailable"],
      glmPayload?.warnings ?? [],
      qwenPayload?.warnings ?? [],
      merged.warnings,
    );

    const responseInvoice = status === "failed" ? null : merged.invoice;
    const responseVerification =
      status === "failed"
        ? { fields: {}, conflicts: [] }
        : merged.verification;
    const responseSources =
      status === "failed"
        ? { regex: null, qwen: null }
        : merged.sources;

    const responseBody = {
      status,
      invoice: responseInvoice,
      verification: responseVerification,
      warnings,
      sources: responseSources,
      endpoints: {
        glm: summarizeEndpointResult(glmResult),
        qwen: summarizeEndpointResult(qwenResult),
      },
    };

    const statusCode = status === "failed" ? 502 : 200;
    return NextResponse.json(responseBody, { status: statusCode });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Neočekávané selhání při nahrávání.";
    const status = isUploadValidationError(message) ? 400 : 500;

    return NextResponse.json(
      {
        status: "failed",
        invoice: null,
        verification: { fields: {}, conflicts: [] },
        warnings: ["extract_route_failed"],
        error: message,
      },
      { status },
    );
  }
}
