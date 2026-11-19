import { toReading } from "@/lib/reading";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { texts?: unknown; keepLatin?: unknown } | null;
  const texts = body?.texts;
  if (!Array.isArray(texts) || texts.some((t) => typeof t !== "string") || texts.length > 50) {
    return Response.json({ error: "texts must be an array of up to 50 strings" }, { status: 400 });
  }
  if ((texts as string[]).some((t) => t.length > 20000)) {
    return Response.json({ error: "text too long" }, { status: 413 });
  }
  const keepLatin = body?.keepLatin === true;
  const kana = await Promise.all((texts as string[]).map((t) => toReading(t, keepLatin)));
  return Response.json({ kana });
}
