import { ArrowDownRight, Cpu, Drone, Laptop, PcCase, Smartphone, Watch } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

import { AssemblyHero } from "@/components/home/assembly/AssemblyHero";
import { LogoMark, SiteHeader } from "@/components/home/SiteHeader";
import { VerdictTicker } from "@/components/home/VerdictTicker";
import { SmoothScroll } from "@/components/home/SmoothScroll";
import { TypeHeading } from "@/components/home/TypeHeading";
import { PixelField } from "@/components/home/PixelField";
import { ArrowLink } from "@/components/home/ArrowLink";
import { LineIcon } from "@/components/home/LineIcon";
import { SwapDemo } from "@/components/home/SwapDemo";
import { localeNames, routing } from "@/i18n/routing";
import { CountUp } from "@/components/home/CountUp";
import { Reveal } from "@/components/home/Reveal";
import { InView } from "@/components/home/InView";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const checks = ["connects", "powered", "cool"] as const;

const devices = [
  { key: "smartphone", icon: Smartphone },
  { key: "desktop", icon: PcCase },
  { key: "laptop", icon: Laptop },
  { key: "drone", icon: Drone },
  { key: "iot", icon: Cpu },
  { key: "wearable", icon: Watch },
] as const;

const stats = [
  { key: "devices", value: devices.length },
  { key: "checks", value: checks.length },
  { key: "sources", value: 3 },
  { key: "languages", value: routing.locales.length },
] as const;

const specRows = [
  { key: "battery", value: "12.4 Wh", source: "datasheet" },
  { key: "display", value: "0.42 A", source: "teardown" },
  { key: "soc", value: "8.5 W", source: "estimated" },
] as const;

const sourceBadge = {
  datasheet: "border-foreground/30",
  teardown: "border-foreground/30 bg-muted",
  estimated: "border-dashed border-foreground/45 italic",
} as const;

/** Content width shared by every band; rules and fills run full-bleed outside it. */
const shell = "mx-auto w-full max-w-[88rem] px-4 sm:px-6 lg:px-8";
const eyebrow = "font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase";

const rise = (delay: number): CSSProperties => ({ animationDelay: `${delay}ms` });

const plain = (chunks: ReactNode) => chunks;

const Caret = ({ className }: { className?: string }) => (
  <span
    aria-hidden
    className={cn(
      "ml-[0.08em] inline-block h-[0.8em] w-[0.1em] translate-y-[0.06em] bg-signal motion-safe:animate-caret",
      className,
    )}
  />
);

type SectionHeadProps = { index: number; label: string; heading: string; lead: string };

/** Big typed heading on the left, lead pinned to the right edge: the rhythm every band opens with. */
const SectionHead = ({ index, label, heading, lead }: SectionHeadProps) => (
  <div className="grid gap-6 pt-24 pb-12 lg:grid-cols-[1.4fr_1fr] lg:items-end lg:gap-16 lg:pt-36 lg:pb-16">
    <div>
      <p className={eyebrow}>
        <span aria-hidden className="text-foreground">{`// 0${index}`}</span> · {label}
      </p>
      <TypeHeading
        text={heading}
        className="mt-5 text-4xl leading-[1.02] font-semibold tracking-[-0.035em] text-balance sm:text-5xl lg:text-6xl"
      />
    </div>
    <Reveal delay={200} className="lg:max-w-md lg:justify-self-end">
      <p className="text-lg leading-relaxed text-muted-foreground">{lead}</p>
    </Reveal>
  </div>
);

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("Metadata");
  return { title: { absolute: "Echidna" }, description: t("description") };
};

