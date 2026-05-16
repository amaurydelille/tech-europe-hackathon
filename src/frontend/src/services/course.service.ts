import { fetcher } from "@/lib/fetcher";
import type { Course, CourseOutput, OnboardingProfile } from "@/types";

export const courseService = {
  generate: (profile: OnboardingProfile) =>
    fetcher.post<CourseOutput>("/courses/generation", profile),

  getById: (id: string) =>
    fetcher.get<Course>(`/api/courses/${id}`),

  getAll: () =>
    fetcher.get<Course[]>("/api/courses"),
};
