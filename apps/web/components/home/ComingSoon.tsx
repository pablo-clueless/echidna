import { cn } from "@/lib/utils";

/** A small tag saying the studio isn't open yet, with a pulsing dot. */
export const ComingSoon = ({ label, className }: { label: string; className?: string }) => (
  <span
    className={cn(
      "bg-background text-foreground inline-flex w-fit items-center gap-2 border px-2.5 py-1 font-mono text-[11px] tracking-wider uppercase",
      className,
    )}
  >
    <span aria-hidden className="relative flex size-1.5">
      <span className="bg-signal absolute inset-0 animate-ping rounded-full opacity-75 motion-reduce:hidden" />
      <span className="bg-signal relative size-1.5 rounded-full" />
    </span>
    {label}
  </span>
);
