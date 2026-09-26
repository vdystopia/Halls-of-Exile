import { getAvatar } from "@/lib/avatars";

export const dynamic = "force-dynamic";

/**
 * A player's picture. Pages link it with its last change in the query
 * (`avatarUrl`), so the answer can be cached for good: a new picture is a new URL.
 */
export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const avatar = getAvatar(username);
  if (!avatar) return new Response("No picture", { status: 404 });
  const versioned = new URL(request.url).searchParams.has("v");
  return new Response(new Uint8Array(avatar.image), {
    headers: {
      "content-type": avatar.type,
      "cache-control": versioned ? "public, max-age=31536000, immutable" : "no-cache",
      "x-content-type-options": "nosniff",
    },
  });
}
