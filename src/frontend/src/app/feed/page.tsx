import { readdirSync } from "fs";
import { join } from "path";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function FeedPage() {
  const mockDir = join(process.cwd(), "src/mock");
  const ids = readdirSync(mockDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  if (ids.length === 0) {
    redirect("/onboarding");
  }
  const id = ids[Math.floor(Math.random() * ids.length)];
  redirect(`/course/${encodeURIComponent(id)}`);
}
