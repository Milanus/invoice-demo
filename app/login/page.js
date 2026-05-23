const ERROR_MESSAGES = {
  invalid_password: "Zadané heslo není správné.",
  missing_password: "Na serveru chybí nastavení DEMO_ACCESS_PASSWORD.",
};

function normalizeFrom(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

export const metadata = {
  title: "Přihlášení | Invoice Demo",
  description: "Přístupová brána pro interní demo extrakce faktur.",
};

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const from = normalizeFrom(params?.from);
  const error = typeof params?.error === "string" ? params.error : null;
  const errorMessage = error ? ERROR_MESSAGES[error] ?? "Přihlášení se nezdařilo." : null;
  const isConfigured = Boolean(process.env.DEMO_ACCESS_PASSWORD);

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <p className="eyebrow">Interní přístup</p>
        <h1 className="auth-title">Demo extrakce faktur je chráněné heslem.</h1>
        <p className="auth-copy">
          Tato stránka pouští uživatele k serverové route, která volá RunPod endpointy.
          Přihlášení chrání demo před veřejným zneužitím.
        </p>

        <form className="auth-form" action="/api/login" method="post">
          <input name="return_to" type="hidden" value={from} />
          <label className="auth-label" htmlFor="password">
            Heslo
          </label>
          <input
            className="auth-input"
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Zadej přístupové heslo"
            required
          />
          <button className="button" type="submit">
            Přihlásit se
          </button>
        </form>

        {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}
        {!isConfigured ? (
          <div className="error-banner">
            Server není připravený: nastav `DEMO_ACCESS_PASSWORD` do `.env.local`.
          </div>
        ) : null}
      </section>
    </main>
  );
}
