import type { ReactNode } from "react";

type Props = {
  title: string;
  children?: ReactNode;
};

export const PanelHeader = ({ title, children }: Props) => (
  <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b px-3">
    <h2 className="text-sm font-medium">{title}</h2>
    {children}
  </div>
);
