"use client";

import { useState } from "react";
import { courseService } from "@/services/course.service";
import type { CourseOutput, OnboardingProfile } from "@/types";

export function useCourse() {
  const [course, setCourse] = useState<CourseOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(profile: OnboardingProfile) {
    setLoading(true);
    setError(null);
    try {
      const result = await courseService.generate(profile);
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
