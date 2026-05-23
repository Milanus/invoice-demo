const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL_PATTERN = /^\d+(?:\.\d{1,2})?$/;
const CZ_DIC_PATTERN = /^CZ\d{8,10}$/;
const SK_DIC_PATTERN = /^[1-9]\d{9}$/;
const IBAN_PATTERN = /^[A-Z]{2}\d{2}[A-Z0-9]+$/;

export function normalizeText(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text === "" ? null : text;
}

export function normalizeIban(value) {
  const text = normalizeText(value);
  return text ? text.replace(/\s+/g, "").toUpperCase() : null;
}

export function validateIsoDate(value) {
  const text = normalizeText(value);
  if (!text || !ISO_DATE_PATTERN.test(text)) {
    return false;
  }

  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

export function validateAmountString(value) {
  const text = normalizeText(value);
  return Boolean(text && DECIMAL_PATTERN.test(text));
}

export function validateIco(value) {
  const text = normalizeText(value);
  if (!text || !/^\d{8}$/.test(text)) {
    return false;
  }

  const digits = [...text].map(Number);
  const weights = [8, 7, 6, 5, 4, 3, 2];
  const total = weights.reduce((sum, weight, index) => sum + digits[index] * weight, 0);
  const remainder = total % 11;

  let checkDigit;
  if (remainder === 0) {
    checkDigit = 1;
  } else if (remainder === 1) {
    checkDigit = 0;
  } else {
    checkDigit = 11 - remainder;
  }

  return digits[7] === checkDigit;
}

export function validateDic(value) {
  const text = normalizeText(value);
  if (!text) {
    return false;
  }
  const compact = text.replace(/\s+/g, "").toUpperCase();
  return CZ_DIC_PATTERN.test(compact) || SK_DIC_PATTERN.test(compact);
}

export function validateIban(value) {
  const iban = normalizeIban(value);
  if (!iban || !IBAN_PATTERN.test(iban) || iban.length < 15 || iban.length > 34) {
    return false;
  }

  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`;
  let numeric = "";
  for (const character of rearranged) {
    numeric += /[A-Z]/.test(character) ? String(character.charCodeAt(0) - 55) : character;
  }

  let remainder = 0;
  for (const digit of numeric) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}
