import { fetcher } from "@/lib/fetcher";
import type { Course, Persona } from "@/types";

export const courseService = {
  generate: (persona: Persona) =>
    fetcher.post<Course>("/api/courses/generate", { persona }),

  getById: (id: string) =>
    fetcher.get<Course>(`/api/courses/${id}`),

  getAll: () =>
    fetcher.get<Course[]>("/api/courses"),
};
