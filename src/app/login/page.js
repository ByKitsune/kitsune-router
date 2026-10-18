"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Card, Button, Input } from "@/shared/components";

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
            // eslint-disable-next-line zenrouter/no-location-assign-relative-destination
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
        // eslint-disable-next-line zenrouter/no-location-assign-relative-destination
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
        // eslint-disable-next-line zenrouter/no-location-assign-relative-destination
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
    // eslint-disable-next-line zenrouter/no-location-assign-relative-destination
    window.location.href = "/api/auth/oidc/start";
  };

  const handleSamlLogin = () => {
    // Route handler that answers with a 302 to the external IdP (see above).
    // eslint-disable-next-line zenrouter/no-location-assign-relative-destination
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
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-text-muted mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4 relative overflow-hidden">
      {/* Dynamic ambient gradient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-brand-500/10 dark:bg-brand-500/15 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-[300px] h-[200px] bg-accent-sun/10 rounded-full blur-[100px] pointer-events-none" />
      {/* Faint grid background */}
      <div className="landing-grid absolute inset-0 pointer-events-none opacity-40" aria-hidden="true" />
      
      <div className="relative z-10 w-full max-w-md animate-in fade-in zoom-in-95 duration-300">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-surface border border-border p-3 mb-4 shadow-[var(--shadow-warm)] hover:scale-105 transition-transform duration-300">
            <Image src="/icons/logo.svg" alt="ZenRouter" width={40} height={40} className="h-full w-full object-contain" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-text-main mb-1.5 flex items-center justify-center gap-2">
            ZenRouter
            <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-500/20">Gateway</span>
          </h1>
          <p className="text-sm text-text-muted max-w-xs mx-auto">
            {samlAvailable
              ? "Sign in with SAML 2.0 Single Sign-On"
              : oidcAvailable
              ? "Sign in with your OIDC identity provider"
              : "Serene AI Gateway & Intelligent Routing Engine"}
          </p>
        </div>

        <div className="bg-surface/85 backdrop-blur-xl border border-border rounded-2xl p-6 sm:p-8 shadow-[var(--shadow-elev)]">
          {mustChange ? (
            <form onSubmit={handleSetNewPassword} className="flex flex-col gap-4">
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  Set a secure password before accessing the dashboard remotely.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">New Password</label>
                <Input
                  type="password"
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoFocus
                />
                {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
              </div>
              <Button type="submit" variant="primary" className="w-full h-11" loading={loading} disabled={!newPassword}>
                Set Password &amp; Continue
              </Button>
            </form>
          ) : (
          <div className="flex flex-col gap-5">
            {samlAvailable && (
              <Button type="button" variant="primary" className="w-full h-11" onClick={handleSamlLogin}>
                {samlLoginLabel}
              </Button>
            )}

            {oidcAvailable && (
              <Button type="button" variant="primary" className="w-full h-11" onClick={handleOidcLogin}>
                {oidcLoginLabel}
              </Button>
            )}

            {ssoAvailable && passwordAvailable && (
              <div className="relative flex items-center justify-center">
                <div className="border-t border-border w-full" />
                <span className="bg-surface px-3 text-xs uppercase tracking-wider text-text-subtle absolute">or</span>
              </div>
            )}

            {passwordAvailable ? (
              <form onSubmit={handleLogin} className="flex flex-col gap-4">
                {isSsoEnabled && !ssoAvailable && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 text-center bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20">
                    {activeSsoType === "saml" ? "SAML SSO" : "OIDC"} login is enabled, but configuration is incomplete. Password login is active.
                  </p>
                )}

                {authMode === "both" && ssoAvailable && (
                  <p className="text-xs text-text-muted text-center">
                    Password and {activeSsoType === "saml" ? "SAML SSO" : "OIDC"} login are both enabled.
                  </p>
                )}

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">Password</label>
                  </div>
                  <Input
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoFocus={!oidcAvailable}
                  />
                  {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
                  {retryAfter > 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Locked. Retry in <span className="font-mono font-bold">{retryAfter}s</span>.
                    </p>
                  )}
                  {resetHint && (
                    <p className="text-xs text-text-muted bg-surface-2 p-2 rounded-lg border border-border">
                      Forgot password? Open <code className="bg-surface px-1 py-0.5 rounded text-brand-600 dark:text-brand-400 font-mono">zenrouter</code> CLI → <b>Settings</b> → <b>Reset Password to Default</b>.
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full h-11 text-sm font-semibold cursor-pointer shadow-[var(--shadow-warm)]"
                  loading={loading}
                  disabled={retryAfter > 0}
                >
                  {retryAfter > 0 ? `Wait ${retryAfter}s` : "Sign In to Dashboard"}
                </Button>

                {usesDefaultPassword === true && (
                  <div className="text-center pt-1">
                    <p className="text-xs text-text-muted">
                      Default password is <code className="bg-surface-2 border border-border px-1.5 py-0.5 rounded font-mono font-medium text-text-main">12345678</code>
                    </p>
                  </div>
                )}
                {hasPassword === false && (
                  <p className="text-xs text-center text-amber-600 dark:text-amber-400">
                    Security notice: default password active. You will be prompted to update it on remote access.
                  </p>
                )}
              </form>
            ) : (
              error && <p className="text-xs text-red-500 font-medium text-center">{error}</p>
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
