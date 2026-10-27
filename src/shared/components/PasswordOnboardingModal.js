"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Button from "./Button";

export default function PasswordOnboardingModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const dialogRef = useRef(null);

  useEffect(() => {
    if (isOpen && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, [isOpen]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Check if user already dismissed the prompt in this browser session
      const dismissed = sessionStorage.getItem("kitsunerouter_pwd_onboarding_dismissed");
      if (dismissed) {
        if (!cancelled) setLoading(false);
        return;
      }
      // Check password state from settings
      try {
        const res = await fetch("/api/settings");
        if (!res.ok) throw new Error("Failed to check status");
        const data = await res.json();
        // If password is not set yet (using default 12345678)
        if (data?.usesDefaultPassword === true) {
          if (!cancelled) setIsOpen(true);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleDismiss = () => {
    sessionStorage.setItem("kitsunerouter_pwd_onboarding_dismissed", "true");
    setIsOpen(false);
  };

  const handleGoToSettings = () => {
    sessionStorage.setItem("kitsunerouter_pwd_onboarding_dismissed", "true");
    setIsOpen(false);
    router.push("/dashboard/profile#password");
  };

  if (loading || !isOpen) return null;

  return (
    <dialog ref={dialogRef} aria-labelledby="password-setup-title" aria-describedby="password-setup-description"
      onCancel={handleDismiss} onClose={handleDismiss}
      className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-lg bg-surface text-text-main rounded-xl shadow-[var(--shadow-elevated)] p-0 backdrop:bg-black/50">
        <div className="p-6 sm:p-8 flex flex-col items-center text-center">
          {/* Logo Badge */}
          <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-surface-2 border border-border p-3 mb-5 shadow-[var(--shadow-warm)]">
            <Image src="/icons/logo.svg" alt="Kitsune Router" width={38} height={38} className="w-full h-full object-contain" />
          </div>

          <h2 id="password-setup-title" className="text-2xl font-bold tracking-tight text-text-main mb-2">
            Secure your gateway
          </h2>

          <p id="password-setup-description" className="text-sm text-text-muted leading-relaxed mb-6">
            Your gateway is currently running on the default password (<code className="bg-surface-2 border border-border px-1.5 py-0.5 rounded font-mono font-bold text-text-main">12345678</code>). To keep your AI accounts, API keys, and endpoints secure, please set a custom password.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
            <Button
              variant="primary"
              onClick={handleGoToSettings}
              className="w-full h-11 text-sm font-semibold shadow-[var(--shadow-warm)] flex items-center justify-center gap-2 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">lock_reset</span>
              Update Password Now
            </Button>
            <Button
              variant="secondary"
              onClick={handleDismiss}
              className="w-full sm:w-auto h-11 px-5 text-sm text-text-muted hover:text-text-main cursor-pointer"
            >
              Remind Later
            </Button>
          </div>
        </div>
    </dialog>
  );
}
