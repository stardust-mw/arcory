type ListEmptyStateProps = {
  category: string;
  mode: "category" | "search";
};

export function ListEmptyState({ category, mode }: ListEmptyStateProps) {
  if (mode === "category") {
    return (
      <div className="flex min-h-28 flex-col items-center justify-center border border-dashed border-border/70 bg-muted/20 px-6 py-8 text-center">
        <p className="text-sm text-foreground">No sites in {category}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-28 flex-col items-center justify-center border border-dashed border-border/70 bg-muted/20 px-6 py-8 text-center">
      <p className="text-sm text-foreground">No results in {category}</p>
    </div>
  );
}

