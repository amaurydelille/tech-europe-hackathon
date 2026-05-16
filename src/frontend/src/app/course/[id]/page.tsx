import { readFileSync } from "fs";
import { join } from "path";
import { notFound } from "next/navigation";
import { parseCourse } from "@/lib/parseCourse";
import { CourseViewA } from "@/components/features/course/CourseViewA";

interface CoursePageProps {
  params: Promise<{ id: string }>;
}

export default async function CoursePage({ params }: CoursePageProps) {
  const { id } = await params;
  const coursePath = join(process.cwd(), "src/mock", id, "course.txt");
  const dataPath = join(process.cwd(), "src/mock", id, "data.json");
  let md: string;

  try {
    md = readFileSync(coursePath, "utf-8");
  } catch {
    notFound();
  }

  const course = parseCourse(md);

  try {
    const dataRaw = readFileSync(dataPath, "utf-8");
    const data = JSON.parse(dataRaw) as { course_title?: unknown };
    if (typeof data.course_title === "string" && data.course_title.trim()) {
      course.title = data.course_title.trim();
    }
  } catch {
    // Keep parsed title when data.json is missing or invalid.
  }

  return <CourseViewA course={course} courseId={id} />;
}
