export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const ROUTES = {
  HOME: "/",
  ONBOARDING: "/onboarding",
  CHAT: "/chat",
  GENERATE: "/generate",
  COURSE: "/course",
} as const;
