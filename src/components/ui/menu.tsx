"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { cn } from "@/core/cn";

export function AppMenu({
  trigger,
  children,
  align = "end",
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "center" | "end";
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          collisionPadding={12}
          className="app-menu-content z-50 min-w-44 rounded-lg border border-ink/15 bg-paper p-1 shadow-md"
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function AppMenuItem({
  children,
  onSelect,
  destructive,
  disabled,
}: {
  children: ReactNode;
  onSelect?: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        "label-mono flex min-h-11 cursor-pointer items-center rounded-md px-3 py-2 text-xs outline-none transition-micro data-[highlighted]:bg-ink/5 data-[highlighted]:text-ink",
        destructive ? "text-danger" : "text-ink/80",
        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40",
      )}
    >
      {children}
    </DropdownMenu.Item>
  );
}

export function AppMenuSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-ink/10" />;
}
