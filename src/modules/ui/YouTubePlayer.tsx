import { useEffect, useRef } from "preact/hooks";
import { createXULElement } from "@janbaykara/zotero-chrome";

export interface YouTubePlayerHandle {
  seekTo: (seconds: number, opts?: { play?: boolean }) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  isPlaying: () => boolean;
}

interface YouTubePlayerProps {
  videoId: string;
  onTimeUpdate: (seconds: number) => void;
  /** Fired when MediaController play/pause state changes. */
  onPlayingChange?: (playing: boolean) => void;
  playerRef: { current: YouTubePlayerHandle | null };
}

/** HTTPS Referer — required to avoid YouTube error 153. */
const EMBED_REFERRER = "https://www.zotero.org/";

type BrowserEl = HTMLElement & {
  src?: string;
  loadURI?: (uri: unknown, options?: Record<string, unknown>) => void;
  webNavigation?: {
    loadURI?: (uri: string, options?: Record<string, unknown>) => void;
  };
  browsingContext?: {
    mediaController?: MediaControllerLike | null;
  };
  contentTitle?: string;
};

/** Firefox MediaController on remote <browser> browsingContext. */
interface MediaControllerLike {
  isPlaying: boolean;
  playbackState: string;
  isMuted?: boolean;
  seekTo: (position: number) => void;
  play: () => void;
  pause: () => void;
  mute?: () => void;
  unmute?: () => void;
  addEventListener: (type: string, listener: (event: any) => void) => void;
  removeEventListener: (type: string, listener: (event: any) => void) => void;
}

interface PositionSample {
  position: number;
  atMs: number;
  rate: number;
  playing: boolean;
}

