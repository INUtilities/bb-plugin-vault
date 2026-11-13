import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export type DocViewMode = "source" | "preview";

export function DocViewToggle({
  mode,
  onChange,
  compact = false,
}: {
  mode: DocViewMode;
  onChange: (mode: DocViewMode) => void;
  compact?: boolean;
}) {
  if (compact) return <button type="button" aria-label={mode === "preview" ? "원문 보기" : "미리보기 보기"}
    title={mode === "preview" ? "원문 보기" : "미리보기 보기"} data-testid="vault-doc-mode"
    className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring in-data-[phone-metrics]:size-8"
    onClick={() => onChange(mode === "preview" ? "source" : "preview")}>
    <Icon name={mode === "preview" ? "Code" : "Eye"} aria-hidden className="size-3.5" />
  </button>;
  const options: { mode: DocViewMode; label: string; icon: IconName }[] = [
    { mode: "source", label: "원문", icon: "Code" },
    { mode: "preview", label: "미리보기", icon: "Eye" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="보기"
      className="inline-flex shrink-0 rounded-md bg-muted p-0.5"
      data-testid="vault-doc-mode"
    >
      {options.map((option) => {
        const selected = mode === option.mode;
        return (
          <button
            key={option.mode}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            data-testid={`vault-doc-mode-${option.mode}`}
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-[6px] in-data-[phone-metrics]:size-8",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onChange(option.mode)}
          >
            <Icon name={option.icon} className="size-3.5 in-data-[phone-metrics]:size-4" />
          </button>
        );
      })}
    </div>
  );
}
