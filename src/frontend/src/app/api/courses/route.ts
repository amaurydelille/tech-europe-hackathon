import { readdir, stat } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";

export async function GET() {
  const mockDir = join(process.cwd(), "src/mock");

  try {
    const entries = await readdir(mockDir);
    const ids: string[] = [];
    for (const entry of entries) {
      const full = join(mockDir, entry);
      try {
        const s = await stat(full);
        if (s.isDirectory()) ids.push(entry);
      } catch {
        // skip unreadable entries
      }
    }
    ids.sort((a, b) => b.localeCompare(a));
    return NextResponse.json({ ids });
  } catch {
    return NextResponse.json({ ids: [] }, { status: 200 });
  }
}