const HomePage = async () => {
  const t = await getTranslations("Home");
  const languages = routing.locales.map((l) => ({ code: l, name: localeNames[l] }));

  return (
    <div className="home band-paper flex min-h-full flex-col">
      <SmoothScroll />
      <SiteHeader />
      <main className="flex-1">
        <section className="band-paper">
          <div className={cn(shell, "py-8 lg:py-12")}>
            <div className="grid grid-cols-2 border-t border-l lg:grid-cols-6 *:border-r *:border-b">
              <div className="col-span-2 flex min-h-80 flex-col justify-between gap-10 p-6 sm:p-8 lg:col-span-3 lg:col-start-1 lg:row-span-2 lg:row-start-1">
                <p className={cn(eyebrow, "motion-safe:animate-rise")} style={rise(0)}>
                  {t("hero.tagline")}
                </p>
                <h1 className="text-[2.75rem] leading-[0.95] font-semibold tracking-[-0.045em] text-balance sm:text-6xl xl:text-7xl">
                  <span className="block motion-safe:animate-rise" style={rise(80)}>
                    {t.rich("hero.titleTop", { mark: plain })}
                  </span>
                  <span className="block text-muted-foreground motion-safe:animate-rise" style={rise(160)}>
                    {t.rich("hero.titleBottom", { mark: plain })}
                    <Caret />
                  </span>
                </h1>
              </div>
              <div className="col-span-2 motion-safe:animate-rise lg:col-span-3 lg:col-start-4 lg:row-span-3 lg:row-start-1" style={rise(240)}>
                <AssemblyHero bare />
              </div>
              <div
                className="col-span-2 flex items-end p-6 motion-safe:animate-rise sm:p-8 lg:col-span-2 lg:col-start-2 lg:row-start-3"
                style={rise(300)}
              >
                <p className="max-w-md text-[15px] leading-relaxed text-muted-foreground">{t("hero.lead")}</p>
              </div>
              <div className="min-h-36 lg:col-start-1 lg:row-start-3">
                <PixelField seed={3} />
              </div>
              <a
                href="#checks"
                className="group/down flex min-h-36 flex-col justify-between p-5 no-underline transition-colors hover:bg-muted lg:col-start-3 lg:row-start-4"
              >
                <ArrowDownRight className="size-6 transition-transform duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)] group-hover/down:translate-x-1.5 group-hover/down:translate-y-1.5" />
                <span className="text-sm font-medium">{t("hero.secondary")}</span>
              </a>
              <Link
                href="/studio"
                className="group/go relative col-span-2 flex min-h-44 flex-col justify-between overflow-hidden bg-signal p-5 text-signal-foreground! no-underline lg:col-span-2 lg:col-start-1 lg:row-start-4"
              >
                <span className="max-w-56 text-lg leading-tight font-semibold tracking-tight">{t("hero.slogan")}</span>
                <span className="flex items-center gap-2 text-sm font-medium">
                  {t("openStudio")}
                  <span aria-hidden className="transition-transform duration-300 group-hover/go:translate-x-1">
                    →
                  </span>
                </span>
                <span
                  aria-hidden
                  className="absolute right-5 bottom-5 size-3 bg-signal-foreground transition-all duration-500 ease-[cubic-bezier(0.6,0,0.2,1)] group-hover/go:size-9 group-hover/go:rotate-90"
                />
              </Link>
              <div className="min-h-36 lg:col-start-4 lg:row-start-4">
                <VerdictTicker />
              </div>
              <div className="grid min-h-36 place-items-center lg:col-start-5 lg:row-start-4">
                <svg aria-hidden viewBox="0 0 16 16" className="w-2/5 overflow-visible" fill="none" strokeLinecap="round">
                  <path
                    d="M2 11 L5 5 L8 11 L11 5 L14 11"
                    pathLength={1}
                    strokeDasharray="1"
                    strokeWidth={1.6}
                    className="stroke-foreground motion-safe:animate-draw"
                    style={{ animationDelay: "500ms", animationDuration: "1.6s" }}
                  />
                </svg>
              </div>

              <div className="hidden min-h-36 lg:col-start-6 lg:row-start-4 lg:block">
                <PixelField seed={11} cols={5} />
              </div>
            </div>
          </div>
        </section>
        <section className="band-ink">
          <div className={cn(shell, "grid sm:grid-cols-2 lg:grid-cols-4")}>
            {stats.map(({ key, value }) => (
              <InView
                key={key}
                className={cn(
                  "relative flex min-h-64 flex-col justify-between gap-12 border-b py-8 pl-5 sm:min-h-80 lg:min-h-104 lg:border-b-0",
                  "border-l before:absolute before:inset-y-0 before:-left-px before:w-px before:origin-top before:bg-signal before:transition-transform before:duration-[1.6s] before:ease-[cubic-bezier(0.6,0,0.2,1)]",
                  "data-[phase=hidden]:before:scale-y-0",
                )}
              >
                <div>
                  <CountUp value={value} className="block text-7xl font-semibold tracking-tighter tabular-nums lg:text-8xl" />
                  <p className={cn(eyebrow, "mt-3")}>{t(`stats.${key}.label`)}</p>
                </div>
                <p className="max-w-[16rem] text-sm leading-relaxed text-muted-foreground">{t(`stats.${key}.body`)}</p>
              </InView>
            ))}
          </div>
        </section>
        <section id="swap" className="band-paper scroll-mt-14">
          <div className={shell}>
            <SectionHead index={1} label={t("sections.swap")} heading={t("swap.heading")} lead={t("swap.lead")} />
          </div>
          <div className="border-y">
            <div className={cn(shell, "grid lg:grid-cols-[1fr_minmax(0,36rem)_1fr]")}>
              <div aria-hidden className="hatch-v hidden border-r lg:block" />
              <Reveal className="py-10 lg:px-10 lg:py-16">
                <SwapDemo />
              </Reveal>
              <div aria-hidden className="hatch-h hidden border-l lg:block" />
            </div>
          </div>
        </section>
        <section id="checks" className="band-ink scroll-mt-14">
          <div className={shell}>
            <SectionHead index={2} label={t("sections.checks")} heading={t("checks.heading")} lead={t("checks.lead")} />
          </div>
          <div className="border-t">
            <div className={cn(shell, "grid sm:grid-cols-3")}>
              {checks.map((key, i) => (
                <Reveal key={key} delay={i * 120} className="sm:first:*:pl-0 sm:last:*:border-r-0">
                  <div className="group/check flex h-full min-h-96 flex-col justify-between gap-8 border-b py-8 transition-colors duration-500 sm:border-r sm:border-b-0 sm:px-6 lg:min-h-120 lg:px-8">
                    <div className="flex items-baseline justify-between gap-4">
                      <h3 className="text-xl font-medium tracking-tight lg:text-2xl">{t(`checks.${key}.title`)}</h3>
                      <span className="font-mono text-xs text-muted-foreground">{`0${i + 1}`}</span>
                    </div>
                    <LineIcon
                      kind={key}
                      className="mx-auto size-28 text-signal transition-transform duration-700 ease-[cubic-bezier(0.2,0.7,0.2,1)] group-hover/check:scale-110 lg:size-36"
                    />
                    <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">{t(`checks.${key}.body`)}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
        <section id="devices" className="band-paper scroll-mt-14">
          <div className={shell}>
            <SectionHead index={3} label={t("sections.devices")} heading={t("devices.heading")} lead={t("devices.lead")} />
            <ul className="mb-24 border-t lg:mb-36">
              {devices.map(({ key, icon: Icon }, i) => (
                <li key={key} className="border-b">
                  <Reveal delay={i * 60}>
                    <div className="group/row relative grid grid-cols-[3.5rem_1fr] items-center gap-x-5 gap-y-1 py-4 before:absolute before:inset-0 before:origin-left before:scale-x-0 before:bg-muted before:transition-transform before:duration-500 before:ease-[cubic-bezier(0.6,0,0.2,1)] hover:before:scale-x-100 sm:grid-cols-[4.5rem_1.1fr_1fr_auto] sm:gap-x-8 sm:py-5">
                      <span className="relative row-span-2 grid aspect-square place-items-center border bg-background transition-colors duration-300 group-hover/row:border-transparent group-hover/row:bg-signal group-hover/row:text-signal-foreground sm:row-span-1">
                        <Icon className="size-6 transition-transform duration-500 group-hover/row:scale-110 group-hover/row:-rotate-6" />
                      </span>
                      <h3 className="relative text-2xl font-semibold tracking-[-0.03em] transition-transform duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)] group-hover/row:translate-x-2 sm:text-4xl lg:text-5xl">
                        {t(`devices.${key}.name`)}
                      </h3>
                      <p className="relative text-sm text-muted-foreground sm:text-base">{t(`devices.${key}.examples`)}</p>
                      <span className="relative hidden pr-2 font-mono text-xs text-muted-foreground sm:block">{`0${i + 1}`}</span>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section id="provenance" className="band-ink scroll-mt-14">
          <div className={shell}>
            <SectionHead
              index={4}
              label={t("sections.provenance")}
              heading={t("provenance.heading")}
              lead={t("provenance.lead")}
            />
            <ul className="mb-24 border-t lg:mb-36">
              {specRows.map(({ key, value, source }, i) => (
                <li key={key} className="border-b">
                  <Reveal delay={i * 90}>
                    <div className="group/spec grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 py-5 sm:grid-cols-[auto_1fr_auto_8rem] sm:gap-x-8 sm:py-7">
                      <span aria-hidden className="h-5 w-0.75 bg-signal transition-[height] duration-300 group-hover/spec:h-9" />
                      <span className="text-base sm:text-xl">{t(`provenance.rows.${key}`)}</span>
                      <span className="font-mono text-2xl tabular-nums sm:text-4xl">{value}</span>
                      <Badge
                        variant="outline"
                        className={cn("col-start-2 w-24 justify-center sm:col-start-auto sm:justify-self-end", sourceBadge[source])}
                      >
                        {t(`provenance.${source}`)}
                      </Badge>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section className="band-paper overflow-hidden py-24 lg:py-32">
          <div className={cn(shell, "flex flex-col items-center text-center")}>
            <TypeHeading
              text={t("languages.heading")}
              className="text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl lg:text-6xl"
            />
            <Reveal delay={200}>
              <p className="mt-4 max-w-md text-lg text-muted-foreground">{t("languages.lead")}</p>
            </Reveal>
          </div>
          <div className="group/marquee mt-14 mask-[linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
            <ul
              aria-hidden
              className="flex w-max gap-3 motion-safe:animate-marquee group-hover/marquee:paused"
            >
              {[0, 1, 2, 3].flatMap((round) =>
                languages.map(({ code, name }) => (
                  <li
                    key={`${round}-${code}`}
                    lang={code}
                    className="flex h-20 min-w-48 items-center justify-center gap-3 border bg-card px-8 text-lg font-medium transition-colors duration-300 hover:bg-signal hover:text-signal-foreground"
                  >
                    <span className="font-mono text-[10px] tracking-[0.18em] uppercase opacity-60">{code}</span>
                    {name}
                  </li>
                )),
              )}
            </ul>
          </div>
        </section>
        <section className="grid lg:grid-cols-2">
          <div className="flex min-h-80 flex-col justify-between gap-12 bg-signal px-4 py-14 text-signal-foreground sm:px-6 lg:py-20 lg:pr-12 lg:pl-[max(2rem,calc((100vw-88rem)/2+2rem))]">
            <p className="font-mono text-[11px] tracking-[0.18em] uppercase">{`// ${t("cta.eyebrow")}`}</p>
            <TypeHeading
              text={t("cta.heading")}
              block="var(--home-signal-foreground)"
              className="max-w-xl text-5xl leading-[0.98] font-semibold tracking-[-0.04em] text-balance lg:text-7xl"
            />
          </div>
          <div className="band-ink flex flex-col items-start justify-end gap-8 px-4 py-14 sm:px-6 lg:px-12 lg:py-20">
            <p className="max-w-md text-lg leading-relaxed text-muted-foreground">{t("cta.body")}</p>
            <ArrowLink href="/studio">{t("openStudio")}</ArrowLink>
          </div>
        </section>
      </main>
      <footer className="band-ink border-t">
        <div className={cn(shell, "flex flex-col gap-16 py-14 lg:py-20")}>
          <p className="max-w-4xl text-4xl leading-[0.98] font-semibold tracking-[-0.045em] text-balance sm:text-6xl lg:text-7xl">
            {t.rich("hero.titleTop", { mark: plain })}{" "}
            <span className="text-muted-foreground">{t.rich("hero.titleBottom", { mark: plain })}</span>
            <Caret />
          </p>
          <div className="flex flex-wrap items-end justify-between gap-6 border-t pt-6 text-xs text-muted-foreground">
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="grid size-6 place-items-center bg-signal text-signal-foreground">
                <LogoMark className="size-3.5" />
              </span>
              Echidna
            </span>
            <span>{t("footer")}</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
