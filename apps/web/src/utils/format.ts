import { currentLocale } from "../i18n";

/**
 * Intl and not a hardcoded suffix: "Ko" is wrong in English and "KB" is wrong
 * in French. Reading currentLocale() here also registers a reactive dependency
 * on the locale ref, so a language switch re-renders the formatted value.
 */
export function prettyBytes(bytes: number): string {
  const [value, unit] =
    bytes < 1024
      ? ([bytes, "byte"] as const)
      : bytes < 1024 * 1024
        ? ([bytes / 1024, "kilobyte"] as const)
        : ([bytes / (1024 * 1024), "megabyte"] as const);

  return new Intl.NumberFormat(currentLocale(), {
    style: "unit",
    unit,
    unitDisplay: "short",
    maximumFractionDigits: unit === "byte" ? 0 : 1,
  }).format(value);
}
