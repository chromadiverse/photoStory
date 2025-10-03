export interface FilterSettings {
  brightness: number
  contrast: number
  saturation: number
  hue: number
}

// For CSS filters (used in FilterPanel preview)
export const getCssFilterString = (filterSettings: FilterSettings): string => {
  const { brightness, contrast, saturation, hue } = filterSettings
  return `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) hue-rotate(${hue}deg)`
}

export const getCanvasFilterString = (filterSettings: FilterSettings): string => {
  const { brightness, contrast, saturation, hue } = filterSettings

  // Canvas filter uses decimal values: 1 = 100%, 2 = 200%
  const brightnessValue = brightness / 100
  const contrastValue = contrast / 100
  const saturationValue = saturation / 100

  return `brightness(${brightnessValue}) contrast(${contrastValue}) saturate(${saturationValue}) hue-rotate(${hue}deg)`
}

// Apply filters to canvas context
export const applyFiltersToCanvas = (ctx: CanvasRenderingContext2D, settings: FilterSettings) => {
  ctx.filter = getCanvasFilterString(settings)
}
