"use client";

import { useEffect, useRef, useState } from "react";
import styles from "../landing.module.css";

export default function CopyCode({ title, code, copyLabel = "Copy command" }) {
  const [feedback, setFeedback] = useState("");
  const resetTimer = useRef(null);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const handleCopy = async () => {
    clearTimeout(resetTimer.current);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(code);
      setFeedback("Copied to clipboard.");
      resetTimer.current = setTimeout(() => setFeedback(""), 3000);
    } catch {
      setFeedback("Could not copy. Select and copy the code below.");
    }
  };

  return (
    <div className={styles.codePanel} data-ui="setup-command">
      <div className={styles.codeHeader}>
        <span>{title}</span>
        <button type="button" onClick={handleCopy} aria-label={copyLabel}>
          {feedback === "Copied to clipboard." ? "Copied" : "Copy"}
        </button>
      </div>
      <pre tabIndex={0} aria-label={title}><code>{code}</code></pre>
      <p className={styles.copyFeedback} role="status">{feedback}</p>
    </div>
  );
}
