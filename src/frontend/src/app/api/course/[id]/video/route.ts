import { readFile } from "fs/promises";
import { join, normalize } from "path";
import { NextResponse } from "next/server";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const safeId = normalize(id).replace(/^([.][.][/\\])+/, "");
  const videoPath = join(process.cwd(), "src/mock", safeId, "video.mp4");

  try {
    const data = await readFile(videoPath);
    return new NextResponse(data, {
      headers: {
        "Content-Type": "video/mp4",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }
}
