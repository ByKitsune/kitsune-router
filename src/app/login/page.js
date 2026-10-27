"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { BRAND } from "../../../branding/identity.mjs";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [resetHint, setResetHint] = useState("");
  const [retryAfter, setRetryAfter] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasPassword, setHasPassword] = useState(null);
  const [usesDefaultPassword, setUsesDefaultPassword] = useState(false);
  const [authMode, setAuthMode] = useState("password");
  const [ssoType, setSsoType] = useState("oidc");
  const [oidcConfigured, setOidcConfigured] = useState(false);
  const [oidcLoginLabel, setOidcLoginLabel] = useState("Sign in with OIDC");
  const [samlConfigured, setSamlConfigured] = useState(false);
  const [samlLoginLabel, setSamlLoginLabel] = useState("Sign in with SAML SSO");
  const [mustChange, setMustChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  // Countdown for rate-limit
  useEffect(() => {
    if (retryAfter <= 0) return;
    const id = setInterval(() => setRetryAfter((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [retryAfter]);

  useEffect(() => {
    async function checkAuth() {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

      try {
        const res = await fetch(`${baseUrl}/api/auth/status`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data.authenticated === true || data.requireLogin === false) {
            // Full reload on purpose: the session cookie changed, so the
            // client-side RSC cache must be dropped rather than soft-navigated.
            // eslint-disable-next-line kitsunerouter/no-location-assign-relative-destination
            window.location.assign("/dashboard");
            return;
          }
          setHasPassword(!!data.hasPassword);
          setUsesDefaultPassword(data.usesDefaultPassword === true);
          setAuthMode(data.authMode || "password");
          setSsoType(data.ssoType || "oidc");
          setOidcConfigured(data.oidcConfigured === true);
          setOidcLoginLabel(data.oidcLoginLabel || "Sign in with OIDC");
          setSamlConfigured(data.samlConfigured === true);
          setSamlLoginLabel(data.samlLoginLabel || "Sign in with SAML SSO");
        } else {
          // Safe fallback on non-OK response to avoid infinite loading state.
          setHasPassword(true);
          setUsesDefaultPassword(false);
        }
      } catch (err) {
        clearTimeout(timeoutId);
        setHasPassword(true);
        setUsesDefaultPassword(false);
      }
    }
    checkAuth();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (loading || retryAfter > 0) return;
    setLoading(true);
    setError("");
    setResetHint("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.mustChangePassword) {
          setMustChange(true);
          return;
        }
        // Full reload on purpose: a fresh session cookie was just issued.
        // eslint-disable-next-line kitsunerouter/no-location-assign-relative-destination
        window.location.assign("/dashboard");
      } else {
        const data = await res.json();
        setError(data.error || "Invalid password");
        if (data.resetHint) setResetHint(data.resetHint);
        if (data.retryAfter) setRetryAfter(Number(data.retryAfter));
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Force a new password before entering the dashboard (default + remote).
  const handleSetNewPassword = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: password, newPassword }),
      });
      if (res.ok) {
        // Full reload on purpose: credentials rotated, session cookie reissued.
        // eslint-disable-next-line kitsunerouter/no-location-assign-relative-destination
        window.location.assign("/dashboard");
      } else {
        const data = await res.json();
        setError(data.error || "Failed to set password");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOidcLogin = () => {
    // Route handler that answers with a 302 to the external IdP — a client-side
    // soft navigation cannot follow it, so a document-level load is required.
    // eslint-disable-next-line kitsunerouter/no-location-assign-relative-destination
    window.location.href = "/api/auth/oidc/start";
  };

  const handleSamlLogin = () => {
    // Route handler that answers with a 302 to the external IdP (see above).
    // eslint-disable-next-line kitsunerouter/no-location-assign-relative-destination
    window.location.href = "/api/auth/saml/start";
  };

  const isSsoEnabled = ["sso", "oidc", "saml", "both"].includes(authMode);
  const activeSsoType = ssoType || (authMode === "saml" ? "saml" : "oidc");

  const samlAvailable = isSsoEnabled && activeSsoType === "saml" && samlConfigured;
  const oidcAvailable = isSsoEnabled && activeSsoType === "oidc" && oidcConfigured;
  const ssoAvailable = samlAvailable || oidcAvailable;

  const passwordAvailable = authMode === "password" || authMode === "both" || !ssoAvailable;

  // Show loading state while checking password
  if (hasPassword === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg p-4">
        <div className="flex items-center gap-4" role="status">
          <Image src="/icons/logo.svg" alt="" width={40} height={40} />
          <p className="text-sm text-text-main">Checking sign-in options…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh flex-col bg-bg text-text-main">
      <header className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-6 px-5 py-6 sm:px-10">
        <Link href="/landing" className="flex items-center gap-2.5 text-base font-bold tracking-tight sm:text-lg">
          <Image src="/icons/logo.svg" alt="" width={34} height={34} />
          {BRAND.name}
        </Link>
        <a href={BRAND.docsUrl} className="inline-flex min-h-11 items-center text-sm font-semibold hover:underline underline-offset-4">Docs</a>
      </header>
      <main className="mx-auto grid w-full max-w-[1200px] flex-1 items-center gap-12 px-5 pb-12 pt-8 sm:px-10 lg:grid-cols-[1fr_0.9fr] lg:gap-24 lg:py-16">
        <div className="hidden lg:block">
          <Image src="/icons/logo.svg" alt="" width={112} height={112} className="mb-8" />
          <p className="text-[clamp(44px,4.5vw,64px)] font-semibold leading-[1.05] tracking-[-0.06em]">Your models.<br />Your routes.</p>
          <p className="mt-7 max-w-sm text-base leading-7">Your gateway’s connections, fallback rules and usage. Managed on your installation.</p>
          <p className="mt-12 max-w-sm text-sm leading-7 text-text-muted">Maintained and sponsored by <a href={BRAND.sponsorUrl} className="font-semibold underline underline-offset-4">{BRAND.organization}</a>. Use the providers you choose.</p>
        </div>
        <div className="mx-auto w-full max-w-md bg-bg-alt p-6 sm:p-9">
          <div className="mb-7">
            <h1 className="text-3xl font-semibold tracking-[-0.05em]">{mustChange ? "Set a new password" : "Open your dashboard"}</h1>
            <p className="mt-3 text-sm leading-6 text-text-muted">
              {mustChange
                ? "Choose a unique password to protect this installation."
                : samlAvailable
                  ? "Sign in with your SAML identity provider."
                  : oidcAvailable
                    ? "Sign in with your OIDC identity provider."
                    : "Sign in to this Kitsune Router installation."}
            </p>
          </div>
          {mustChange ? (
            <form onSubmit={handleSetNewPassword} className="flex flex-col gap-5" aria-busy={loading}>
              <div className="bg-surface-2 p-4">
                <p className="text-sm leading-6">
                  Set a secure password before accessing the dashboard remotely.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="new-password" className="text-sm font-semibold">New password</label>
                <input
                  id="new-password"
                  name="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setError(""); }}
                  autoComplete="new-password"
                  className="min-h-12 w-full border border-border bg-surface px-3 text-base text-text-main"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "login-error" : undefined}
                  required
                  autoFocus
                />
                <p id="login-error" className="text-sm leading-6 text-red-700 dark:text-red-300" role="alert">{error}</p>
              </div>
              <button type="submit" className="min-h-12 w-full bg-brand-500 px-5 py-3 text-sm font-bold text-white dark:text-bg disabled:cursor-not-allowed disabled:opacity-60" disabled={loading}>
                {loading ? "Saving password…" : "Set password & continue"}
              </button>
            </form>
          ) : (
          <div className="flex flex-col gap-5">
            {samlAvailable && (
              <button type="button" className="min-h-12 w-full bg-brand-500 px-5 py-3 text-sm font-bold text-white dark:text-bg" onClick={handleSamlLogin}>
                {samlLoginLabel}
              </button>
            )}

            {oidcAvailable && (
              <button type="button" className="min-h-12 w-full bg-brand-500 px-5 py-3 text-sm font-bold text-white dark:text-bg" onClick={handleOidcLogin}>
                {oidcLoginLabel}
              </button>
            )}

            {ssoAvailable && passwordAvailable && (
              <p className="text-center text-sm text-text-muted">Or use your dashboard password</p>
            )}

            {passwordAvailable ? (
              <form onSubmit={handleLogin} className="flex flex-col gap-5" aria-busy={loading}>
                {isSsoEnabled && !ssoAvailable && (
                  <p className="bg-surface-2 p-4 text-sm leading-6">
                    {activeSsoType === "saml" ? "SAML SSO" : "OIDC"} login is enabled, but configuration is incomplete. Password login is active.
                  </p>
                )}

                {authMode === "both" && ssoAvailable && (
                  <p className="text-sm leading-6 text-text-muted">
                    Password and {activeSsoType === "saml" ? "SAML SSO" : "OIDC"} login are both enabled.
                  </p>
                )}

                <div className="flex flex-col gap-2">
                  <label htmlFor="login-password" className="text-sm font-semibold">Password</label>
                  <input
                    id="login-password"
                    name="password"
                    type="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    autoComplete="current-password"
                    className="min-h-12 w-full border border-border bg-surface px-3 text-base text-text-main"
                    aria-invalid={error ? true : undefined}
                    aria-describedby={[error ? "login-error" : "", retryAfter > 0 ? "login-rate-limit" : "", resetHint ? "login-reset-hint" : ""].filter(Boolean).join(" ") || undefined}
                    required
                    autoFocus={!ssoAvailable}
                  />
                  <p id="login-error" className="text-sm leading-6 text-red-700 dark:text-red-300" role="alert">{error}</p>
                  {retryAfter > 0 && (
                    <p id="login-rate-limit" className="text-sm leading-6 text-text-muted">
                      Sign-in is temporarily paused. Retry in <span className="font-semibold tabular-nums">{retryAfter}s</span>.
                    </p>
                  )}
                  {resetHint && (
                    <p id="login-reset-hint" className="bg-surface-2 p-4 text-sm leading-6">
                      Forgot your password? Open the <code className="font-mono">{BRAND.binary}</code> CLI, then choose <strong>Settings → Reset Password to Default</strong>.
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  className="min-h-12 w-full bg-brand-500 px-5 py-3 text-sm font-bold text-white dark:text-bg disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={loading || retryAfter > 0}
                  aria-describedby={retryAfter > 0 ? "login-rate-limit" : undefined}
                >
                  {loading ? "Signing in…" : retryAfter > 0 ? `Wait ${retryAfter}s` : "Sign in to dashboard"}
                </button>

                {usesDefaultPassword === true && (
                  <div className="bg-surface-2 p-4">
                    <p className="text-sm leading-6">
                      Default password: <code className="font-mono font-semibold">12345678</code>. Change it in Settings after signing in.
                    </p>
                  </div>
                )}
                {hasPassword === false && (
                  <p className="text-sm leading-6 text-text-muted">
                    No custom password is configured. Set a unique password before exposing this installation remotely.
                  </p>
                )}
              </form>
            ) : (
              <p className="text-sm leading-6 text-red-700 dark:text-red-300" role="alert">{error}</p>
            )}
          </div>
          )}
        </div>
      </main>
      <footer className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-x-8 gap-y-2 px-5 py-6 text-xs leading-6 text-text-muted sm:px-10">
        <p>A provider-neutral AI gateway. {BRAND.tagline}</p>
        <p>Maintained by <a href={BRAND.sponsorUrl} className="font-semibold underline underline-offset-4">{BRAND.organization}</a>.</p>
      </footer>
    </div>
  );
}
