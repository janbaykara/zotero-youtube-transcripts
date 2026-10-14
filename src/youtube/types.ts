export interface TranscriptConfig {
  lang?: string;
  country?: string;
}

export class YouTubeTranscriptError extends Error {
  constructor(err: unknown) {
    if (!(err instanceof Error)) {
      super("Unknown transcript error");
      return;
    }

    if (err.message.includes("ERR_INVALID_URL")) {
      super("Invalid YouTube URL");
    } else {
      super(err.message);
    }
  }
}

/** YouTube refused the request (bot/IP check), often VPN or datacenter IPs. */
export class YouTubeIpBlockedError extends Error {
  readonly code = "YOUTUBE_IP_BLOCKED" as const;

  constructor(reason?: string) {
    super(reason?.trim() || "Sign in to confirm you’re not a bot");
    this.name = "YouTubeIpBlockedError";
  }
}
