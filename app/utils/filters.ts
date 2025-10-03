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

// For Canvas filters (used when processing final image)
export const getCanvasFilterString = (filterSettings: FilterSettings): string => {
  const { brightness, contrast, saturation, hue } = filterSettings
  return `brightness(${brightness / 100}) contrast(${contrast / 100}) saturate(${saturation / 100}) hue-rotate(${hue}deg)`
}

// Apply filters to canvas context (correct syntax)
export const applyFiltersToCanvas = (
  ctx: CanvasRenderingContext2D,
  settings: FilterSettings
) => {
  ctx.filter = getCanvasFilterString(settings)
}