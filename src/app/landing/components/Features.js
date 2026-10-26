import Link from "next/link";
import styles from "../landing.module.css";

export default function Features() {
  return (
    <section id="controls" className={styles.controlsSection} aria-labelledby="controls-heading">
      <div className={styles.container}>
        <div className={styles.controlsHeading}>
          <h2 id="controls-heading" className={styles.sectionHeading} data-reveal>Controls,<br />not guesswork.</h2>
          <p className={styles.body} data-reveal>See what you configured and what your gateway recorded. No account with a particular provider is required.</p>
        </div>
        <div className={styles.comboRow}>
          <figure className={styles.productPanel} data-ui="combo-configuration" data-reveal>
            <figcaption className={styles.panelHeader}><strong>Combo &amp; fallback</strong><span>Configuration example</span></figcaption>
            <div className={styles.panelBody}>
              <dl className={styles.comboSettings}>
                <div><dt>Combo name</dt><dd><code>my-route</code></dd></div>
                <div><dt>Strategy</dt><dd>Fallback in order</dd></div>
              </dl>
              <ol className={styles.comboOrder} aria-label="Illustrative model priority">
                <li><span>First choice</span><code>claude-sonnet-4-6</code><strong>Anthropic</strong></li>
                <li><span>Next choice</span><code>gemini-2.5-flash</code><strong>Google</strong></li>
                <li><span>Next choice</span><code>gpt-5-mini</code><strong>OpenAI</strong></li>
              </ol>
              <p className={styles.panelNote}>An example order, not a recommendation. Choose models available to your own accounts.</p>
            </div>
          </figure>
          <div className={styles.featureCopy}>
            <h3 data-reveal>Your order. <br />Your conditions.</h3>
            <p data-reveal style={{ "--reveal-delay": "60ms" }}>Use ordered fallback or a rotation strategy. Manage account priority and model capability adapters in the dashboard.</p>
            <Link className={styles.textLink} href="/dashboard/combos" data-reveal style={{ "--reveal-delay": "120ms" }}>Configure model combos</Link>
          </div>
        </div>
        <div className={styles.usageRow}>
          <div className={styles.featureCopy}>
            <h3 data-reveal>A record you can read.</h3>
            <p data-reveal style={{ "--reveal-delay": "60ms" }}>Inspect request history, token usage and available quota information. Cost estimates are shown when pricing and usage data are known.</p>
            <p data-reveal style={{ "--reveal-delay": "120ms" }}>Missing data stays unknown. An estimate is not your provider’s invoice.</p>
            <Link className={styles.textLink} href="/dashboard/usage" data-reveal style={{ "--reveal-delay": "180ms" }}>Open usage &amp; logs</Link>
          </div>
          <figure className={styles.productPanel} data-ui="usage-empty-state" data-reveal>
            <figcaption className={styles.panelHeader}><strong>Usage &amp; request logs</strong><span>Empty-state preview</span></figcaption>
            <div className={styles.panelBody}>
              <dl className={styles.emptyMetrics}>
                <div><dt>Token usage</dt><dd>Not recorded</dd></div>
                <div><dt>Cost estimate</dt><dd>Unknown</dd></div>
              </dl>
              <div className={styles.emptyState}>
                <strong>No requests recorded</strong>
                <p>Your own request history appears here after you start using the gateway.</p>
              </div>
              <p className={styles.panelNote}>This is a product preview, not live traffic or a benchmark.</p>
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}
