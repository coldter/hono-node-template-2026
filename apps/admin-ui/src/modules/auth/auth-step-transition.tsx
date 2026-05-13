import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

interface AuthStepTransitionProps {
  children: ReactNode;
  step: string;
}

const variants = {
  animate: {
    opacity: 1,
    x: 0,
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction > 0 ? -50 : 50,
  }),
  initial: (direction: number) => ({
    opacity: 0,
    x: direction > 0 ? 50 : -50,
  }),
};

export function AuthStepTransition({
  children,
  step,
}: AuthStepTransitionProps) {
  return (
    <AnimatePresence initial={false} mode="wait">
      <motion.div
        animate="animate"
        className="w-full"
        exit="exit"
        initial="initial"
        key={step}
        transition={{
          damping: 30,
          stiffness: 300,
          type: "spring",
        }}
        variants={variants}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
