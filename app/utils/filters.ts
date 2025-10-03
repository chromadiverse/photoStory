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

// For Canvas filters (used when processing final image) - FIXED
export const getCanvasFilterString = (filterSettings: FilterSettings): string => {
  const { brightness, contrast, saturation, hue } = filterSettings
  
  // Canvas filter uses different syntax than CSS:
  // brightness: 1 = normal, 2 = 200%
  // contrast: 1 = normal, 2 = 200%  
  // saturation: 1 = normal, 2 = 200%
  // hue-rotate: same as CSS
  const brightnessValue = brightness / 100
  const contrastValue = contrast / 100
  const saturationValue = saturation / 100
  
  return `brightness(${brightnessValue}) contrast(${contrastValue}) saturate(${saturationValue}) hue-rotate(${hue}deg)`
}

// Apply filters to canvas context (correct syntax)
export const applyFiltersToCanvas = (
  ctx: CanvasRenderingContext2D,
  settings: FilterSettings
) => {
  ctx.filter = getCanvasFilterString(settings)
}