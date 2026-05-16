import { readFile } from "fs/promises";
import { join, normalize } from "path";
import { NextResponse } from "next/server";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const safeId = normalize(id).replace(/^([.][.][/\\])+/, "");
  const socialsPath = join(process.cwd(), "src/mock", safeId, "socials.json");

  try {
    const data = await readFile(socialsPath, "utf-8");
    return new NextResponse(data, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { likes: 0, shares: 0, comments: [] },
      { status: 200 },
    );
  }
}
