import Link from "next/link";
import { BRAND } from "../../../../branding/identity.mjs";
import FlowAnimation from "./FlowAnimation";
import styles from "../landing.module.css";

export default function HeroSection() {
  return (
    <section className={`${styles.container} ${styles.hero}`} aria-labelledby="hero-heading">
      <div className={styles.heroCopy}>
        <h1 id="hero-heading" className={styles.heroHeading} data-enter>
          Your models.<br />Your routes.
        </h1>
        <p className={styles.heroDescription} data-enter style={{ "--delay": "70ms" }}>
          A self-hosted, provider-neutral AI gateway for connecting your tools to the models you choose.
        </p>
        <div className={styles.heroAction} data-enter style={{ "--delay": "140ms" }}>
          <Link className={styles.button} href="/dashboard">Open dashboard <span aria-hidden="true">↗</span></Link>
          <a className={styles.textLink} href="#setup">Install it locally</a>
        </div>
        <p className={styles.heroNote} data-enter style={{ "--delay": "210ms" }}>
          Open-source software. Your providers’ terms and charges still apply.
        </p>
        <p className={styles.sponsorLine}>
          Maintained and sponsored by <a href={BRAND.sponsorUrl}>{BRAND.organization}</a>.
        </p>
      </div>
      <div className={styles.heroStage}>
        <FlowAnimation />
      </div>
    </section>
  );
}
