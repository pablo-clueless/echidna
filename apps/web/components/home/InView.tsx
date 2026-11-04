"use client";

import type { ReactNode } from "react";

import { useInView } from "./useInView";

type Props = {
  children?: ReactNode;
  className?: string;
};

/** A plain wrapper that exposes `data-phase` (idle / hidden / shown) so children can animate with `data-*` variants. */
export const InView = ({ children, className }: Props) => {
  const [ref, phase] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} data-phase={phase} className={className}>
      {children}
    </div>
  );
};
