export interface ListItem {
  term: string;
  body: string;
}

export type Block =
  | { kind: "para"; text: string }
  | { kind: "list"; items: ListItem[] }
  | { kind: "callout"; label: string; text: string }
  | { kind: "math"; latex: string };

export interface CourseChapter {
  title: string;
  blocks: Block[];
  readTimeSec: number;
}

export interface CourseSource {
  n: number;
  title: string;
  url: string;
  site: string;
}

export interface ParsedCourse {
  title: string;
  chapters: CourseChapter[];
  sources: CourseSource[];
  totalReadMin: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function blocksWordCount(blocks: Block[]): number {
  return blocks.reduce((sum, b) => {
    if (b.kind === "para") return sum + wordCount(b.text);
    if (b.kind === "callout") return sum + wordCount(b.text);
    if (b.kind === "math") return sum;
    return sum + b.items.reduce((s: number, i: ListItem) => s + wordCount(i.term + " " + i.body), 0);
  }, 0);
}

const BLOCK_MATH_RE = /^\$\$([\s\S]+?)\$\$$/;

// ── Parsers ──────────────────────────────────────────────────────────

function extractTitle(md: string): string {
  const m = md.match(/^#\s+(.+)/m);
  return m ? m[1].trim() : "Course";
}

function splitSections(md: string): { heading: string; body: string }[] {
  const parts = md.split(/^##\s+/m);
  // parts[0] is pre-section content (title)
  return parts.slice(1).map((part) => {
    const nl = part.indexOf("\n");
    return {
      heading: nl >= 0 ? part.slice(0, nl).trim() : part.trim(),
      body: nl >= 0 ? part.slice(nl + 1).trim() : "",
    };
  });
}

function parseBlocks(body: string): Block[] {
  const paragraphs = body.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);

  return paragraphs.map((para) => {
    const mathMatch = para.match(BLOCK_MATH_RE);
    if (mathMatch) {
      return { kind: "math" as const, latex: mathMatch[1].trim() };
    }

    const lines = para.split("\n");
    const isList = lines.every((l) => /^-\s/.test(l.trim()));

    if (lines[0].startsWith("### ")) {
      const label = lines[0].replace(/^###\s+/, "").trim();
      const text = lines.slice(1).join("\n").trim();
      return { kind: "callout" as const, label, text };
    }

    if (isList) {
      const items: ListItem[] = lines.map((line) => {
        const text = line.trim().replace(/^-\s*/, "");
        const m = text.match(/^\*\*(.+?)\*\*:\s*([\s\S]+)$/);
        return m ? { term: m[1], body: m[2] } : { term: "", body: text };
      });
      return { kind: "list" as const, items };
    }

    return { kind: "para" as const, text: para };
  });
}

function parseSources(body: string): CourseSource[] {
  const sources: CourseSource[] = [];
  const re = /^\d+\.\s+\[(.+?)\]\((.+?)\)/gm;
  let m: RegExpExecArray | null;
  let n = 1;

  while ((m = re.exec(body)) !== null) {
    const label = m[1];
    const url = m[2];
    const pipeIdx = label.lastIndexOf(" | ");

    const title = pipeIdx >= 0 ? label.slice(0, pipeIdx).trim() : label.trim();
    let site: string;
    if (pipeIdx >= 0) {
      site = label.slice(pipeIdx + 3).trim();
    } else {
      try {
        site = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        site = url;
      }
    }

    sources.push({ n, title, url, site });
    n++;
  }

  return sources;
}

// ── Main export ──────────────────────────────────────────────────────

export function parseCourse(md: string): ParsedCourse {
  const title = extractTitle(md);

  // Separate the references block — supports both:
  //   "## References" inside the content  (original format)
  //   "---\n# References"                 (h1 after thematic break)
  let contentMd = md;
  let refBody = "";

  const hrRefMatch = md.match(/^---\s*\n([\s\S]*?^#{1,2}\s+[Rr]eferences\s*\n)([\s\S]*)$/m);
  if (hrRefMatch) {
    contentMd = md.slice(0, md.indexOf("\n---"));
    refBody = hrRefMatch[2];
  }

  const rawSections = splitSections(contentMd);

  // Also handle legacy ## References section within the content
  const refSection = rawSections.find((s) => s.heading.toLowerCase() === "references");
  const contentSections = rawSections.filter((s) => s.heading.toLowerCase() !== "references");
  if (!refBody && refSection) refBody = refSection.body;

  const chapters: CourseChapter[] = contentSections.map((s) => {
    const blocks = parseBlocks(s.body);
    const words = blocksWordCount(blocks);
    return {
      title: s.heading,
      blocks,
      readTimeSec: Math.max(20, Math.round((words / 200) * 60)),
    };
  });

  const sources = parseSources(refBody);

  // Count actual words directly — bypasses the per-chapter Math.max(20) clamp
  const totalWords = chapters.reduce(
    (sum, c) => sum + blocksWordCount(c.blocks),
    0
  );
  const totalReadMin = Math.max(1, Math.round(totalWords / 200));

  return { title, chapters, sources, totalReadMin };
}
