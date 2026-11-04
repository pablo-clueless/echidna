import { getTranslations } from "next-intl/server";

import { LocaleSelect } from "@/components/app/LocaleSelect";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { Link } from "@/i18n/navigation";
import { ArrowLink } from "./ArrowLink";

const sections = ["swap", "checks", "devices", "provenance"] as const;

export const LogoMark = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
    <path d="M2 11 L5 5 L8 11 L11 5 L14 11" />
  </svg>
);

export const SiteHeader = async () => {
  const t = await getTranslations("Home");

  return (
    <header className="band-paper sticky top-0 z-40 border-b bg-background/85! backdrop-blur-md">
      <div className="flex h-14 items-stretch">
        <Link
          href="/"
          className="flex items-center gap-2 bg-signal px-4 text-sm font-semibold tracking-tight text-signal-foreground! no-underline sm:px-5"
        >
          <LogoMark className="size-4" />
          Echidna
        </Link>

        <nav className="hidden items-center gap-7 px-7 text-sm md:flex">
          {sections.map((key) => (
            <a
              key={key}
              href={`#${key}`}
              className="relative py-1 text-muted-foreground no-underline transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-px after:origin-left after:scale-x-0 after:bg-foreground after:transition-transform after:duration-300 hover:text-foreground! hover:after:scale-x-100"
            >
              {t(`sections.${key}`)}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1 pr-3 sm:pr-4">
          <LocaleSelect />
          <ThemeToggle />
          <ArrowLink href="/studio" size="sm" className="ml-2 hidden sm:inline-flex">
            {t("openStudio")}
          </ArrowLink>
        </div>
      </div>
    </header>
  );
};
