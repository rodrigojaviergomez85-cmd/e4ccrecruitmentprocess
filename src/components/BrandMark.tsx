import logo from "@/assets/e4cc-logo.png.asset.json";

import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src={logo.url}
      alt="E4CC — #1 En Inglés Para El Trabajo"
      className={cn("h-9 w-auto", className)}
      loading="eager"
    />
  );
}
