"use client";

import { useEffect, useRef } from "react";

export default function LandingMotion({ children }) {
  const root = useRef(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches || !window.IntersectionObserver) return;

    // Content is visible by default, including without JS. Marking an on-screen
    // piece starts its CSS entrance; no hidden-until-observed state is needed.
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        if (!media.matches) entry.target.setAttribute("data-revealed", "true");
      });
    }, { threshold: 0.12 });

    root.current?.querySelectorAll("[data-reveal]").forEach((element) => observer.observe(element));
    const onPreferenceChange = () => {
      if (!media.matches) return;
      observer.disconnect();
    };
    media.addEventListener("change", onPreferenceChange);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", onPreferenceChange);
    };
  }, []);

  return <div ref={root}>{children}</div>;
}
