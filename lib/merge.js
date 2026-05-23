import {
  normalizeIban,
  normalizeText,
  validateAmountString,
  validateDic,
  validateIban,
  validateIco,
  validateIsoDate,
} from "./validators.js";
import { VERIFICATION_FIELD_ORDER } from "./verification-fields.js";

const FIELD_POLICIES = [
  {
    path: "invoice_number",
    regexPath: ["invoice_number"],
    qwenPath: ["invoice_number"],
    preferred: "qwen",
    normalize: normalizeText,
    validate: (value) => normalizeText(value) !== null,
  },
  {
    path: "issue_date",
    regexPath: ["issue_date"],
    qwenPath: ["issue_date"],
    preferred: "qwen",
    normalize: normalizeText,
    validate: validateIsoDate,
  },
  {
    path: "due_date",
    regexPath: ["due_date"],
    qwenPath: ["due_date"],
    preferred: "qwen",
    normalize: normalizeText,
    validate: validateIsoDate,
  },
  {
    path: "supplier.ico",
    regexPath: ["supplier", "ico"],
    qwenPath: ["supplier", "ico"],
    preferred: "validated_regex",
    normalize: normalizeText,
    validate: validateIco,
  },
  {
    path: "supplier.dic",
    regexPath: ["supplier", "dic"],
    qwenPath: ["supplier", "dic"],
    preferred: "validated_regex",
    normalize: normalizeText,
    validate: validateDic,
  },
  {
    path: "supplier.iban",
    regexPath: ["supplier", "iban"],
    qwenPath: ["iban"],
    preferred: "validated_regex",
    normalize: normalizeIban,
    validate: validateIban,
  },
  {
    path: "total_with_vat",
    regexPath: ["total_with_vat"],
    qwenPath: ["total_with_vat"],
    preferred: "qwen",
    normalize: normalizeText,
    validate: validateAmountString,
  },
  {
    path: "total_vat",
    regexPath: ["total_vat"],
    qwenPath: ["total_vat"],
    preferred: "qwen",
    normalize: normalizeText,
    validate: validateAmountString,
  },
];

function getAtPath(value, path) {
  return path.reduce(
    (current, segment) => (current && typeof current === "object" ? current[segment] : undefined),
    value,
  );
}

function setAtPath(target, path, value) {
  let current = target;
  for (const segment of path.slice(0, -1)) {
    if (!current[segment] || typeof current[segment] !== "object" || Array.isArray(current[segment])) {
      current[segment] = {};
    }
    current = current[segment];
  }
  current[path.at(-1)] = value;
}

function cloneInvoice(invoice) {
  return invoice && typeof invoice === "object" ? structuredClone(invoice) : {};
}

function compactToInvoice(qwenCompact) {
  if (!qwenCompact || typeof qwenCompact !== "object") {
    return {};
  }

  return {
    invoice_number: normalizeText(qwenCompact.invoice_number),
    issue_date: normalizeText(qwenCompact.issue_date),
    due_date: normalizeText(qwenCompact.due_date),
    supplier: {
      ico: normalizeText(qwenCompact.supplier?.ico),
      dic: normalizeText(qwenCompact.supplier?.dic),
      iban: normalizeIban(qwenCompact.iban),
    },
    total_with_vat: normalizeText(qwenCompact.total_with_vat),
    total_vat: normalizeText(qwenCompact.total_vat),
  };
}

function buildConflict(path, regexValue, qwenValue) {
  return {
    field: path,
    regex_value: regexValue,
    qwen_value: qwenValue,
  };
}

