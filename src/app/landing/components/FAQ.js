import { BRAND } from "../../../../branding/identity.mjs";
import styles from "../landing.module.css";

const questions = [
  {
    question: "Do I need a ByKitsune account?",
    answer: "No. ByKitsune maintains and sponsors the project. Choose your own supported providers and accounts; sponsorship does not decide how requests are routed.",
  },
  {
    question: "Is the software free?",
    answer: "Kitsune Router is open-source software under the MIT license. Your infrastructure, upstream accounts, provider charges, quotas and terms remain separate.",
  },
  {
    question: "Where does my data go?",
    answer: "Configuration, credentials and recorded usage are managed on your installation. Routed requests are sent to the providers you configure. Protect the host, its backups and any remote access you enable.",
  },
  {
    question: "Will every model work with every tool?",
    answer: "No. The gateway translates supported request formats, but tools, media, reasoning and other features depend on the client, selected model and upstream API. Check the integration documentation for your setup.",
  },
];

export default function FAQ() {
  return (
    <section className={`${styles.container} ${styles.section} ${styles.faqSection}`} aria-labelledby="faq-heading">
      <div data-reveal>
        <h2 id="faq-heading" className={styles.sectionHeading}>Before you route.</h2>
        <p className={styles.body}>A local gateway, with clear boundaries.</p>
        <a className={styles.textLink} href={BRAND.docsUrl}>Read the documentation</a>
      </div>
      <div className={styles.faqList}>
        {questions.map((item, index) => (
          <details key={item.question} open={index === 0} data-reveal>
            <summary>{item.question}<span aria-hidden="true">+</span></summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
