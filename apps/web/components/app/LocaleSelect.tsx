"use client";

import { hasLocale, useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePathname, useRouter } from "@/i18n/navigation";
import { localeNames, routing } from "@/i18n/routing";

export const LocaleSelect = () => {
  const t = useTranslations("Preferences");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const change = (next: string) => {
    if (!hasLocale(routing.locales, next)) return;
    startTransition(() => router.replace(pathname, { locale: next }));
  };

  return (
    <Select value={locale} onValueChange={change} disabled={pending}>
      <SelectTrigger size="sm" aria-label={t("language")} className="h-7 gap-1 px-2 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {routing.locales.map((l) => (
          <SelectItem key={l} value={l} lang={l} className="text-xs">
            {localeNames[l]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
