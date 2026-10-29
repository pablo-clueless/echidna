"use client";

import type { ComponentProps, ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

type Props = Omit<ComponentProps<typeof Button>, "aria-label" | "children"> & {
  label: string;
  children: ReactNode;
};

export const IconButton = ({ label, variant = "ghost", size = "icon-sm", children, ...props }: Props) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant={variant} size={size} aria-label={label} {...props}>
        {children}
      </Button>
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
);
