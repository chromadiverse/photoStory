{/* Filter Controls */}
  <div className="bg-white/90 backdrop-blur-sm shadow-sm p-4 space-y-4 max-h-80 overflow-y-auto">
    {/* Brightness */}
    <div className="space-y-2">
      <div className="flex justify-between items-center min-h-[24px]">
        <label className="text-sm font-medium text-gray-700">
          Brightness
        </label>
        <span className="text-sm text-gray-600 font-mono w-12 text-right">
          {filterSettings.brightness}%
        </span>
      </div>
      <input
        type="range"
        min="0"
        max="200"
        value={filterSettings.brightness}
        onChange={(e) => handleSliderChange('brightness', Number(e.target.value))}
        disabled={isProcessing}
        className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer touch-manipulation"
      />
    </div>

    {/* Contrast */}
    <div className="space-y-2">
      <div className="flex justify-between items-center min-h-[24px]">
        <label className="text-sm font-medium text-gray-700">
          Contrast
        </label>
        <span className="text-sm text-gray-600 font-mono w-12 text-right">
          {filterSettings.contrast}%
        </span>
      </div>
      <input
        type="range"
        min="0"
        max="200"
        value={filterSettings.contrast}
        onChange={(e) => handleSliderChange('contrast', Number(e.target.value))}
        disabled={isProcessing}
        className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer touch-manipulation"
      />
    </div>

    {/* Saturation */}
    <div className="space-y-2">
      <div className="flex justify-between items-center min-h-[24px]">
        <label className="text-sm font-medium text-gray-700">
          Saturation
        </label>
        <span className="text-sm text-gray-600 font-mono w-12 text-right">
          {filterSettings.saturation}%
        </span>
      </div>
      <input
        type="range"
        min="0"
        max="200"
        value={filterSettings.saturation}
        onChange={(e) => handleSliderChange('saturation', Number(e.target.value))}
        disabled={isProcessing}
        className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer touch-manipulation"
      />
    </div>

    {/* Hue */}
    <div className="space-y-2">
      <div className="flex justify-between items-center min-h-[24px]">
        <label className="text-sm font-medium text-gray-700">
          Hue
        </label>
        <span className="text-sm text-gray-600 font-mono w-12 text-right">
          {filterSettings.hue > 0 ? '+' : ''}{filterSettings.hue}°
        </span>
      </div>
      <input
        type="range"
        min="-180"
        max="180"
        value={filterSettings.hue}
        onChange={(e) => handleSliderChange('hue', Number(e.target.value))}
        disabled={isProcessing}
        className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer touch-manipulation"
      />
    </div>

    {/* Reset Button */}
    <div className="pt-4 border-t border-gray-200">
      <button
        onClick={resetFilters}
        disabled={isProcessing}
        className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-white/60 hover:bg-white/80 disabled:bg-gray-100 text-gray-700 disabled:text-gray-400 border border-gray-200 rounded-lg transition-colors touch-manipulation font-medium"
      >
        <RotateCcw className="w-4 h-4" />
        <span>Reset All Filters</span>
      </button>
    </div>
  </div>