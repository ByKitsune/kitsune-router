import Link from "next/link";
import { NPM_PACKAGE_NAME } from "@/shared/constants/config.js";
import CopyCode from "./CopyCode";
import styles from "../landing.module.css";

const SOURCE_COMMAND = "npm ci\nnpm run build\nnpm run start";
const REQUEST_EXAMPLE = [
  "curl http://localhost:20128/v1/chat/completions \\",
  "  -H 'Content-Type: application/json' \\",
  '  -H "Authorization: Bearer $KITSUNE_ROUTER_API_KEY" \\',
  '  -d \'{"model":"my-route","messages":[{"role":"user","content":"Hello"}]}\'',
].join("\n");

export default function GetStarted() {
  return (
    <section id="setup" className={`${styles.container} ${styles.section} ${styles.setupSection}`} aria-labelledby="setup-heading">
      <div>
        <h2 id="setup-heading" className={styles.sectionHeading} data-reveal>Run it on<br />your terms.</h2>
        <p className={styles.body} data-reveal>The gateway runs on your machine or a server you manage. Use Node.js 22.19 or newer.</p>
        <ol className={styles.setupSteps}>
          <li data-reveal><strong>Start the gateway</strong><p>Run the source commands in a checked-out repository. The default port is <code>20128</code>.</p></li>
          <li data-reveal><strong>Secure your installation</strong><p>Set a unique dashboard password before remote access. Generate a router API key and connect the providers you choose.</p></li>
          <li data-reveal><strong>Give your client a route</strong><p>Create a combo called <code>my-route</code>. Set your client’s base URL to <code>http://localhost:20128/v1</code> and use your router API key.</p></li>
        </ol>
        <Link className={styles.button} href="/dashboard">Open dashboard</Link>
      </div>
      <div className={styles.setupCode}>
        <div data-reveal><CopyCode title="From a source checkout" code={SOURCE_COMMAND} copyLabel="Copy source installation commands" /></div>
        <div className={styles.packageNote} data-reveal>
          <p>The npm launcher uses <code>npx {NPM_PACKAGE_NAME}@latest</code>.</p>
          <p className={styles.smallNote}>The rebranded package must be published before that command is available. Source setup works with this checkout.</p>
        </div>
        <div data-reveal>
          <CopyCode title="Your first request" code={REQUEST_EXAMPLE} copyLabel="Copy example API request" />
          <p className={styles.smallNote}>Set <code>KITSUNE_ROUTER_API_KEY</code> to your generated key first. Running this command sends a real request to your configured provider; the playground above does not.</p>
        </div>
      </div>
    </section>
  );
}
