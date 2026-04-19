export const TIME_RANGE_PRESET_MINUTES = {
  last_hour: 60,
  last_12_hours: 12 * 60,
  last_24_hours: 24 * 60,
} as const;

export type TimeRangePreset = keyof typeof TIME_RANGE_PRESET_MINUTES;

export const resolveTimeRangeWindowMinutes = (
  preset?: TimeRangePreset,
  windowMinutes?: number,
): number | undefined => {
  if (typeof windowMinutes === "number" && Number.isFinite(windowMinutes) && windowMinutes > 0) {
    return Math.trunc(windowMinutes);
  }

  return preset ? TIME_RANGE_PRESET_MINUTES[preset] : undefined;
};

export const buildTimeRangeDescriptor = (
  preset?: TimeRangePreset,
  windowMinutes?: number,
): {
  readonly preset: TimeRangePreset | null;
  readonly windowMinutes: number | null;
  readonly label: string | null;
} => {
  const resolvedWindowMinutes = resolveTimeRangeWindowMinutes(preset, windowMinutes);
  if (!resolvedWindowMinutes) {
    return {
      preset: preset ?? null,
      windowMinutes: null,
      label: null,
    };
  }

  if (preset) {
    return {
      preset,
      windowMinutes: resolvedWindowMinutes,
      label: preset.replaceAll("_", " "),
    };
  }

  if (resolvedWindowMinutes % 60 === 0) {
    const hours = resolvedWindowMinutes / 60;
    return {
      preset: null,
      windowMinutes: resolvedWindowMinutes,
      label: hours === 1 ? "last hour" : `last ${hours} hours`,
    };
  }

  return {
    preset: null,
    windowMinutes: resolvedWindowMinutes,
    label: `last ${resolvedWindowMinutes} minutes`,
  };
};

export const resolveSinceTimestamp = (
  now: number,
  preset?: TimeRangePreset,
  windowMinutes?: number,
): number | null => {
  const resolvedWindowMinutes = resolveTimeRangeWindowMinutes(preset, windowMinutes);
  return resolvedWindowMinutes ? now - resolvedWindowMinutes * 60_000 : null;
};
