"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import {
  clearFeedDirection,
  getFeedDirection,
  subscribeFeedDirection,
} from "@/lib/feedDirection";

const VERTICAL_EASE = [0.32, 0.72, 0, 1] as const;
const VERTICAL_DURATION = 0.45;
const HORIZONTAL_EASE = [0.22, 1, 0.36, 1] as const;
const HORIZONTAL_DURATION = 0.28;

export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const direction = useSyncExternalStore(
    subscribeFeedDirection,
    getFeedDirection,
    () => null,
  );

  const variants = useMemo(() => {
    if (direction === "down") {
      return {
        initial: { y: "100%" },
        animate: { y: 0 },
        exit: { y: "-100%" },
        transition: { duration: VERTICAL_DURATION, ease: VERTICAL_EASE },
      };
    }
    if (direction === "up") {
      return {
        initial: { y: "-100%" },
        animate: { y: 0 },
        exit: { y: "100%" },
        transition: { duration: VERTICAL_DURATION, ease: VERTICAL_EASE },
      };
    }
    return {
      initial: { x: 48, opacity: 0 },
      animate: { x: 0, opacity: 1 },
      exit: { x: -48, opacity: 0 },
      transition: { duration: HORIZONTAL_DURATION, ease: HORIZONTAL_EASE },
    };
  }, [direction]);

  // Once the route has settled, drop the feed direction so the next
  // non-feed navigation falls back to the horizontal slide.
  useEffect(() => {
    if (direction === null) return;
    const timer = window.setTimeout(() => clearFeedDirection(), 700);
    return () => window.clearTimeout(timer);
  }, [pathname, direction]);

  const isFeedTransition = direction !== null;

  return (
    <AnimatePresence initial={false} mode={isFeedTransition ? "sync" : "wait"}>
      <motion.div
        key={pathname}
        initial={variants.initial}
        animate={variants.animate}
        exit={variants.exit}
        transition={variants.transition}
        style={
          isFeedTransition
            ? {
                position: "fixed",
                inset: 0,
                willChange: "transform",
              }
            : {
                minHeight: "100dvh",
                willChange: "transform",
              }
        }
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
