// ---------- helpers ----------
export function formatWhenFromSeconds(epochSeconds: number, tz: string) {
  const date = new Date(epochSeconds * 1000);
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  const parts = fmt.formatToParts(date).reduce((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {} as Record<string, string>);
  return `${parts["month"]} ${parts["day"]}, ${parts["year"]} ${parts["hour"]}:${parts["minute"]}`;
}

export function coerceModelOutput(raw: any, fallbackWhen?: string) {
  const out: any = {};
  if (raw && typeof raw.explainer === "string") out.explainer = raw.explainer;
  if (raw && Array.isArray(raw.keypoints))
    out.keypoints = raw.keypoints.slice(0, 4).map(String);
  out.when = raw && typeof raw.when === "string" ? raw.when : fallbackWhen;
  return out;
}
