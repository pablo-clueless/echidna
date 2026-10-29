import type { Provenance } from "@echidna/core";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Where a value came from: a datasheet, a teardown, an estimate, or the user. */
export const ProvenanceBadge = ({ source }: { source: Provenance | "user" }) => {
  const t = useTranslations("Studio.provenance");
  return (
    <Badge
      variant="outline"
      className={cn("h-4.5 px-1.5 text-[10px] font-normal text-muted-foreground", source === "estimated" && "border-dashed italic")}
    >
      {t(source)}
    </Badge>
  );
};
