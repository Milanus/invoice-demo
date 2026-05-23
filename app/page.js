import DemoClient from "../components/demo-client";

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Interní demo RunPod endpointů</p>
        <h1>Extrakce faktur s ověřením, konflikty a řízeným fallbackem.</h1>
        <p className="lede">
          GLM zůstává primárním full extraktorem. Qwen ověřuje kritická pole,
          zvýrazňuje konflikty a při selhání GLM slouží jako degradovaný fallback.
        </p>
      </section>
      <DemoClient />
    </main>
  );
}
