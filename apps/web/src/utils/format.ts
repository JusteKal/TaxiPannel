/**
 * Intl and not a hardcoded suffix: it puts the space and the unit where French
 * wants them ("56,2 ko"), and gets the decimal comma right for free.
 */
export function prettyBytes(bytes: number): string {
  const [value, unit] =
    bytes < 1024
      ? ([bytes, "byte"] as const)
      : bytes < 1024 * 1024
        ? ([bytes / 1024, "kilobyte"] as const)
        : ([bytes / (1024 * 1024), "megabyte"] as const);

  return new Intl.NumberFormat("fr-FR", {
    style: "unit",
    unit,
    unitDisplay: "short",
    maximumFractionDigits: unit === "byte" ? 0 : 1,
  }).format(value);
}
