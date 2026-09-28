import { Reveal } from "./Reveal";

const LAYERS = [
  {
    label: "Layer A",
    title: "Fixed safety rules, always active",
    body: "A set of hardcoded checks — high fever, heavy bleeding, difficulty breathing, chest pain, confusion or fainting — runs on every check-in, no matter the procedure. These never depend on an AI model and can never be quietly overridden.",
  },
  {
    label: "Layer B",
    title: "Personalized to your own doctor's instructions",
    body: "Homeward compares each check-in against the warning signs and wound-care guidance from your specific discharge summary. Your doctor's instructions are the source of truth — the app extracts and compares, it never diagnoses.",
  },
];

export function Safety() {
  return (
    <section id="safety" className="anchor bg-homeward-mint/50 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">Safety by design</span>
          <h2 className="mt-3 text-3xl font-semibold text-homeward-ink">Two independent layers of safety</h2>
          <p className="mt-3 text-base leading-relaxed text-homeward-muted">
            Either layer can raise a flag on its own — a calm result from one never suppresses a
            concern from the other. Anything uncertain routes to a human, never a verdict from the
            app.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {LAYERS.map((layer, i) => (
            <Reveal key={layer.label} delay={i * 120}>
              <div className="card lift h-full">
                {/* Layer A (fixed, system-wide) stays green; Layer B (personalized to
                    this patient) gets the warm accent — a visual echo of "fixed rule"
                    versus "this specific human's own plan." */}
                <span className={i === 1 ? "chip-accent" : "chip"}>{layer.label}</span>
                <h3 className="mt-4 text-lg font-semibold text-homeward-ink">{layer.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-homeward-muted">{layer.body}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={120}>
          <p className="disclaimer mx-auto mt-8 max-w-2xl text-center">
            Homeward tracks your recovery against your own discharge plan — it never diagnoses.
            Always contact your provider if you&apos;re unsure, or emergency services for anything urgent.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
