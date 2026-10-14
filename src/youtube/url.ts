const YOUTUBE_DOMAINS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "mobile.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
  "www.youtu.be",
]);

const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

export function extractVideoId(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;

  const bare = url.trim();
  if (VIDEO_ID_PATTERN.test(bare)) return bare;

  let parsed: URL;
  try {
    parsed = new URL(bare);
  } catch {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!YOUTUBE_DOMAINS.has(hostname)) return null;

  if (hostname.endsWith("youtu.be")) {
    const videoId = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
    return VIDEO_ID_PATTERN.test(videoId) ? videoId : null;
  }

  if (parsed.pathname === "/watch") {
    const videoId = parsed.searchParams.get("v") ?? "";
    return VIDEO_ID_PATTERN.test(videoId) ? videoId : null;
  }

  const pathMatch = parsed.pathname.match(
    /^\/(?:embed|shorts|v|live)\/([a-zA-Z0-9_-]{11})(?:\/|$)/,
  );
  return pathMatch?.[1] ?? null;
}

export function isValidYouTubeUrl(url: string | null | undefined): boolean {
  return extractVideoId(url) !== null;
}

export function extractYouTubeUrlFromText(
  text: string | null | undefined,
): string | null {
  if (!text || typeof text !== "string") return null;

  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  const matches = text.match(urlRegex);
  if (!matches) return null;

  for (const match of matches) {
    if (isValidYouTubeUrl(match)) return match;
  }
  return null;
}

export function buildTimestampUrl(url: string, offsetMs: number): string {
  if (!url || typeof url !== "string") return "";

  try {
    const parsed = new URL(url);
    const seconds = Math.max(0, Math.floor(offsetMs / 1000));
    parsed.searchParams.set("t", seconds.toString());
    return parsed.toString();
  } catch {
    return url;
  }
}
