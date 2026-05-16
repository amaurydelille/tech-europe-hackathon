"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { consumeFeedDirection } from "@/lib/feedDirection";

export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Consume direction once per pathname. useMemo keys on pathname so we
  // don't re-consume on re-renders that aren't navigations.
  const variants = useMemo(() => {
    const direction = consumeFeedDirection();
    if (direction === "down") {
      return {
        initial: { y: "100%", opacity: 1 },
        animate: { y: 0, opacity: 1 },
        exit: { y: "-100%", opacity: 1 },
        transition: { duration: 0.42, ease: [0.32, 0.72, 0, 1] as const },
      };
    }
    if (direction === "up") {
      return {
        initial: { y: "-100%", opacity: 1 },
        animate: { y: 0, opacity: 1 },
        exit: { y: "100%", opacity: 1 },
        transition: { duration: 0.42, ease: [0.32, 0.72, 0, 1] as const },
      };
    }
    return {
      initial: { x: 48, opacity: 0 },
      animate: { x: 0, opacity: 1 },
      exit: { x: -48, opacity: 0 },
      transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const },
    };
  }, [pathname]);

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={variants.initial}
        animate={variants.animate}
        exit={variants.exit}
        transition={variants.transition}
        style={{ minHeight: "100dvh", willChange: "transform" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