function chooseFieldValue(policy, regexValue, qwenValue) {
  const regexNormalized = policy.normalize(regexValue);
  const qwenNormalized = policy.normalize(qwenValue);
  const regexPresent = regexNormalized !== null;
  const qwenPresent = qwenNormalized !== null;
  const regexValid = regexPresent && policy.validate(regexNormalized);
  const qwenValid = qwenPresent && policy.validate(qwenNormalized);
  const conflict = regexPresent && qwenPresent && regexNormalized !== qwenNormalized;

  if (policy.preferred === "validated_regex") {
    if (regexValid) {
      return {
        selectedSource: "regex",
        selectedValue: regexNormalized,
        reason: conflict ? "Validated regex kept; Qwen disagreed." : "Validated regex kept.",
        conflict,
        warning: null,
      };
    }

    if (qwenValid) {
      return {
        selectedSource: "qwen",
        selectedValue: qwenNormalized,
        reason: regexPresent
          ? "Regex value failed validation; valid Qwen replacement used."
          : "Regex missing; valid Qwen value filled the gap.",
        conflict,
        warning: regexPresent ? `${policy.path}_regex_invalid_replaced` : null,
      };
    }

    if (regexPresent) {
      return {
        selectedSource: "regex",
        selectedValue: regexNormalized,
        reason: "Regex present but not validator-clean; kept as the only available value.",
        conflict,
        warning: `${policy.path}_unverified_regex_value`,
      };
    }

    return {
      selectedSource: "none",
      selectedValue: null,
      reason: qwenPresent
        ? "Qwen produced a value, but it failed validation."
        : "No value available from either branch.",
      conflict: false,
      warning: qwenPresent ? `${policy.path}_qwen_invalid` : null,
    };
  }

  if (qwenValid) {
    return {
      selectedSource: "qwen",
      selectedValue: qwenNormalized,
      reason: conflict ? "Qwen verifier overrode the regex value." : "Qwen verifier confirmed the field.",
      conflict,
      warning: null,
    };
  }

  if (regexPresent) {
    return {
      selectedSource: "regex",
      selectedValue: regexNormalized,
      reason: qwenPresent
        ? "Qwen value was missing or invalid; regex fallback used."
        : "Only regex value was available.",
      conflict: false,
      warning: qwenPresent ? `${policy.path}_qwen_invalid_fallback_regex` : null,
    };
  }

  return {
    selectedSource: "none",
    selectedValue: null,
    reason: "No value available from either branch.",
    conflict: false,
    warning: qwenPresent ? `${policy.path}_qwen_invalid` : null,
  };
}

export function mergeExtractionResults({ regexInvoice, qwenCompact }) {
  const invoice = cloneInvoice(regexInvoice ?? compactToInvoice(qwenCompact));
  const warnings = [];
  const conflicts = [];
  const fields = {};

  for (const policy of FIELD_POLICIES) {
    const regexValue = getAtPath(regexInvoice, policy.regexPath);
    const qwenValue = getAtPath(qwenCompact, policy.qwenPath);
    const decision = chooseFieldValue(policy, regexValue, qwenValue);

    if (decision.selectedSource !== "none") {
      setAtPath(invoice, policy.regexPath, decision.selectedValue);
    }

    if (decision.conflict) {
      conflicts.push(buildConflict(policy.path, policy.normalize(regexValue), policy.normalize(qwenValue)));
    }

    if (decision.warning) {
      warnings.push(decision.warning);
    }

    fields[policy.path] = {
      selected_source: decision.selectedSource,
      selected_value: decision.selectedValue,
      regex_value: policy.normalize(regexValue),
      qwen_value: policy.normalize(qwenValue),
      reason: decision.reason,
    };
  }

  return {
    invoice,
    verification: {
      fields,
      conflicts,
    },
    warnings: [...new Set(warnings)],
    sources: {
      regex: regexInvoice ?? null,
      qwen: qwenCompact ?? null,
    },
  };
}

export function deriveUiState({ glmOk, qwenOk, conflictCount }) {
  if (!glmOk && !qwenOk) {
    return "failed";
  }
  if (!glmOk && qwenOk) {
    return "glm_failed_qwen_fallback";
  }
  if (glmOk && !qwenOk) {
    return "glm_only_qwen_unavailable";
  }
  return conflictCount > 0 ? "completed_with_conflicts" : "completed_verified";
}
