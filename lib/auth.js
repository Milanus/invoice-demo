export const DEMO_AUTH_COOKIE = "invoice_demo_auth";
export const LOGIN_PATH = "/login";

function toHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createDemoAccessToken(password) {
  const data = new TextEncoder().encode(`invoice-demo:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(new Uint8Array(digest));
}

export function normalizeReturnTo(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}
