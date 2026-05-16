import { readdirSync } from "fs";
import { join } from "path";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function FeedPage() {
  const mockDir = join(process.cwd(), "src/mock");
  const ids = readdirSync(mockDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => b.localeCompare(a));
  if (ids.length === 0) {
    redirect("/onboarding");
  }
  redirect(`/course/${encodeURIComponent(ids[0])}`);
}
