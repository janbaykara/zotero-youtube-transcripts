import type { TranscriptLine, TranscriptResponse } from "../transcript/types";
import type { HttpClient } from "./http";
import { parseCaptionXml } from "./parse-captions";
import {
  YouTubeIpBlockedError,
  YouTubeTranscriptError,
  type TranscriptConfig,
} from "./types";

// YouTube's public InnerTube API key.
const INNERTUBE_API_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const INNERTUBE_PLAYER_URL = `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}`;

// IOS client — ANDROID stopped returning captions in early 2026.
// IOS returns caption track URLs that work without PO tokens.
const INNERTUBE_CONTEXT = {
  client: {
    clientName: "IOS",
    clientVersion: "20.10.38",
    hl: "en",
    gl: "US",
  },
};

const IOS_USER_AGENT =
  "com.google.ios.youtube/20.10.38 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X)";

// Boundary with InnerTube's untyped JSON: only the fields this module reads.
interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
}

interface PlayerResponse {
  playabilityStatus?: { status?: string; reason?: string };
  videoDetails?: { title?: string };
  captions?: {
    playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] };
  };
}

export async function fetchTranscript(
  url: string,
  http: HttpClient,
  config?: TranscriptConfig,
): Promise<TranscriptResponse> {
  try {
    const videoId = extractVideoIdFromUrl(url);
    if (!videoId) {
      throw new YouTubeTranscriptError(
        new Error("Invalid YouTube URL - could not extract video ID"),
      );
    }

    let playerData: PlayerResponse;
    try {
      playerData = await fetchPlayerData(videoId, http, config);
    } catch (innerTubeError: unknown) {
      // Watch-page scrape sometimes still has captionTracks when InnerTube is throttled.
      const fromPage = await fetchPlayerDataFromWatchPage(videoId, http);
      if (fromPage) {
        playerData = fromPage;
      } else {
        throw innerTubeError;
      }
    }

    const title = playerData.videoDetails?.title || "Unknown";

    const captionsData = playerData.captions?.playerCaptionsTracklistRenderer;
    if (!captionsData || !captionsData.captionTracks) {
      throw new YouTubeTranscriptError(
        new Error("No captions available for this video"),
      );
    }

    const langCode = config?.lang || "en";
    const captionTrack = findCaptionTrack(captionsData.captionTracks, langCode);
    if (!captionTrack) {
      const availableLangs = captionsData.captionTracks
        .map((t) => t.languageCode)
        .join(", ");
      throw new YouTubeTranscriptError(
        new Error(
          `No transcript found for language '${langCode}'. Available: ${availableLangs}`,
        ),
      );
    }

    const lines = await fetchTranscriptFromUrl(captionTrack.baseUrl, http);

    return {
      title: decodeHtml(title),
      lines,
    };
  } catch (err: unknown) {
    if (
      err instanceof YouTubeIpBlockedError ||
      err instanceof YouTubeTranscriptError
    ) {
      throw err;
    }
    throw new YouTubeTranscriptError(err);
  }
}

function extractVideoIdFromUrl(url: string): string | null {
  const patterns = [
    /(?:(?:youtube|youtube-nocookie)\.com\/(?:watch\?v=|embed\/|shorts\/|v\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

async function fetchPlayerDataFromWatchPage(
  videoId: string,
  http: HttpClient,
): Promise<PlayerResponse | null> {
  try {
    const html = await http.request({
      url: `https://www.youtube.com/watch?v=${videoId}`,
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    const marker = "ytInitialPlayerResponse = ";
    const start = html.indexOf(marker);
    if (start < 0) return null;

    let i = start + marker.length;
    while (i < html.length && html[i] !== "{") i++;
    let depth = 0;
    let end = -1;
    for (let j = i; j < html.length; j++) {
      const c = html[j];
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          end = j + 1;
          break;
        }
      }
    }
    if (end < 0) return null;

    const data = JSON.parse(html.slice(i, end)) as PlayerResponse;
    const tracks =
      data.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!tracks?.length) return null;
    return data;
  } catch {
    return null;
  }
}

async function fetchPlayerData(
  videoId: string,
  http: HttpClient,
  config?: TranscriptConfig,
): Promise<PlayerResponse> {
  const context = {
    ...INNERTUBE_CONTEXT,
    client: {
      ...INNERTUBE_CONTEXT.client,
      hl: config?.lang || "en",
      gl: config?.country || "US",
    },
  };

  const body = JSON.stringify({ context, videoId });

  const responseText = await http.request({
    url: INNERTUBE_PLAYER_URL,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": IOS_USER_AGENT,
    },
    body,
  });

  const data = JSON.parse(responseText) as PlayerResponse;
  assertPlayable(data);
  return data;
}

function assertPlayable(data: PlayerResponse): void {
  const playabilityStatus = data.playabilityStatus;
  if (!playabilityStatus?.status) return;

  const reason = playabilityStatus.reason?.trim() || "";
  const status = playabilityStatus.status;

  if (status === "OK") return;

  // YouTube uses LOGIN_REQUIRED / UNPLAYABLE for bot/IP checks as well as real walls.
  if (isYouTubeIpBlockReason(reason)) {
    throw new YouTubeIpBlockedError(reason);
  }

  if (status === "LOGIN_REQUIRED") {
    throw new Error(reason || "This video requires login to view");
  }

  if (status === "ERROR" || status === "UNPLAYABLE") {
    throw new Error(reason || `Video is ${status.toLowerCase()}`);
  }
}

function isYouTubeIpBlockReason(reason: string): boolean {
  return /not a bot/i.test(reason) || /confirm you.?re not a bot/i.test(reason);
}

function findCaptionTrack(
  captionTracks: CaptionTrack[],
  langCode: string,
): CaptionTrack | null {
  let track = captionTracks.find((t) => t.languageCode === langCode);
  if (track) return track;

  track = captionTracks.find((t) => t.languageCode.startsWith(langCode + "-"));
  if (track) return track;

  track = captionTracks.find((t) => langCode.startsWith(t.languageCode + "-"));
  if (track) return track;

  if (captionTracks.length > 0) {
    return captionTracks[0];
  }

  return null;
}

async function fetchTranscriptFromUrl(
  transcriptUrl: string,
  http: HttpClient,
): Promise<TranscriptLine[]> {
  const responseText = await http.request({
    url: transcriptUrl,
    method: "GET",
    headers: {
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (responseText.length === 0) {
    throw new Error("Received empty transcript response");
  }

  return parseCaptionXml(responseText);
}

function decodeHtml(text: string): string {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(parseInt(code, 10)),
    )
    .replace(/\\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
