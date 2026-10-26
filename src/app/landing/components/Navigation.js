"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BRAND } from "../../../../branding/identity.mjs";
import styles from "../landing.module.css";

const links = [
  { label: "Routing", href: "#routing" },
  { label: "Setup", href: "#setup" },
  { label: "Docs", href: BRAND.docsUrl },
  { label: "Source", href: BRAND.repository },
];

export default function Navigation() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuButton.current?.focus();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  return (
    <header className={styles.header}>
      <div className={`${styles.container} ${styles.navRow}`}>
        <Link href="/landing" className={styles.wordmark} aria-label={`${BRAND.name} home`}>
          <Image src="/icons/logo.svg" alt="" width={38} height={38} />
          <span>{BRAND.name}</span>
        </Link>
        <nav className={styles.desktopNav} aria-label="Main navigation">
          {links.map((link) => <a key={link.label} href={link.href}>{link.label}</a>)}
          <Link href="/dashboard">Dashboard</Link>
        </nav>
        <button
          ref={menuButton}
          type="button"
          className={styles.menuButton}
          aria-expanded={menuOpen}
          aria-controls="landing-mobile-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? "Close" : "Menu"}
        </button>
      </div>
      <nav id="landing-mobile-menu" className={styles.mobileNav} aria-label="Mobile navigation" hidden={!menuOpen}>
        {links.map((link) => (
          <a key={link.label} href={link.href} onClick={() => setMenuOpen(false)}>{link.label}</a>
        ))}
        <Link href="/dashboard" onClick={() => setMenuOpen(false)}>Open dashboard</Link>
      </nav>
    </header>
  );
}
