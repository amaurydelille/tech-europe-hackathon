import type { CourseOutput, OnboardingProfile } from "@/types";

const PENDING_PROFILE_KEY = "gradium.pendingProfile";
const DRAFT_KEY = "gradium.courseDraft";

let pendingProfile: OnboardingProfile | null = null;
let draft: CourseOutput | null = null;

function canUseStorage() {
  return typeof window !== "undefined";
}

function readJson<T>(key: string): T | null {
  if (!canUseStorage()) return null;

  const value = window.sessionStorage.getItem(key);
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    window.sessionStorage.removeItem(key);
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (!canUseStorage()) return;
  window.sessionStorage.setItem(key, JSON.stringify(value));
}

export function setPendingProfile(profile: OnboardingProfile): void {
  pendingProfile = profile;
  writeJson(PENDING_PROFILE_KEY, profile);
}

export function getPendingProfile(): OnboardingProfile | null {
  pendingProfile = pendingProfile ?? readJson<OnboardingProfile>(PENDING_PROFILE_KEY);
  return pendingProfile;
}

export function setDraft(output: CourseOutput): void {
  draft = output;
  writeJson(DRAFT_KEY, output);
}

export function getDraft(): CourseOutput | null {
  draft = draft ?? readJson<CourseOutput>(DRAFT_KEY);
  return draft;
}

export function clear(): void {
  pendingProfile = null;
  draft = null;

  if (!canUseStorage()) return;
  window.sessionStorage.removeItem(PENDING_PROFILE_KEY);
  window.sessionStorage.removeItem(DRAFT_KEY);
}
