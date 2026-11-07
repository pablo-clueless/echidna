import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Props = {
  href: string;
  children: ReactNode;
  size?: "sm" | "lg";
  className?: string;
};

/**
 * A solid button with its arrow in a signal-colour tab. On hover the arrow slides out to the right while a second one
 * slides in from the left. Hash links stay plain anchors so smooth scrolling handles them.
 */
export const ArrowLink = ({ href, children, size = "lg", className }: Props) => {
  const classes = cn(
    "group/arrow inline-flex items-center rounded-md bg-foreground font-medium text-background no-underline transition-[background-color,box-shadow] outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
    size === "lg" ? "gap-4 py-1.5 pr-1.5 pl-4 text-[15px]" : "gap-3 py-1 pr-1 pl-3 text-sm",
    className,
  );
  const content = (
    <>
      {children}
      <span
        className={cn(
          "bg-signal text-signal-foreground relative grid shrink-0 place-items-center overflow-hidden",
          size === "lg" ? "size-8" : "size-6",
        )}
      >
        <ArrowRight className="size-4 transition-transform duration-300 ease-[cubic-bezier(0.6,0,0.2,1)] group-hover/arrow:translate-x-[180%]" />
        <ArrowRight className="absolute size-4 translate-x-[-180%] transition-transform duration-300 ease-[cubic-bezier(0.6,0,0.2,1)] group-hover/arrow:translate-x-0" />
      </span>
    </>
  );

  return href.startsWith("#") ? (
    <a href={href} className={classes}>
      {content}
    </a>
  ) : (
    <Link href={href} className={classes}>
      {content}
    </Link>
  );
};
