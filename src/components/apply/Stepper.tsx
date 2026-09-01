import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

const STEPS = ["Profile", "Video 1", "Video 2", "Submit"];

export function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((label, i) => {
        const index = i + 1;
        const done = index < current;
        const active = index === current;
        return (
          <li key={label} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full items-center gap-1.5">
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  done && "bg-success text-success-foreground",
                  active && "bg-primary text-primary-foreground",
                  !done && !active && "bg-muted text-muted-foreground",
                )}
              >
                {done ? <Check className="h-4 w-4" /> : index}
              </span>
              {i < STEPS.length - 1 && (
                <span
                  className={cn("h-1 flex-1 rounded-full", done ? "bg-success" : "bg-muted")}
                />
              )}
            </div>
            <span
              className={cn(
                "w-full text-left text-[11px] font-medium sm:text-xs",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
