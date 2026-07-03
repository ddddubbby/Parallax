"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { constantTimeEqual, createSessionToken } from "@/core/auth";
import { SESSION_COOKIE } from "./constants";
import { checkLockout, clearFailures, recordFailure } from "./rate-limit";

async function clientIdentifier(): Promise<string> {
  const h = await headers();
  // Render sets x-forwarded-for; falls back to a fixed key for local dev
  // (single machine, rate limiting by IP is meaningless there anyway).
  return h.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
}

export type LoginResult = { ok: true } | { ok: false; error: string };

/** ST-6: rate-limited, constant-time, session cookie <=7 days, never in a URL. */
export async function login(password: string): Promise<LoginResult> {
  const identifier = await clientIdentifier();

  if (checkLockout(identifier)) {
    return { ok: false, error: "Too many failed attempts. Try again in 15 minutes." };
  }

  const appPassword = process.env.APP_PASSWORD;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!appPassword || !sessionSecret) {
    return { ok: false, error: "Server is not configured (APP_PASSWORD/SESSION_SECRET missing)." };
  }

  if (!constantTimeEqual(password, appPassword)) {
    recordFailure(identifier);
    return { ok: false, error: "Incorrect password." };
  }

  clearFailures(identifier);
  const token = createSessionToken(sessionSecret);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.APP_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  return { ok: true };
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
