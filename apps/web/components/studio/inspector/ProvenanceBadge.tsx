import type { Provenance } from "@echidna/core";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Where a value came from: a datasheet, a teardown, an estimate, or the user. Given a reference, such as the
 * datasheet's name or the reasoning behind an estimate, hovering the badge shows it.
 */
export const ProvenanceBadge = ({
  source,
  reference,
}: {
  source: Provenance | "user";
  reference?: string | undefined;
}) => {
  const t = useTranslations("Studio.provenance");
  return (
    <Badge
      variant="outline"
      title={reference}
      className={cn(
        "text-muted-foreground h-4.5 px-1.5 text-[10px] font-normal",
        source === "estimated" && "border-dashed italic",
      )}
    >
      {t(source)}
    </Badge>
  );
};
