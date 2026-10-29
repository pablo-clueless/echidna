import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

import { StudioShell } from "@/components/studio/StudioShell";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("Studio");
  return { title: t("title") };
};

const StudioPage = () => <StudioShell />;

export default StudioPage;