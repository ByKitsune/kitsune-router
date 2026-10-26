import Link from "next/link";
import styles from "../landing.module.css";

export default function HowItWorks() {
  return (
    <section id="routing" className={`${styles.container} ${styles.section} ${styles.routingSection}`} aria-labelledby="routing-heading">
      <div className={styles.routingIntro}>
        <h2 id="routing-heading" className={styles.sectionHeading} data-reveal>Keep your tools.<br />Choose the route.</h2>
        <p className={styles.body} data-reveal>
          Point a compatible client at your gateway. Change the providers behind it without reconfiguring every tool.
        </p>
        <dl className={styles.explanationList}>
          <div data-reveal>
            <dt>Connect your accounts</dt>
            <dd>Use API keys or supported sign-in flows. You decide which providers this installation can use.</dd>
          </div>
          <div data-reveal>
            <dt>Set the fallback order</dt>
            <dd>Build a model combo and choose its strategy. Availability and capability still depend on the upstream provider.</dd>
          </div>
          <div data-reveal>
            <dt>Keep the client address</dt>
            <dd>Supported OpenAI- and Anthropic-compatible requests enter through the same gateway.</dd>
          </div>
        </dl>
      </div>
      <div className={styles.endpointStage} data-reveal>
        <figure className={styles.productPanel} data-ui="endpoint-configuration">
          <figcaption className={styles.panelHeader}>
            <strong>Endpoint &amp; key</strong>
            <span>Setup preview</span>
          </figcaption>
          <div className={styles.panelBody}>
            <div className={styles.endpointAddress}>
              <span>Local API base URL</span>
              <code>http://localhost:20128/v1</code>
            </div>
            <dl className={styles.settingsList}>
              <div><dt>Router API key</dt><dd>Generate in your dashboard</dd></div>
              <div><dt>Provider credentials</dt><dd>Managed on your installation</dd></div>
              <div><dt>Client model</dt><dd><code>my-route</code></dd></div>
            </dl>
            <p className={styles.panelNote}>Create a combo named <code>my-route</code>, then use that name in your client.</p>
            <Link className={styles.panelLink} href="/dashboard/endpoint">Configure your endpoint</Link>
          </div>
        </figure>
        <div className={styles.compatibilityNote}>
          <p>Bring the client you already use.</p>
          <ul aria-label="Examples of supported client integrations">
            <li>OpenCode</li><li>Codex</li><li>Claude Code</li><li>Cline</li><li>Cursor</li>
          </ul>
          <p className={styles.smallNote}>Integration steps and supported features vary by client and model.</p>
        </div>
      </div>
    </section>
  );
}
