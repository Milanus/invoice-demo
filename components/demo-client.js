"use client";

import { startTransition, useEffect, useState } from "react";
import { VERIFICATION_FIELD_ORDER } from "../lib/verification-fields.js";

const AVERAGE_GENERATION_SECONDS = 45;

const STATUS_LABELS = {
  processing: "Zpracování",
  completed_verified: "Ověřeno",
  completed_with_conflicts: "Nalezeny konflikty",
  glm_failed_qwen_fallback: "Fallback přes Qwen",
  glm_only_qwen_unavailable: "Pouze GLM",
  failed: "Selhalo",
};

const FIELD_LABELS = {
  invoice_number: "Číslo faktury",
  issue_date: "Datum vystavení",
  due_date: "Datum splatnosti",
  "supplier.ico": "Dodavatel IČO",
  "supplier.dic": "Dodavatel DIČ",
  "supplier.iban": "Dodavatel IBAN",
  total_with_vat: "Celkem s DPH",
  total_vat: "DPH celkem",
};

const WARNING_LABELS = {
  glm_unavailable: "GLM nevrátil použitelný full výsledek faktury.",
  qwen_unavailable: "Qwen ověření nebylo pro tento požadavek dostupné.",
  extract_route_failed: "Lokální agregační route selhala ještě před dokončením merge.",
  "supplier.iban_qwen_invalid": "Qwen vrátil kandidátní IBAN, ale neprošel validací.",
};

function prettyValue(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function formatStatusCopy(status) {
  return STATUS_LABELS[status] ?? status;
}

function formatWarningCopy(warning) {
  return WARNING_LABELS[warning] ?? warning.replaceAll("_", " ");
}

function getResultSummary(result) {
  switch (result.status) {
    case "completed_verified":
      return "GLM vrátil plnou fakturu a Qwen ověření doběhlo bez kritických konfliktů.";
    case "completed_with_conflicts":
      return "GLM vrátil plnou fakturu, ale Qwen nesouhlasí v jednom nebo více kritických polích. Před použitím merged výsledku zkontroluj panel konfliktů.";
    case "glm_failed_qwen_fallback":
      return "GLM nevytvořil použitelnou plnou fakturu. UI proto zobrazuje degradovaný Qwen fallback místo ověřené extrakce.";
    case "glm_only_qwen_unavailable":
      return "GLM vytvořil plnou fakturu, ale Qwen ověření nebylo dostupné. Ber to jako neověřený GLM-only výsledek.";
    case "failed":
      return "Ani jedna větev nevytvořila použitelný výsledek extrakce.";
    default:
      return "Agregátor sloučil odpovědi obou větví a klasifikoval finální stav dema.";
  }
}

function getEndpointHealthState(endpoint) {
  if (endpoint.ok) {
    return "ok";
  }
  if (endpoint.runpod_status && endpoint.runpod_status !== "COMPLETED") {
    return "pending";
  }
  return endpoint.http_ok ? "warning" : "failed";
}

function formatEndpointHealth(endpoint) {
  const state = getEndpointHealthState(endpoint);
  if (state === "ok") {
    return "připraveno";
  }
  if (state === "pending") {
    return endpoint.runpod_status?.toLowerCase() ?? "pending";
  }
  return endpoint.http_ok ? "degradováno" : "selhalo";
}

export default function DemoClient() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!isSubmitting) {
      setElapsedSeconds(0);
      return undefined;
    }

    const startedAt = Date.now();
    setElapsedSeconds(0);

    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isSubmitting]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);

    if (!file) {
      setError("Nejprve vyber jednu fakturu ve formátu PDF, PNG nebo JPG.");
      return;
    }

    const body = new FormData();
    body.append("document", file);

    setResult(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        body,
      });

      const payload = await response.json();
      if (!response.ok && !payload.status) {
        throw new Error("Neočekávaná odpověď extrakce.");
      }

      startTransition(() => {
        setResult(payload);
      });

      if (!response.ok && payload.error) {
        setError(payload.error);
      }
    } catch (submitError) {
      setResult(null);
      setError(submitError instanceof Error ? submitError.message : "Nahrání selhalo.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="demo-grid">
      <div
        aria-busy={isSubmitting}
        className="panel upload-panel"
        data-busy={isSubmitting ? "true" : "false"}
      >
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Nahrání dokumentu</h2>
            <p className="panel-subtitle">
              Přístup do dema je uzamčený heslem. Po přihlášení můžeš spouštět
              extrakci přes chráněnou serverovou route.
            </p>
          </div>
          <form action="/api/logout" method="post">
            <button className="button button-secondary" disabled={isSubmitting} type="submit">
              Odhlásit se
            </button>
          </form>
        </div>
        <form className="upload-form" onSubmit={handleSubmit}>
          <fieldset className="upload-fieldset" disabled={isSubmitting}>
            <div className="dropzone">
              <label htmlFor="document">Nahraj fakturu</label>
              <input
                id="document"
                type="file"
                accept=".pdf,image/png,image/jpeg"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                }}
              />
              <p className="hint">
                Verze v1 podporuje PDF, PNG a JPG. Server odešle jeden payload
                paralelně na oba RunPod endpointy a výsledek sloučí.
              </p>
            </div>
            <div className="actions">
              <button className="button" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Spouštím extrakci…" : "Extrahovat fakturu"}
              </button>
              <span className="secondary-note">
                {file ? `Vybráno: ${file.name}` : "Zatím není vybraný soubor."}
              </span>
            </div>
          </fieldset>
          {isSubmitting ? (
            <div
              aria-hidden="true"
              className="progress-track"
              role="presentation"
            >
              <div className="progress-indicator" />
            </div>
          ) : null}
          {error ? (
            <div aria-live="polite" className="error-banner">
              {error}
            </div>
          ) : null}
        </form>
      </div>

      {isSubmitting ? <ProcessingPanel elapsedSeconds={elapsedSeconds} /> : null}
      {result ? <ResultsView result={result} /> : null}
    </section>
  );
}

