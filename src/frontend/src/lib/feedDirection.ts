// Module-level handoff between the feed page (which knows the scroll
// direction) and the route template (which runs the transition animation).
//
// We can't use React state for this because the producer is unmounting at
// the same instant the consumer is mounting; sessionStorage also doesn't
// work cleanly because both old and new templates need to read it before
// either clears it.

export type FeedDirection = "up" | "down";

let pendingDirection: FeedDirection | null = null;

export function setFeedDirection(direction: FeedDirection): void {
  pendingDirection = direction;
}

export function consumeFeedDirection(): FeedDirection | null {
  const d = pendingDirection;
  pendingDirection = null;
  return d;
}
