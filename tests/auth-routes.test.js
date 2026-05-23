import test from "node:test";
import assert from "node:assert/strict";
import { POST as loginPost } from "../app/api/login/route.js";
import { POST as logoutPost } from "../app/api/logout/route.js";

const ORIGINAL_PASSWORD = process.env.DEMO_ACCESS_PASSWORD;

test.afterEach(() => {
  if (ORIGINAL_PASSWORD === undefined) {
    delete process.env.DEMO_ACCESS_PASSWORD;
  } else {
    process.env.DEMO_ACCESS_PASSWORD = ORIGINAL_PASSWORD;
  }
});

test("login success redirects with 303 and sets auth cookie", async () => {
  process.env.DEMO_ACCESS_PASSWORD = "demo-secret";

  const formData = new FormData();
  formData.set("password", "demo-secret");
  formData.set("return_to", "/");

  const response = await loginPost(
    new Request("http://localhost/api/login", {
      method: "POST",
      body: formData,
    }),
  );

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "http://localhost/");
  assert.match(response.headers.get("set-cookie") ?? "", /invoice_demo_auth=/);
});

test("login failure redirects with 303 back to login", async () => {
  process.env.DEMO_ACCESS_PASSWORD = "demo-secret";

  const formData = new FormData();
  formData.set("password", "wrong");
  formData.set("return_to", "/");

  const response = await loginPost(
    new Request("http://localhost/api/login", {
      method: "POST",
      body: formData,
    }),
  );

  assert.equal(response.status, 303);
  assert.match(response.headers.get("location") ?? "", /\/login\?error=invalid_password/);
});

test("logout redirects with 303 back to login", async () => {
  const response = await logoutPost(
    new Request("http://localhost/api/logout", {
      method: "POST",
    }),
  );

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "http://localhost/login");
});
