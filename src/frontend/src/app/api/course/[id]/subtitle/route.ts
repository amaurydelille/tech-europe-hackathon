import { readFile } from "fs/promises";
import { join, normalize } from "path";
import { NextResponse } from "next/server";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const safeId = normalize(id).replace(/^([.][.][/\\])+/, "");
  const subtitlePath = join(process.cwd(), "src/mock", safeId, "subtitle.srt");

  try {
    const data = await readFile(subtitlePath, "utf-8");
    return new NextResponse(data, {
      headers: {
        "Content-Type": "application/x-subrip; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Subtitle not found" }, { status: 404 });
  }
}
