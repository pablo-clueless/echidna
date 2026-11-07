import type { Metadata } from "next";

import { type AppLocale, htmlLang, routing } from "@/i18n/routing";

/** Where the app is deployed. `NEXT_PUBLIC_SITE_URL` overrides it, such as for a preview or a custom domain. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://echidna-one.vercel.app";

export const SITE_NAME = "Echidna";

/** The social card: the home page hero, at the 1200 × 628 size link previews use. */
const SHARE_IMAGE = { url: "/meta/screenshot.png", width: 1200, height: 628 } as const;

type PageMetadata = {
  locale: AppLocale;
  /** Path after the locale, such as `/studio`; empty for the home page. */
  path?: string;
  /** Title for link previews; the page's own `title` is set separately. */
  title?: string;
  description: string;
  imageAlt: string;
};

/**
 * Canonical URL, language alternates, Open Graph and X (Twitter) card for a localised page, so a shared link
 * previews with the page's title, description and the home page hero, in the reader's language.
 * @param page - The page's locale, path and text.
 * @returns Metadata to merge into the page's own.
 */
export const shareMetadata = ({
  locale,
  path = "",
  title = SITE_NAME,
  description,
  imageAlt,
}: PageMetadata): Metadata => {
  const url = `/${locale}${path}`;
  const image = { ...SHARE_IMAGE, alt: imageAlt };
  return {
    alternates: {
      canonical: url,
      languages: {
        ...Object.fromEntries(routing.locales.map((l) => [htmlLang[l], `/${l}${path}`])),
        "x-default": `/${routing.defaultLocale}${path}`,
      },
    },
    openGraph: {
      type: "website",
      url,
      siteName: SITE_NAME,
      title,
      description,
      locale: htmlLang[locale].replace("-", "_"),
      images: [image],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
    // Not emitted by Next.js on its own: a plain `title` meta tag, and the card's URL for X.
    other: { title, "twitter:url": new URL(url, SITE_URL).toString() },
  };
};
