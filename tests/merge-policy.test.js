import test from "node:test";
import assert from "node:assert/strict";
import { deriveUiState, mergeExtractionResults } from "../lib/merge.js";

test("validated regex checksum fields win even when Qwen disagrees", () => {
  const merged = mergeExtractionResults({
    regexInvoice: {
      supplier: {
        ico: "27074358",
      },
    },
    qwenCompact: {
      supplier: {
        ico: "27074359",
      },
    },
  });

  assert.equal(merged.invoice.supplier.ico, "27074358");
  assert.equal(merged.verification.fields["supplier.ico"].selected_source, "regex");
  assert.deepEqual(merged.verification.conflicts, [
    {
      field: "supplier.ico",
      regex_value: "27074358",
      qwen_value: "27074359",
    },
  ]);
});

test("valid Qwen IBAN replaces invalid regex IBAN", () => {
  const merged = mergeExtractionResults({
    regexInvoice: {
      supplier: {
        iban: "CZ7808000000005614511112",
      },
    },
    qwenCompact: {
      iban: "CZ7808000000005614511111",
    },
  });

  assert.equal(merged.invoice.supplier.iban, "CZ7808000000005614511111");
  assert.equal(merged.verification.fields["supplier.iban"].selected_source, "qwen");
  assert.match(merged.verification.fields["supplier.iban"].reason, /replacement/i);
});

test("Qwen preferred fields override regex when valid", () => {
  const merged = mergeExtractionResults({
    regexInvoice: {
      issue_date: "2026-05-20",
      total_with_vat: "1199.00",
    },
    qwenCompact: {
      issue_date: "2026-05-22",
      total_with_vat: "1210.00",
    },
  });

  assert.equal(merged.invoice.issue_date, "2026-05-22");
  assert.equal(merged.invoice.total_with_vat, "1210.00");
  assert.equal(merged.verification.fields.issue_date.selected_source, "qwen");
  assert.equal(merged.verification.fields.total_with_vat.selected_source, "qwen");
});

test("UI state reflects branch health and conflicts", () => {
  assert.equal(deriveUiState({ glmOk: false, qwenOk: true, conflictCount: 0 }), "glm_failed_qwen_fallback");
  assert.equal(deriveUiState({ glmOk: true, qwenOk: false, conflictCount: 0 }), "glm_only_qwen_unavailable");
  assert.equal(deriveUiState({ glmOk: true, qwenOk: true, conflictCount: 2 }), "completed_with_conflicts");
  assert.equal(deriveUiState({ glmOk: true, qwenOk: true, conflictCount: 0 }), "completed_verified");
});
