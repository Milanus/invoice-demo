const SUPPORTED_TYPES = new Map([
  ["application/pdf", ".pdf"],
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
]);

function sanitizeFilename(filename) {
  return filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function inferContentType(file) {
  if (SUPPORTED_TYPES.has(file.type)) {
    return file.type;
  }

  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (lowerName.endsWith(".png")) {
    return "image/png";
  }
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  return null;
}

export function validateUploadFile(file) {
  if (!(file instanceof File)) {
    throw new Error("Ve formuláři chybí soubor s fakturou.");
  }

  const contentType = inferContentType(file);
  if (!contentType) {
    throw new Error("Nepodporovaný typ souboru. Použij PDF, PNG nebo JPG.");
  }
}

export async function documentPayloadFromFile(file) {
  validateUploadFile(file);

  const contentType = inferContentType(file);
  const bytes = Buffer.from(await file.arrayBuffer());

  return {
    filename: sanitizeFilename(file.name),
    content_type: contentType,
    document_base64: bytes.toString("base64"),
  };
}

export async function postRunpodDocument({
  backend,
  url,
  apiKey,
  payload,
  timeoutMs,
}) {
  const startedAt = performance.now();
  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: {
        document: payload,
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  return {
    ok: response.ok,
    backend,
    status: response.status,
    elapsed_ms: Math.round(performance.now() - startedAt),
    response: parsed,
    error: response.ok ? null : text,
  };
}
