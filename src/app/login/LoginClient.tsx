"use client";

import React, { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { login, LoginFormState } from "@/actions/auth";
import { useThemeScope } from "@/stores/themeStore";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { LoginPosterData } from "@/lib/loginPosters";
import {
  Box,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
} from "lucide-react";

const initialState: LoginFormState = {};

const EMAIL_KEY = "tsp:remembered-email";

function readRememberedEmail() {
  try {
    return localStorage.getItem(EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeRememberedEmail(email: string | null) {
  try {
    if (email) localStorage.setItem(EMAIL_KEY, email);
    else localStorage.removeItem(EMAIL_KEY);
  } catch {
    /* storage unavailable (private window, blocked site data) — nothing to remember */
  }
}

const SLIDE_MS = 6000;

/* ─── Poster slider ─────────────────────────────────────────────────────── */
function PosterSlider({ posters }: { posters: LoginPosterData[] }) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  const count = posters.length;
  const go = useCallback(
    (dir: 1 | -1) => setCurrent((c) => (c + dir + count) % count),
    [count]
  );

  // Restarting on `current` keeps the timer in step with the progress bar after manual changes.
  useEffect(() => {
    if (paused || count < 2) return;
    const t = setTimeout(() => go(1), SLIDE_MS);
    return () => clearTimeout(t);
  }, [current, paused, count, go]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Product highlights"
      className="group relative h-[300px] overflow-hidden rounded-3xl bg-neutral-950 text-white sm:h-[380px] md:h-full md:min-h-[560px] lg:min-h-[640px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
      }}
    >
      {/* Posters (cross-fade + slow zoom) */}
      {posters.map((p, i) => (
        <img
          key={p.id}
          src={p.imageUrl}
          alt=""
          aria-hidden={i !== current}
          onError={(e) => (e.currentTarget.style.display = "none")}
          className={`login-poster absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
            i === current ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}

      {/* Legibility gradients */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/40" />

      {/* Top row: brand + slide counter */}
      <div className="absolute inset-x-5 top-5 flex items-center justify-between sm:inset-x-7 sm:top-7">
        <img src="/Logo/TS+.BG.png" alt="Tile Studio Plus+" className="hidden h-10 w-auto object-contain md:block" />
        {count > 1 && (
          <span className="ml-auto font-mono text-xs font-medium tabular-nums tracking-widest text-white/80 [text-shadow:0_1px_6px_rgb(0_0_0/0.6)]" aria-hidden>
            {String(current + 1).padStart(2, "0")}
            <span className="mx-1.5 text-white/40">/</span>
            <span className="text-white/50">{String(count).padStart(2, "0")}</span>
          </span>
        )}
      </div>

      {/* Poster copy */}
      <div className="absolute inset-x-5 bottom-14 sm:inset-x-7 sm:bottom-16 md:bottom-24">
        <div key={current} className="login-poster-copy max-w-md space-y-2 sm:space-y-3" aria-live="polite">
          {posters[current].tag && (
            <span className="inline-block rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider backdrop-blur-md">
              {posters[current].tag}
            </span>
          )}
          <h2 className="text-xl font-semibold leading-[1.15] tracking-tight sm:text-2xl md:text-2xl lg:text-3xl xl:text-4xl">
            {posters[current].title}
          </h2>
          {posters[current].body && (
            <p className="line-clamp-2 text-sm leading-relaxed text-white/75 md:line-clamp-none">{posters[current].body}</p>
          )}
          {posters[current].buttonLabel &&
            (posters[current].buttonUrl ? (
              <a
                href={posters[current].buttonUrl}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-white/90"
              >
                {posters[current].buttonLabel}
                <ArrowRight className="h-4 w-4" />
              </a>
            ) : (
              <span className="inline-flex items-center gap-1.5 pt-1 text-sm font-semibold">
                {posters[current].buttonLabel}
                <ArrowRight className="h-4 w-4" />
              </span>
            ))}
        </div>
      </div>

      {/* Progress segments + arrows */}
      {count > 1 && (
      <div className="absolute inset-x-5 bottom-4 flex items-center gap-3 sm:inset-x-7 sm:bottom-7 sm:gap-4">
        <div className="flex flex-1 gap-2">
          {posters.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setCurrent(i)}
              aria-label={`Show poster ${i + 1}: ${p.title}`}
              aria-current={i === current}
              className="relative h-6 flex-1 cursor-pointer"
            >
              <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 overflow-hidden rounded-full bg-white/25">
                <span
                  key={i === current ? `active-${current}` : `idle-${i}`}
                  className={`block h-full rounded-full bg-white ${i === current ? "login-progress" : ""}`}
                  style={{
                    width: i < current ? "100%" : i === current ? undefined : "0%",
                    animationDuration: `${SLIDE_MS}ms`,
                    animationPlayState: paused ? "paused" : "running",
                  }}
                />
              </span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous poster"
            className="grid h-9 w-9 cursor-pointer place-content-center rounded-full border border-white/25 bg-black/30 backdrop-blur-md transition-colors hover:bg-white/20"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next poster"
            className="grid h-9 w-9 cursor-pointer place-content-center rounded-full border border-white/25 bg-black/30 backdrop-blur-md transition-colors hover:bg-white/20"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      )}
    </section>
  );
}

/* ─── Main page ─────────────────────────────────────────────────────────── */
export function LoginClient({ posters }: { posters: LoginPosterData[] }) {
  // The sign-in page is always dark, whatever theme the dashboards use.
  useThemeScope("login");
  const [state, formAction, isPending] = useActionState(login, initialState);
  const [showPw, setShowPw] = useState(false);
  const [email, setEmail] = useState("");
  const [remember, setRemember] = useState(false);
  // A failed sign-in message stays until the person edits a field or submits again
  const [errorDismissed, setErrorDismissed] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Prefill the last email used on this device; if there is one, jump straight to the password.
  useEffect(() => {
    const saved = readRememberedEmail();
    if (saved) {
      setEmail(saved);
      setRemember(true);
      passwordRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    setErrorDismissed(false);
  }, [state]);

  return (
    <main className="min-h-screen bg-background p-3 text-foreground md:p-4">
      <div className="login-enter mx-auto grid max-w-[1400px] grid-cols-1 gap-4 md:min-h-[calc(100dvh-2rem)] md:grid-cols-[1fr_1fr] lg:grid-cols-[1.15fr_1fr]">
        {/* Left — advertisement posters (banner above the form on phones and tablets) */}
        <div>
          <PosterSlider posters={posters} />
        </div>

        {/* Right — sign in */}
        <div className="relative flex flex-col items-center justify-center px-4 py-12 sm:px-10 md:px-8 lg:px-10">
          <div className="w-full max-w-[400px]">
            {/* Mobile brand (the logo art is light-on-dark, so give it a dark chip) */}
            <div className="login-item mb-8 md:hidden" style={{ animationDelay: "40ms" }}>
              <img
                src="/Logo/TS+.BG.png"
                alt="Tile Studio Plus+"
                className="h-12 w-auto rounded-xl bg-neutral-950 object-contain px-3 py-2"
              />
            </div>

            <header className="login-item mb-8 space-y-2" style={{ animationDelay: "80ms" }}>
              <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
              <p className="text-sm text-muted-foreground">
                Sign in to your showroom workspace to continue.
              </p>
            </header>

            <form
              action={formAction}
              onSubmit={() => writeRememberedEmail(remember ? email.trim() : null)}
              className="space-y-5"
            >
              {/* Email */}
              <div className="login-item space-y-2" style={{ animationDelay: "120ms" }}>
                <label htmlFor="email-address" className="text-sm font-medium">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="email-address"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setErrorDismissed(true);
                    }}
                    placeholder="name@showroom.com"
                    aria-invalid={!!state?.errors?.email}
                    className="ds-field login-auth-input h-12 pl-10 pr-3.5"
                  />
                </div>
                {state?.errors?.email && (
                  <p className="text-xs font-medium text-destructive">{state.errors.email[0]}</p>
                )}
              </div>

              {/* Password */}
              <div className="login-item space-y-2" style={{ animationDelay: "160ms" }}>
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="password"
                    name="password"
                    ref={passwordRef}
                    type={showPw ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    placeholder="Enter your password"
                    onChange={() => setErrorDismissed(true)}
                    aria-invalid={!!state?.errors?.password}
                    className="ds-field login-auth-input h-12 pl-10 pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((p) => !p)}
                    aria-label={showPw ? "Hide password" : "Show password"}
                    className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 cursor-pointer place-content-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {state?.errors?.password && (
                  <p className="text-xs font-medium text-destructive">{state.errors.password[0]}</p>
                )}
              </div>

              {/* Remember me */}
              <label
                htmlFor="remember-me"
                className="login-item flex w-fit cursor-pointer items-center gap-2.5"
                style={{ animationDelay: "200ms" }}
              >
                <span className="relative grid h-[18px] w-[18px] place-content-center">
                  <input
                    id="remember-me"
                    name="rememberMe"
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="peer sr-only"
                  />
                  <span className="absolute inset-0 rounded-md border border-input bg-field transition-colors peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background" />
                  <svg
                    className="pointer-events-none relative h-2.5 w-2.5 text-primary-foreground opacity-0 transition-opacity peer-checked:opacity-100"
                    viewBox="0 0 10 8"
                    fill="none"
                  >
                    <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="select-none text-sm text-muted-foreground">Remember my email on this device</span>
              </label>

              {state?.message && !errorDismissed && (
                <Alert variant="destructive" className="py-3">
                  <AlertDescription className="text-sm leading-snug">
                    {state.message}
                  </AlertDescription>
                </Alert>
              )}

              <button
                type="submit"
                disabled={isPending}
                className="ds-btn ds-btn-primary login-item h-12 w-full text-sm"
                style={{ animationDelay: "240ms" }}
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in to workspace
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            <p
              className="login-item mt-8 text-center text-sm text-muted-foreground"
              style={{ animationDelay: "280ms" }}
            >
              Need access? Contact your{" "}
              <span className="font-medium text-foreground">Tile Studio Plus+ Administrator</span>.
            </p>

            <div
              className="login-item mt-2 flex items-center justify-center gap-2 text-sm text-muted-foreground"
              style={{ animationDelay: "320ms" }}
            >
              <Box className="h-4 w-4 text-success" />
              3D tile visualizer · Instant PDF quotes
            </div>

            <div
              className="login-item mt-8 flex items-center justify-center gap-1.5 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground"
              style={{ animationDelay: "400ms" }}
            >
              <span>Powered by</span>
              {/* The logo file has wide empty margins, so it is drawn larger than it looks and the spare space is pulled back */}
              <a
                href="https://echilion.com"
                target="_blank"
                rel="noopener noreferrer"
                title="Visit Echilion"
                className="-my-9 block shrink-0 transition-opacity hover:opacity-80 focus-visible:rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
              >
                <img src="/Logo/logo_echilion.png" alt="Echilion" className="h-28 w-28 object-contain" />
              </a>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes loginEnter {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes loginCopy {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes loginProgress {
          from { width: 0%; }
          to   { width: 100%; }
        }
        .login-enter { opacity: 0; animation: loginEnter 0.5s cubic-bezier(.22,1,.36,1) forwards; }
        .login-item  { opacity: 0; animation: loginEnter 0.5s cubic-bezier(.22,1,.36,1) forwards; }
        .login-poster-copy { animation: loginCopy 0.7s cubic-bezier(.22,1,.36,1) both; }
        .login-progress { animation-name: loginProgress; animation-timing-function: linear; animation-fill-mode: forwards; }
        @media (prefers-reduced-motion: reduce) {
          .login-enter, .login-item, .login-poster-copy { animation: none; opacity: 1; }
        }
      `}</style>
    </main>
  );
}
