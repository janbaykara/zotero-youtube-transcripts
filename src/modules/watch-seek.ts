type SeekListener = (itemID: number, seekMs: number) => void;

const pendingSeekMs = new Map<number, number>();
const listeners = new Set<SeekListener>();

/** Queue a seek for a watch tab (applied on mount or via subscribers). */
export function requestWatchSeek(itemID: number, seekMs: number): void {
  const ms = Math.max(0, Math.floor(seekMs));
  pendingSeekMs.set(itemID, ms);
  for (const listener of listeners) {
    try {
      listener(itemID, ms);
    } catch (err) {
      ztoolkit.log("watch-seek: listener failed", err);
    }
  }
}

/** Consume a pending seek once (e.g. on WatchPage mount). */
export function takePendingWatchSeek(itemID: number): number | undefined {
  const ms = pendingSeekMs.get(itemID);
  if (ms == null) return undefined;
  pendingSeekMs.delete(itemID);
  return ms;
}

export function subscribeWatchSeek(listener: SeekListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
