import type { ReactNode } from "react";

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

type Props = {
  icon: ReactNode;
  title: string;
  description: string;
};

export const PanelEmpty = ({ icon, title, description }: Props) => (
  <Empty className="flex-1 border-0 p-6">
    <EmptyHeader>
      <EmptyMedia variant="icon">{icon}</EmptyMedia>
      <EmptyTitle className="text-sm">{title}</EmptyTitle>
      <EmptyDescription className="text-xs">{description}</EmptyDescription>
    </EmptyHeader>
  </Empty>
);
