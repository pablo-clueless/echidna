"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  className?: string;
  delay?: number;
};

type Phase = "idle" | "hidden" | "shown";

export const Reveal = ({ children, className, delay = 0 }: Props) => {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    const el = ref.current;
    if (!el || el.getBoundingClientRect().top < window.innerHeight) return;
    setPhase("hidden");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setPhase("shown");
        observer.disconnect();
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-phase={phase}
      style={{ transitionDelay: phase === "shown" ? `${delay}ms` : undefined }}
      className={cn(
        "transition-[opacity,translate] duration-700 ease-[cubic-bezier(0.2,0.7,0.2,1)] motion-reduce:transition-none",
        "data-[phase=hidden]:translate-y-4 data-[phase=hidden]:opacity-0 motion-reduce:data-[phase=hidden]:translate-y-0 motion-reduce:data-[phase=hidden]:opacity-100",
        className,
      )}
    >
      {children}
    </div>
  );
};
