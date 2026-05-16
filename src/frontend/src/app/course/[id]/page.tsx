import { readFileSync } from "fs";
import { join } from "path";
import { notFound } from "next/navigation";
import { parseCourse } from "@/lib/parseCourse";
import { CourseViewA } from "@/components/features/course/CourseViewA";

interface CoursePageProps {
  params: Promise<{ id: string }>;
}

interface CourseDataReference {
  id?: unknown;
  title?: unknown;
  url?: unknown;
}

interface CourseData {
  course_title?: unknown;
  full_markdown?: unknown;
  condensed_markdown?: unknown;
  references?: unknown;
}

function referencesToMarkdown(refs: CourseDataReference[]): string {
  const lines = refs
    .map((r) => {
      const id = typeof r.id === "number" ? r.id : Number(r.id);
      const title = typeof r.title === "string" ? r.title.trim() : "";
      const url = typeof r.url === "string" ? r.url.trim() : "";
      if (!Number.isFinite(id) || !title || !url) return null;
      return { id, title, url };
    })
    .filter((x): x is { id: number; title: string; url: string } => x !== null)
    .sort((a, b) => a.id - b.id)
    .map((r) => `${r.id}. [${r.title}](${r.url})`);
  if (lines.length === 0) return "";
  return `\n\n---\n# References\n${lines.join("\n")}\n`;
}

export default async function CoursePage({ params }: CoursePageProps) {
  const { id } = await params;
  const dataPath = join(process.cwd(), "src/mock", id, "data.json");

  let data: CourseData;
  try {
    data = JSON.parse(readFileSync(dataPath, "utf-8")) as CourseData;
  } catch {
    notFound();
  }

  const md = typeof data.condensed_markdown === "string" ? data.condensed_markdown : "";
  if (!md.trim()) {
    notFound();
  }

  const refs = Array.isArray(data.references)
    ? (data.references as CourseDataReference[])
    : [];
  const course = parseCourse(md + referencesToMarkdown(refs));

  if (typeof data.course_title === "string" && data.course_title.trim()) {
    course.title = data.course_title.trim();
  }

  return <CourseViewA course={course} courseId={id} />;
}
