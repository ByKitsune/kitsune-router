"use client";

import { useState } from "react";
import styles from "../landing.module.css";

// Representative catalog entries, not connections to this installation.
// The demo deliberately has no network, credentials, persistence or inference.
const EXAMPLE_PROVIDERS = [
  { id: "anthropic", name: "Anthropic", model: "claude-sonnet-4-6", initials: "A" },
  { id: "google", name: "Google", model: "gemini-2.5-flash", initials: "G" },
  { id: "openai", name: "OpenAI", model: "gpt-5-mini", initials: "O" },
];

export default function FlowAnimation() {
  const [firstProvider, setFirstProvider] = useState(EXAMPLE_PROVIDERS[0].id);
  const [firstUnavailable, setFirstUnavailable] = useState(false);
  const primary = EXAMPLE_PROVIDERS.find((provider) => provider.id === firstProvider);
  const route = [primary, ...EXAMPLE_PROVIDERS.filter((provider) => provider.id !== firstProvider)];
  const destination = route[firstUnavailable ? 1 : 0];

  return (
    <div className={styles.routeDemo} data-ui="route-demo">
      <div className={styles.demoHeader} data-reveal>
        <h2>Route playground</h2>
        <span className={styles.demoBadge}>Local demo</span>
      </div>
      <p className={styles.demoDescription}>Change the first choice. Try the fallback.</p>
      <div className={styles.demoField} data-reveal style={{ "--reveal-delay": "60ms" }}>
        <label htmlFor="demo-first-provider">First provider</label>
        <select id="demo-first-provider" value={firstProvider} onChange={(event) => setFirstProvider(event.target.value)}>
          {EXAMPLE_PROVIDERS.map((provider) => (
            <option key={provider.id} value={provider.id}>{provider.name}</option>
          ))}
        </select>
      </div>
      <ol className={styles.routeList} aria-label="Example fallback order">
        {route.map((provider, index) => {
          const skipped = index === 0 && firstUnavailable;
          const selected = provider.id === destination.id;
          return (
            <li key={provider.id} className={`${styles.routeRow} ${selected ? styles.routeSelected : ""}`} data-reveal style={{ "--reveal-delay": `${120 + index * 60}ms` }}>
              <span className={styles.providerInitial} aria-hidden="true">{provider.initials}</span>
              <div className={styles.routeProvider}>
                <strong>{provider.name}</strong>
                <code>{provider.model}</code>
              </div>
              <span className={styles.routeState}>
                {skipped ? "Unavailable" : selected ? "Selected" : "Fallback"}
              </span>
            </li>
          );
        })}
      </ol>
      <label className={styles.demoSwitch} data-reveal style={{ "--reveal-delay": "300ms" }}>
        <input type="checkbox" checked={firstUnavailable} onChange={(event) => setFirstUnavailable(event.target.checked)} />
        <span>Simulate first provider unavailable</span>
      </label>
      <output className={styles.demoOutput} aria-live="polite" aria-atomic="true" data-reveal style={{ "--reveal-delay": "360ms" }}>
        <span>Would route to</span>
        <strong>{destination.name}</strong>
        <p>{firstUnavailable ? `${primary.name} is skipped in this example.` : "The first choice is available in this example."}</p>
      </output>
      <p className={styles.demoDisclaimer}>Illustration only. No API request is made or saved.</p>
      <noscript><p className={styles.demoDisclaimer}>Enable JavaScript to change this example. The default fallback order is shown above.</p></noscript>
    </div>
  );
}
