import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";

import { LocaleSelect } from "@/components/app/LocaleSelect";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export const SiteHeader = async () => {
  const t = await getTranslations("Home");

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground no-underline">
          <span aria-hidden className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground">
            <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
              <path d="M2 11 L5 5 L8 11 L11 5 L14 11" />
            </svg>
          </span>
          Echidna
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <LocaleSelect />
          <ThemeToggle />
          <Button asChild size="sm" className="group/cta ml-2 hidden sm:inline-flex">
            <Link href="/studio">
              {t("openStudio")}
              <ArrowRight data-icon="inline-end" className="transition-transform group-hover/cta:translate-x-0.5" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
};
