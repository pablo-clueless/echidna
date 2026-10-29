"use client";

import { Package, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { PanelHeader } from "./PanelHeader";
import { PanelEmpty } from "./PanelEmpty";

export const LibrarySidebar = () => {
  const t = useTranslations("Studio.library");

  return (
    <aside aria-label={t("title")} className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <PanelHeader title={t("title")} />
      <div className="p-2">
        <InputGroup className="h-8 bg-background">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput type="search" placeholder={t("search")} aria-label={t("search")} />
        </InputGroup>
      </div>
      <PanelEmpty icon={<Package />} title={t("emptyTitle")} description={t("emptyDescription")} />
    </aside>
  );
};
