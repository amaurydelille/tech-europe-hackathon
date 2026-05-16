"use client";

import { useState } from "react";
import { courseService } from "@/services/course.service";
import type { Course, Persona } from "@/types";

export function useCourse() {
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(persona: Persona) {
    setLoading(true);
    setError(null);
    try {
      const result = await courseService.generate(persona);
      setCourse(result);
      return result;
    } catch (err) {
      setError((err as { message: string }).message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return { course, loading, error, generate };
}
