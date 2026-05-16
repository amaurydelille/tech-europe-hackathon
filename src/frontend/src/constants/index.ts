export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const ONBOARDING_WS_URL =
  process.env.NEXT_PUBLIC_ONBOARDING_WS ?? "ws://localhost:8000/ws/onboarding";

export const ROUTES = {
  HOME: "/",
  FEED: "/feed",
  ONBOARDING: "/onboarding",
  CHAT: "/chat",
  GENERATE: "/generate",
  DRAFT: "/draft",
  COURSE: "/course",
} as const;