function ProcessingPanel({ elapsedSeconds }) {
  const remainingSeconds = Math.max(AVERAGE_GENERATION_SECONDS - elapsedSeconds, 0);
  const exceededAverage = elapsedSeconds >= AVERAGE_GENERATION_SECONDS;

  return (
    <section className="panel content-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Zpracování</h2>
          <p className="panel-subtitle">
            Obě RunPod větve běží paralelně. UI se po doručení výsledků přepne
            do stavu ověřeno, konflikt, fallback nebo selhání.
          </p>
        </div>
        <span className="status-badge" data-state="processing">
          {formatStatusCopy("processing")}
        </span>
      </div>
      <p aria-live="polite" className="small-copy">
        GLM zůstává primární full extractor. Qwen ověřuje kritická pole a při
        selhání GLM může vrátit degradovaný compact fallback.
      </p>
      <div aria-live="polite" className="timer-card">
        <p className="timer-label">Tohle je průměrný čas na vygenerování faktury</p>
        <p className="timer-value">
          {exceededAverage ? `>${AVERAGE_GENERATION_SECONDS} s` : `${remainingSeconds} s`}
        </p>
        <p className="timer-meta">
          {exceededAverage
            ? "Požadavek běží déle než obvyklý čas. Čekáme na pomalejší větev nebo frontu."
            : `Od spuštění požadavku uplynulo ${elapsedSeconds} s.`}
        </p>
      </div>
    </section>
  );
}

