// Pub/sub for the feed scroll direction. Both the outgoing and the
// incoming Template instance subscribe via useSyncExternalStore, so we
// can update the outgoing page's exit animation just before the route
// changes (vertical, not the default horizontal).

export type FeedDirection = "up" | "down";

let currentDirection: FeedDirection | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

export function setFeedDirection(direction: FeedDirection): void {
  currentDirection = direction;
  notify();
}

export function clearFeedDirection(): void {
  if (currentDirection === null) return;
  currentDirection = null;
  notify();
}

export function getFeedDirection(): FeedDirection | null {
  return currentDirection;
}

export function subscribeFeedDirection(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
