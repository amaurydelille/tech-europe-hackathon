import { readFileSync } from "fs";
import { join } from "path";
import { parseCourse } from "@/lib/parseCourse";
import { CourseViewA } from "@/components/features/course/CourseViewA";

interface CoursePageProps {
  params: Promise<{ id: string }>;
}

export default async function CoursePage({ params }: CoursePageProps) {
  await params;
  const md = readFileSync(join(process.cwd(), "src/mock/exemple.txt"), "utf-8");
  const course = parseCourse(md);
  return <CourseViewA course={course} />;
}