function ResultsView({ result }) {
  const conflictFields = new Set(
    (result.verification?.conflicts ?? []).map((conflict) => conflict.field),
  );
  const fieldEntries = VERIFICATION_FIELD_ORDER.map((fieldPath) => [
    fieldPath,
    result.verification?.fields?.[fieldPath],
  ]).filter(([, field]) => field);

  return (
    <div className="results-grid">
      <section className="panel content-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Sloučená faktura</h2>
            <p className="panel-subtitle">
              Finální payload vrácený agregátorem po aplikaci merge politiky
              nad GLM a Qwen větví.
            </p>
          </div>
          <span className="status-badge" data-state={result.status}>
            {formatStatusCopy(result.status)}
          </span>
        </div>
        <p className="state-summary">{getResultSummary(result)}</p>
        <pre className="json-block">{JSON.stringify(result.invoice, null, 2)}</pre>
      </section>

      <div className="results-stack">
        <section className="panel content-panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Kritická pole</h2>
              <p className="panel-subtitle">
                Volba zdroje po jednotlivých polích, vybraná hodnota a viditelnost nesouladů.
              </p>
            </div>
          </div>
          <div className="field-list">
            {fieldEntries.map(([fieldPath, field]) => (
              <article
                className="field-card"
                data-conflict={conflictFields.has(fieldPath) ? "true" : "false"}
                key={fieldPath}
              >
                <div className="field-card-top">
                  <div>
                    <p className="field-label">{FIELD_LABELS[fieldPath] ?? fieldPath}</p>
                    <p className="field-meta">{field.reason}</p>
                  </div>
                  <span className="source-badge" data-source={field.selected_source}>
                    {field.selected_source}
                  </span>
                </div>
                <dl className="field-values">
                  <div>
                    <dt>Vybráno</dt>
                    <dd>{prettyValue(field.selected_value)}</dd>
                  </div>
                  <div>
                    <dt>Regex</dt>
                    <dd>{prettyValue(field.regex_value)}</dd>
                  </div>
                  <div>
                    <dt>Qwen</dt>
                    <dd>{prettyValue(field.qwen_value)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </section>

        <section className="panel content-panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Konflikty a upozornění</h2>
              <p className="panel-subtitle">
                Částečný výsledek musí zůstat viditelně částečný.
              </p>
            </div>
          </div>
          {result.verification?.conflicts?.length ? (
            <>
              <p className="small-copy">Konflikty</p>
              <ul className="conflict-list">
                {result.verification.conflicts.map((conflict) => (
                  <li key={conflict.field}>
                    <strong>{FIELD_LABELS[conflict.field] ?? conflict.field}</strong>
                    {`: regex=${prettyValue(conflict.regex_value)}, qwen=${prettyValue(conflict.qwen_value)}`}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="small-copy">V této odpovědi nejsou žádné konflikty v kritických polích.</p>
          )}

          {result.warnings?.length ? (
            <>
              <p className="small-copy">Upozornění</p>
              <ul className="warning-list">
                {result.warnings.map((warning) => (
                  <li key={warning}>
                    <strong>{formatWarningCopy(warning)}</strong>
                    {WARNING_LABELS[warning] ? null : ` (${warning})`}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>

        <section className="panel content-panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Stav endpointů</h2>
              <p className="panel-subtitle">
                Surový stav obou větví z RunPod `runsync` volání.
              </p>
            </div>
          </div>
          <div className="endpoint-list">
            {Object.entries(result.endpoints ?? {}).map(([name, endpoint]) => (
              <article className="endpoint-card" key={name}>
                <div className="panel-header">
                  <div>
                    <p className="field-label">{name.toUpperCase()}</p>
                    <p className="field-meta">
                      {endpoint.elapsed_ms} ms, HTTP {endpoint.status}
                    </p>
                    <p className="field-meta">
                      RunPod stav: {endpoint.runpod_status ?? "neznámý"}
                    </p>
                    {endpoint.timings_ms?.total ? (
                      <p className="field-meta">
                        Worker celkem: {endpoint.timings_ms.total} ms
                      </p>
                    ) : null}
                  </div>
                  <span
                    className="health-badge"
                    data-state={getEndpointHealthState(endpoint)}
                  >
                    {formatEndpointHealth(endpoint)}
                  </span>
                </div>
                {endpoint.warnings?.length ? (
                  <ul className="warning-list compact-list">
                    {endpoint.warnings.map((warning) => (
                      <li key={`${name}-${warning}`}>{formatWarningCopy(warning)}</li>
                    ))}
                  </ul>
                ) : null}
                {endpoint.error ? (
                  <p className="small-copy">{prettyValue(endpoint.error)}</p>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
