import { ArrowRight, Cpu, Drone, Laptop, PcCase, Plug, Smartphone, Thermometer, Watch, Zap } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AssemblyHero } from "@/components/home/assembly/AssemblyHero";
import { SiteHeader } from "@/components/home/SiteHeader";
import { SwapDemo } from "@/components/home/SwapDemo";
import { Reveal } from "@/components/home/Reveal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";


const checks = [
  { key: "connects", icon: Plug },
  { key: "powered", icon: Zap },
  { key: "cool", icon: Thermometer },
] as const;

const devices = [
  { key: "smartphone", icon: Smartphone },
  { key: "desktop", icon: PcCase },
  { key: "laptop", icon: Laptop },
  { key: "drone", icon: Drone },
  { key: "iot", icon: Cpu },
  { key: "wearable", icon: Watch },
] as const;

const specRows = [
  { key: "battery", value: "12.4 Wh", source: "datasheet" },
  { key: "display", value: "0.42 A", source: "teardown" },
  { key: "soc", value: "8.5 W", source: "estimated" },
] as const;

const sourceBadge = {
  datasheet: "border-foreground/25",
  teardown: "border-foreground/25 bg-muted",
  estimated: "border-dashed border-foreground/40 italic",
} as const;

const rise = (delay: number): CSSProperties => ({ animationDelay: `${delay}ms` });

const markWorks = (chunks: ReactNode) => (
  <span className="relative inline-block text-foreground">
    {chunks}
    <svg
      aria-hidden
      viewBox="0 0 100 12"
      preserveAspectRatio="none"
      className="absolute -bottom-1 left-0 h-[0.18em] w-full overflow-visible"
    >
      <path
        d="M2 8 C 25 3, 55 3, 98 6"
        pathLength={1}
        fill="none"
        strokeDasharray="1"
        className="stroke-status-pass motion-safe:animate-draw"
        strokeWidth={5}
        strokeLinecap="round"
        style={{ animationDelay: "700ms" }}
      />
    </svg>
  </span>
);

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("Metadata");
  return { title: { absolute: "Echidna" }, description: t("description") };
};

const HomePage = async () => {
  const t = await getTranslations("Home");

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(var(--border)_1.2px,transparent_1.2px)] mask-[radial-gradient(ellipse_70%_60%_at_30%_40%,black,transparent)] bg-size-[22px_22px]"
          />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-24">
            <div className="flex flex-col items-start">
              <p className="font-mono text-xs text-muted-foreground motion-safe:animate-rise" style={rise(0)}>
                {t("hero.eyebrow")}
              </p>
              <h1 className="mt-5 text-5xl leading-[0.98] font-semibold tracking-[-0.035em] text-balance sm:text-6xl lg:text-7xl">
                <span className="block motion-safe:animate-rise" style={rise(80)}>
                  {t.rich("hero.titleTop", { mark: markWorks })}
                </span>
                <span className="block text-muted-foreground motion-safe:animate-rise" style={rise(160)}>
                  {t.rich("hero.titleBottom", { mark: markWorks })}
                </span>
              </h1>
              <p
                className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground motion-safe:animate-rise"
                style={rise(260)}
              >
                {t("hero.lead")}
              </p>
              <div className="mt-8 flex flex-wrap gap-3 motion-safe:animate-rise" style={rise(340)}>
                <Button asChild size="lg" className="group/cta">
                  <Link href="/studio">
                    {t("openStudio")}
                    <ArrowRight data-icon="inline-end" className="transition-transform group-hover/cta:translate-x-0.5" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <a href="#checks">{t("hero.secondary")}</a>
                </Button>
              </div>
            </div>

            <div className="motion-safe:animate-rise" style={rise(240)}>
              <AssemblyHero />
            </div>
          </div>
        </section>

        <section className="border-t">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
            <Reveal>
              <h2 className="text-3xl font-semibold tracking-tight text-balance">{t("swap.heading")}</h2>
              <p className="mt-3 max-w-md leading-relaxed text-muted-foreground">{t("swap.lead")}</p>
            </Reveal>
            <Reveal delay={120}>
              <SwapDemo />
            </Reveal>
          </div>
        </section>

        <section id="checks" className="scroll-mt-16 border-t">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_2fr]">
            <Reveal>
              <h2 className="text-3xl font-semibold tracking-tight text-balance">{t("checks.heading")}</h2>
              <p className="mt-3 text-muted-foreground">{t("checks.lead")}</p>
            </Reveal>
            <div className="grid gap-4 sm:grid-cols-3">
              {checks.map(({ key, icon: Icon }, i) => (
                <Reveal key={key} delay={i * 90}>
                  <div className="group h-full rounded-xl border p-5 transition-colors hover:border-foreground/25">
                    <span className="grid size-9 place-items-center rounded-lg bg-muted transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
                      <Icon className="size-4" />
                    </span>
                    <h3 className="mt-4 font-medium">{t(`checks.${key}.title`)}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t(`checks.${key}.body`)}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t bg-sidebar">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <Reveal className="max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight text-balance">{t("devices.heading")}</h2>
              <p className="mt-3 text-muted-foreground">{t("devices.lead")}</p>
            </Reveal>
            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {devices.map(({ key, icon: Icon }, i) => (
                <Reveal key={key} delay={(i % 3) * 80}>
                  <Card
                    size="sm"
                    className="group h-full transition-[translate,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-foreground/5"
                  >
                    <CardHeader className="flex-row items-center gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
                        <Icon className="size-5" />
                      </span>
                      <div>
                        <CardTitle>{t(`devices.${key}.name`)}</CardTitle>
                        <CardDescription>{t(`devices.${key}.examples`)}</CardDescription>
                      </div>
                    </CardHeader>
                  </Card>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
            <Reveal>
              <h2 className="text-3xl font-semibold tracking-tight text-balance">{t("provenance.heading")}</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">{t("provenance.lead")}</p>
            </Reveal>
            <Reveal delay={120}>
              <Card className="gap-0 py-0">
                <ul className="divide-y">
                  {specRows.map(({ key, value, source }) => (
                    <li key={key} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/60">
                      <span className="text-sm">{t(`provenance.rows.${key}`)}</span>
                      <span className="ml-auto font-mono text-sm tabular-nums">{value}</span>
                      <Badge variant="outline" className={cn("w-24 justify-center", sourceBadge[source])}>
                        {t(`provenance.${source}`)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </Card>
            </Reveal>
          </div>
        </section>

        <section className="border-t">
          <Reveal className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-4 py-24 text-center sm:px-6">
            <h2 className="text-4xl font-semibold tracking-tight text-balance">{t("cta.heading")}</h2>
            <p className="max-w-md text-muted-foreground">{t("cta.body")}</p>
            <Button asChild size="lg" className="group/cta mt-2">
              <Link href="/studio">
                {t("openStudio")}
                <ArrowRight data-icon="inline-end" className="transition-transform group-hover/cta:translate-x-0.5" />
              </Link>
            </Button>
          </Reveal>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:px-6">
          <span className="font-medium text-foreground">Echidna</span>
          <span>{t("footer")}</span>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
