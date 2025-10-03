export interface FilterSettings {
  brightness: number
  contrast: number  
  saturation: number
  hue: number
}

export const getCanvasFilterString = (filterSettings: FilterSettings): string => {
  const { brightness, contrast, saturation, hue } = filterSettings
  return `brightness(${brightness / 100}) contrast(${contrast / 100}) saturate(${saturation / 100}) hue-rotate(${hue}deg)`
}

export const getCssFilterString = (filterSettings: FilterSettings): string => {
  const { brightness, contrast, saturation, hue } = filterSettings
  return `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) hue-rotate(${hue}deg)`
}

// NEW: Helper function to apply filters via canvas context (more reliable)
export const applyFiltersToCanvas = (
  ctx: CanvasRenderingContext2D,
  settings: FilterSettings
) => {
  const { brightness, contrast, saturation, hue } = settings
  ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) hue-rotate(${hue}deg)`
}