function embedUrl(
  videoId: string,
  startSeconds?: number,
  opts?: { autoplay?: boolean; mute?: boolean; bustCache?: boolean },
): string {
  const params = new URLSearchParams({
    enablejsapi: "1",
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
    // Prefer captions off — transcript is shown beside the player.
    cc_load_policy: "0",
    origin: "https://www.zotero.org",
    widget_referrer: "https://www.zotero.org",
  });
  if (startSeconds != null && startSeconds > 0) {
    params.set("start", String(Math.floor(startSeconds)));
  }
  if (opts?.autoplay) {
    params.set("autoplay", "1");
  }
  // Browsers block unmuted autoplay; mute so cold-start cue clicks can play.
  if (opts?.mute) {
    params.set("mute", "1");
  }
  if (opts?.bustCache) {
    params.set("_", String(Date.now()));
  }
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?${params}`;
}

function getServices(): any {
  try {
    const win = Zotero.getMainWindow() as any;
    if (win?.Services) return win.Services;
  } catch {
    // ignore
  }
  return (globalThis as any).Services ?? null;
}

function getCcCi(): { Cc: any; Ci: any } | null {
  try {
    const win = Zotero.getMainWindow() as any;
    if (win?.Cc && win?.Ci) return { Cc: win.Cc, Ci: win.Ci };
  } catch {
    // ignore
  }
  const g = globalThis as any;
  if (g.Cc && g.Ci) return { Cc: g.Cc, Ci: g.Ci };
  return null;
}

function loadYouTubeEmbed(
  browser: BrowserEl,
  videoId: string,
  startSeconds?: number,
  opts?: { autoplay?: boolean; mute?: boolean; bustCache?: boolean },
): void {
  const url = embedUrl(videoId, startSeconds, opts);
  const Services = getServices();
  const ccci = getCcCi();

  try {
    if (Services?.io && ccci) {
      const { Cc, Ci } = ccci;
      const uri = Services.io.newURI(url);
      const referrer = Services.io.newURI(EMBED_REFERRER);
      const referrerInfo = Cc["@mozilla.org/referrer-info;1"].createInstance(
        Ci.nsIReferrerInfo,
      );
      const policy =
        Ci.nsIReferrerInfo.STRICT_ORIGIN_WHEN_CROSS_ORIGIN ??
        Ci.nsIReferrerInfo.ORIGIN_WHEN_CROSS_ORIGIN ??
        Ci.nsIReferrerInfo.UNSAFE_URL;
      referrerInfo.init(policy, true, referrer);

      const triggeringPrincipal =
        Services.scriptSecurityManager.createContentPrincipal(referrer, {});

      if (typeof browser.loadURI === "function") {
        browser.loadURI(uri, { triggeringPrincipal, referrerInfo });
        return;
      }
      if (typeof browser.webNavigation?.loadURI === "function") {
        browser.webNavigation.loadURI(url, {
          triggeringPrincipal,
          referrerInfo,
        });
        return;
      }
    }
  } catch (err) {
    ztoolkit.log("YouTubePlayer: referrer load failed, src fallback", err);
  }

  browser.setAttribute("src", url);
  try {
    browser.src = url;
  } catch {
    // attribute only
  }
}

function estimateSeconds(sample: PositionSample | null, nowMs: number): number {
  if (!sample) return 0;
  if (!sample.playing) return Math.max(0, sample.position);
  const elapsed = (nowMs - sample.atMs) / 1000;
  return Math.max(0, sample.position + elapsed * (sample.rate || 1));
}

/**
 * Remote XUL <browser> → YouTube embed.
 * Time sync via Firefox MediaController (JSWindowActors cannot load into
 * YouTube's webIsolated content process).
 */
export function YouTubePlayer({
  videoId,
  onTimeUpdate,
  onPlayingChange,
  playerRef,
}: YouTubePlayerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const onTimeRef = useRef(onTimeUpdate);
  onTimeRef.current = onTimeUpdate;
  const onPlayingRef = useRef(onPlayingChange);
  onPlayingRef.current = onPlayingChange;
  const lastPlayingRef = useRef<boolean | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !videoId) return;

    const doc = host.ownerDocument;
    const chromeWin = doc.defaultView;
    if (!doc || !chromeWin) return;

    while (host.firstChild) {
      host.removeChild(host.firstChild);
    }

    const browser = createXULElement(doc, "browser") as BrowserEl;
    browser.id = `yt-watch-browser-${videoId}`;
    browser.setAttribute("type", "content");
    browser.setAttribute("remote", "true");
    browser.setAttribute("maychangeremoteness", "true");
    browser.setAttribute("disableglobalhistory", "true");
    browser.setAttribute("autoscroll", "false");
    browser.style.width = "100%";
    browser.style.height = "100%";
    browser.style.display = "flex";
    browser.style.flex = "1";
    host.appendChild(browser);

    let sample: PositionSample | null = null;
    let media: MediaControllerLike | null = null;
    let pollTimer: number | null = null;
    let attachTimer: number | null = null;
    lastPlayingRef.current = null;

    const emit = (seconds: number) => {
      if (Number.isFinite(seconds)) onTimeRef.current(seconds);
    };

    const emitPlaying = (playing: boolean) => {
      if (lastPlayingRef.current === playing) return;
      lastPlayingRef.current = playing;
      onPlayingRef.current?.(playing);
    };

    const mediaPlaying = (): boolean =>
      !!media && (!!media.isPlaying || media.playbackState === "playing");

    const onPosition = (event: any) => {
      const position = Number(event?.position);
      if (!Number.isFinite(position)) return;
      const rate = Number(event?.playbackRate);
      const playing = mediaPlaying();
      sample = {
        position,
        atMs: Date.now(),
        rate: Number.isFinite(rate) && rate > 0 ? rate : 1,
        playing,
      };
      emit(position);
      emitPlaying(playing);
    };

    const onPlayback = () => {
      const playing = mediaPlaying();
      if (sample) {
        sample = {
          ...sample,
          atMs: Date.now(),
          playing,
        };
        emit(sample.position);
      }
      emitPlaying(playing);
    };

    const detachMedia = () => {
      if (!media) return;
      try {
        media.removeEventListener("positionstatechange", onPosition);
        media.removeEventListener("playbackstatechange", onPlayback);
      } catch {
        // ignore
      }
      media = null;
    };

    const attachMedia = (): boolean => {
      const next = browser.browsingContext?.mediaController ?? null;
      if (!next || next === media) return !!media;
      detachMedia();
      media = next;
      try {
        media.addEventListener("positionstatechange", onPosition);
        media.addEventListener("playbackstatechange", onPlayback);
        ztoolkit.log("YouTubePlayer: MediaController attached");
        emitPlaying(mediaPlaying());
      } catch (err) {
        ztoolkit.log("YouTubePlayer: MediaController attach failed", err);
        media = null;
        return false;
      }
      return true;
    };

    // Position events are sparse — interpolate while playing for line sync.
    const startPolling = () => {
      if (pollTimer != null) return;
      pollTimer = chromeWin.setInterval(() => {
        attachMedia();
        if (sample && media) {
          const playing = mediaPlaying();
          if (playing !== sample.playing) {
            sample = {
              ...sample,
              atMs: Date.now(),
              position: estimateSeconds(sample, Date.now()),
              playing,
            };
            emitPlaying(playing);
          } else {
            sample = { ...sample, playing };
          }
        } else if (media) {
          emitPlaying(mediaPlaying());
        }
        if (sample) emit(estimateSeconds(sample, Date.now()));
      }, 200);
    };

    const srcTimer = chromeWin.setTimeout(() => {
      loadYouTubeEmbed(browser, videoId);
      startPolling();
      // Controller appears after media starts; keep trying briefly.
      let tries = 0;
      const tryAttach = () => {
        tries += 1;
        if (attachMedia() || tries > 40) return;
        attachTimer = chromeWin.setTimeout(tryAttach, 250);
      };
      tryAttach();
    }, 0);

    let ensurePlayTimer: number | null = null;
    let unmuteTimer: number | null = null;

    const clearEnsureTimers = () => {
      if (ensurePlayTimer != null) {
        chromeWin.clearTimeout(ensurePlayTimer);
        ensurePlayTimer = null;
      }
      if (unmuteTimer != null) {
        chromeWin.clearTimeout(unmuteTimer);
        unmuteTimer = null;
      }
    };

    const applySample = (t: number, playing: boolean) => {
      sample = {
        position: t,
        atMs: Date.now(),
        rate: sample?.rate || 1,
        playing,
      };
      emit(t);
      emitPlaying(playing);
    };

    /**
     * Cold start: unmuted autoplay is blocked, so load muted+autoplay then unmute.
     * Prefer in-place MediaController seek/play whenever a session already exists.
     */
    const reloadMutedAutoplay = (t: number) => {
      clearEnsureTimers();
      detachMedia();
      loadYouTubeEmbed(browser, videoId, t, {
        autoplay: true,
        mute: true,
        bustCache: true,
      });
      applySample(t, true);
      let tries = 0;
      const tryAttach = () => {
        tries += 1;
        if (attachMedia()) {
          // Unmute once playback has actually started (or after a few tries).
          const finishUnmute = () => {
            if (!attachMedia() || !media) return;
            try {
              media.unmute?.();
            } catch (err) {
              ztoolkit.log("YouTubePlayer: unmute failed", err);
            }
          };
          if (mediaPlaying()) {
            finishUnmute();
            return;
          }
          unmuteTimer = chromeWin.setTimeout(() => {
            attachMedia();
            finishUnmute();
            if (!mediaPlaying()) {
              try {
                media?.play();
              } catch {
                // ignore
              }
              unmuteTimer = chromeWin.setTimeout(finishUnmute, 400);
            }
          }, 400);
          return;
        }
        if (tries > 40) return;
        attachTimer = chromeWin.setTimeout(tryAttach, 250);
      };
      if (attachTimer != null) chromeWin.clearTimeout(attachTimer);
      attachTimer = chromeWin.setTimeout(tryAttach, 300);
    };

    const seekInPlace = (t: number, wantPlay: boolean): boolean => {
      if (!attachMedia() || !media) return false;
      try {
        media.seekTo(t);
        if (wantPlay) {
          try {
            media.play();
          } catch (err) {
            ztoolkit.log("YouTubePlayer: play-after-seek failed", err);
          }
        }
        applySample(t, wantPlay || mediaPlaying());
        return true;
      } catch (err) {
        ztoolkit.log("YouTubePlayer: MediaController seek failed", err);
        return false;
      }
    };

    const play = () => {
      const t = sample ? estimateSeconds(sample, Date.now()) : 0;
      if (attachMedia() && media) {
        try {
          media.play();
          applySample(t, true);
          clearEnsureTimers();
          ensurePlayTimer = chromeWin.setTimeout(() => {
            if (mediaPlaying()) return;
            ztoolkit.log(
              "YouTubePlayer: play() left paused; muted autoplay reload",
              t,
            );
            reloadMutedAutoplay(t);
          }, 250);
          return;
        } catch (err) {
          ztoolkit.log("YouTubePlayer: play failed", err);
        }
      }
      reloadMutedAutoplay(t);
    };

    const pause = () => {
      clearEnsureTimers();
      if (!attachMedia() || !media) return;
      try {
        media.pause();
        applySample(sample ? estimateSeconds(sample, Date.now()) : 0, false);
      } catch (err) {
        ztoolkit.log("YouTubePlayer: pause failed", err);
      }
    };

    playerRef.current = {
      seekTo: (seconds: number, opts?: { play?: boolean }) => {
        const t = Math.max(0, seconds);
        const wantPlay = !!opts?.play;
        clearEnsureTimers();

        // Prefer in-place control — avoids reload flash and works once media exists.
        if (seekInPlace(t, wantPlay)) {
          if (wantPlay && !mediaPlaying()) {
            ensurePlayTimer = chromeWin.setTimeout(() => {
              if (mediaPlaying()) return;
              // Still cued/blocked: only then do a muted autoplay reload.
              ztoolkit.log(
                "YouTubePlayer: still paused after seek; muted autoplay reload",
                t,
              );
              reloadMutedAutoplay(t);
            }, 250);
          }
          return;
        }

        if (wantPlay) {
          reloadMutedAutoplay(t);
          return;
        }

        detachMedia();
        loadYouTubeEmbed(browser, videoId, t, { bustCache: true });
        applySample(t, false);
        let tries = 0;
        const tryAttach = () => {
          tries += 1;
          if (attachMedia() || tries > 40) return;
          attachTimer = chromeWin.setTimeout(tryAttach, 250);
        };
        if (attachTimer != null) chromeWin.clearTimeout(attachTimer);
        attachTimer = chromeWin.setTimeout(tryAttach, 300);
      },
      play,
      pause,
      toggle: () => {
        if (mediaPlaying() || sample?.playing) pause();
        else play();
      },
      isPlaying: () => mediaPlaying() || !!sample?.playing,
    };

    ztoolkit.log("YouTubePlayer: remote browser mounted", videoId);

    return () => {
      chromeWin.clearTimeout(srcTimer);
      clearEnsureTimers();
      if (attachTimer != null) chromeWin.clearTimeout(attachTimer);
      if (pollTimer != null) chromeWin.clearInterval(pollTimer);
      detachMedia();
      playerRef.current = null;
      try {
        browser.remove();
      } catch {
        // already gone
      }
    };
  }, [videoId, playerRef]);

  return <div ref={hostRef} className="yt-watch-bridge" />;
}
