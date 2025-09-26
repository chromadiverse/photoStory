'use client'

import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  RotateCcw, 
  Square, 
  Maximize2, 
  ArrowLeft, 
  Check, 
  ZoomIn, 
  ZoomOut, 
  MonitorCog as FitScreen 
} from 'lucide-react';
import { CapturedImage, CroppedImageData } from '../page';

interface CropperProps {
  image: CapturedImage;
  onCropComplete: (cropData: CroppedImageData) => void;
  onBack: () => void;
}

interface Point {
  x: number;
  y: number;
}

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DragState {
  isDragging: boolean;
  dragType: 'none' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e' | 'move';
  start: Point;
  initialCrop: CropArea;
}

const aspectRatios = [
  { label: 'Free', value: null },
  { label: 'Square', value: 1 },
  { label: 'Document', value: 4/3 },
  { label: 'Photo', value: 3/2 },
  { label: 'Wide', value: 16/9 },
];

const Cropper: React.FC<CropperProps> = ({ image, onCropComplete, onBack }) => {
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [cropArea, setCropArea] = useState<CropArea>({ x: 0, y: 0, width: 0, height: 0 });
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState<number | null>(null);
  const [dragState, setDragState] = useState<DragState>({ 
    isDragging: false, 
    dragType: 'none', 
    start: { x: 0, y: 0 }, 
    initialCrop: { x: 0, y: 0, width: 0, height: 0 } 
  });
  const [imageLoaded, setImageLoaded] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Initialize image dimensions and crop area
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      setImageDimensions({ width, height });
      setImageLoaded(true);
      
      // Set initial crop area to full image
      setCropArea({
        x: 0,
        y: 0,
        width: width,
        height: height
      });
    };
    img.src = image.src;
  }, [image.src]);

  // Handle drag start
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent, dragType: DragState['dragType']) => {
    e.preventDefault();
    e.stopPropagation();
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    setDragState({
      isDragging: true,
      dragType,
      start: { x: clientX, y: clientY },
      initialCrop: { ...cropArea }
    });
  };

  // Handle drag movement
  const handleDragMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!dragState.isDragging || !containerRef.current) return;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const deltaX = clientX - dragState.start.x;
    const deltaY = clientY - dragState.start.y;
    
    let newCrop = { ...dragState.initialCrop };
    
    switch (dragState.dragType) {
      case 'nw':
        newCrop.x += deltaX;
        newCrop.y += deltaY;
        newCrop.width -= deltaX;
        newCrop.height -= deltaY;
        break;
      case 'ne':
        newCrop.y += deltaY;
        newCrop.width += deltaX;
        newCrop.height -= deltaY;
        break;
      case 'sw':
        newCrop.x += deltaX;
        newCrop.width -= deltaX;
        newCrop.height += deltaY;
        break;
      case 'se':
        newCrop.width += deltaX;
        newCrop.height += deltaY;
        break;
      case 'n':
        newCrop.y += deltaY;
        newCrop.height -= deltaY;
        break;
      case 's':
        newCrop.height += deltaY;
        break;
      case 'w':
        newCrop.x += deltaX;
        newCrop.width -= deltaX;
        break;
      case 'e':
        newCrop.width += deltaX;
        break;
      case 'move':
        newCrop.x += deltaX;
        newCrop.y += deltaY;
        break;
    }
    
    // Apply aspect ratio if set
    if (aspect && dragState.dragType !== 'move') {
      const aspectRatio = aspect;
      if (['n', 's', 'move'].includes(dragState.dragType)) {
        newCrop.width = newCrop.height * aspectRatio;
      } else {
        newCrop.height = newCrop.width / aspectRatio;
      }
    }
    
    // Boundary checks
    newCrop.x = Math.max(0, Math.min(imageDimensions.width - newCrop.width, newCrop.x));
    newCrop.y = Math.max(0, Math.min(imageDimensions.height - newCrop.height, newCrop.y));
    newCrop.width = Math.max(20, Math.min(imageDimensions.width - newCrop.x, newCrop.width));
    newCrop.height = Math.max(20, Math.min(imageDimensions.height - newCrop.y, newCrop.height));
    
    setCropArea(newCrop);
  }, [dragState, aspect, imageDimensions]);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDragState(prev => ({ ...prev, isDragging: false }));
  }, []);

  // Add event listeners for drag operations
  useEffect(() => {
    if (dragState.isDragging) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('touchmove', handleDragMove, { passive: false });
      window.addEventListener('mouseup', handleDragEnd);
      window.addEventListener('touchend', handleDragEnd);
      
      return () => {
        window.removeEventListener('mousemove', handleDragMove);
        window.removeEventListener('touchmove', handleDragMove);
        window.removeEventListener('mouseup', handleDragEnd);
        window.removeEventListener('touchend', handleDragEnd);
      };
    }
  }, [dragState.isDragging, handleDragMove, handleDragEnd]);

  // Handle image save
  const handleSave = async () => {
    if (!imageRef.current) return;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;
    
    // Calculate actual crop area considering rotation
    const rotatedCrop = calculateRotatedCrop(cropArea, rotation, imageDimensions);
    
    canvas.width = rotatedCrop.width;
    canvas.height = rotatedCrop.height;
    
    // Draw rotated image
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(
      imageRef.current,
      -rotatedCrop.x,
      -rotatedCrop.y,
      imageDimensions.width,
      imageDimensions.height
    );
    ctx.restore();
    
    // Crop to desired area
    const croppedCanvas = document.createElement('canvas');
    const croppedCtx = croppedCanvas.getContext('2d');
    
    if (!croppedCtx) return;
    
    croppedCanvas.width = cropArea.width;
    croppedCanvas.height = cropArea.height;
    
    croppedCtx.drawImage(
      canvas,
      rotatedCrop.x,
      rotatedCrop.y,
      cropArea.width,
      cropArea.height,
      0,
      0,
      cropArea.width,
      cropArea.height
    );
    
    croppedCanvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        onCropComplete({
          croppedImage: url,
          croppedBlob: blob,
          rotation
        });
      }
    }, 'image/jpeg', 0.95);
  };

  // Calculate rotated crop area
  const calculateRotatedCrop = (crop: CropArea, rotation: number, dims: { width: number, height: number }) => {
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    
    // Calculate rotated dimensions
    const newWidth = Math.abs(dims.width * cos) + Math.abs(dims.height * sin);
    const newHeight = Math.abs(dims.width * sin) + Math.abs(dims.height * cos);
    
    // Calculate new crop position
    const newX = crop.x * (newWidth / dims.width);
    const newY = crop.y * (newHeight / dims.height);
    const newCropWidth = crop.width * (newWidth / dims.width);
    const newCropHeight = crop.height * (newHeight / dims.height);
    
    return {
      x: newX,
      y: newY,
      width: newCropWidth,
      height: newCropHeight
    };
  };

  // Reset crop to full image
  const resetCrop = () => {
    setCropArea({
      x: 0,
      y: 0,
      width: imageDimensions.width,
      height: imageDimensions.height
    });
  };

  // Apply auto-straighten (simplified version)
  const autoStraighten = () => {
    // In a real implementation, this would use image analysis
    // For now, we'll just reset rotation
    setRotation(0);
  };

  // Zoom controls
  const zoomIn = () => setZoom(prev => Math.min(prev + 0.1, 3));
  const zoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.1));
  const fitToScreen = () => setZoom(1);

  // Calculate crop area position and size in percentage for the UI
  const containerRect = containerRef.current?.getBoundingClientRect();
  const containerWidth = containerRect?.width || 400;
  const containerHeight = containerRect?.height || 400;
  
  const scaleX = containerWidth / imageDimensions.width;
  const scaleY = containerHeight / imageDimensions.height;
  const scale = Math.min(scaleX, scaleY) * zoom;
  
  const displayWidth = imageDimensions.width * scale;
  const displayHeight = imageDimensions.height * scale;
  
  const offsetX = (containerWidth - displayWidth) / 2;
  const offsetY = (containerHeight - displayHeight) / 2;
  
  const cropLeft = offsetX + cropArea.x * scale;
  const cropTop = offsetY + cropArea.y * scale;
  const cropWidth = cropArea.width * scale;
  const cropHeight = cropArea.height * scale;

  if (!imageLoaded) {
    return (
      <div className="h-full flex items-center justify-center bg-black">
        <div className="text-white text-lg">Loading image...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-black">
      {/* Header */}
      <div className="bg-gray-900 px-4 py-3 flex items-center justify-between">
        <button 
          onClick={onBack} 
          className="flex items-center space-x-2 text-white hover:text-blue-400 transition-colors"
        >
          <ArrowLeft size={20} />
          <span className="text-lg">Back</span>
        </button>
        <h2 className="text-white text-lg font-medium">Adjust Crop</h2>
        <button 
          onClick={handleSave} 
          className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Check size={20} />
          <span className="text-lg">Done</span>
        </button>
      </div>

      {/* Crop Area */}
      <div 
        ref={containerRef}
        className="relative flex-1 min-h-0 bg-gray-800 overflow-hidden"
      >
        {/* Background image */}
        <img
          ref={imageRef}
          src={image.src}
          alt="Crop source"
          className="absolute"
          style={{
            width: displayWidth,
            height: displayHeight,
            left: offsetX,
            top: offsetY,
            transform: `rotate(${rotation}deg)`,
            transformOrigin: 'center center',
          }}
        />
        
        {/* Grid overlay */}
        <div 
          className="absolute border-2 border-white border-opacity-70"
          style={{
            left: cropLeft,
            top: cropTop,
            width: cropWidth,
            height: cropHeight,
            pointerEvents: 'none',
            background: 'transparent',
          }}
        >
          {/* Grid lines */}
          <div className="absolute inset-0">
            {/* Vertical lines */}
            {[...Array(2)].map((_, i) => (
              <div 
                key={`v-${i}`} 
                className="absolute top-0 bottom-0 border-l border-white border-opacity-30"
                style={{ left: `${(i + 1) * 33.33}%` }}
              />
            ))}
            
            {/* Horizontal lines */}
            {[...Array(2)].map((_, i) => (
              <div 
                key={`h-${i}`} 
                className="absolute left-0 right-0 border-t border-white border-opacity-30"
                style={{ top: `${(i + 1) * 33.33}%` }}
              />
            ))}
          </div>
          
          {/* Corner handles */}
          <div 
            className="absolute w-4 h-4 bg-white border-2 border-blue-500 cursor-nw-resize"
            style={{ top: '-8px', left: '-8px' }}
            onMouseDown={(e) => handleDragStart(e, 'nw')}
            onTouchStart={(e) => handleDragStart(e, 'nw')}
          />
          <div 
            className="absolute w-4 h-4 bg-white border-2 border-blue-500 cursor-ne-resize"
            style={{ top: '-8px', right: '-8px' }}
            onMouseDown={(e) => handleDragStart(e, 'ne')}
            onTouchStart={(e) => handleDragStart(e, 'ne')}
          />
          <div 
            className="absolute w-4 h-4 bg-white border-2 border-blue-500 cursor-sw-resize"
            style={{ bottom: '-8px', left: '-8px' }}
            onMouseDown={(e) => handleDragStart(e, 'sw')}
            onTouchStart={(e) => handleDragStart(e, 'sw')}
          />
          <div 
            className="absolute w-4 h-4 bg-white border-2 border-blue-500 cursor-se-resize"
            style={{ bottom: '-8px', right: '-8px' }}
            onMouseDown={(e) => handleDragStart(e, 'se')}
            onTouchStart={(e) => handleDragStart(e, 'se')}
          />
          
          {/* Edge handles */}
          <div 
            className="absolute w-4 h-4 bg-white border-2 border-blue-500 cursor-n-resize"
            style={{ top: '-8px', left: '50%', transform: 'translateX(-50%)' }}
            onMouseDown={(e) => handleDragStart(e, 'n')}
            onTouchStart={(e) => handleDragStart(e, 'n')}
          />
          <div 
            className="absolute w-4 h-4 bg-white border-2 border-blue-500 cursor-s-resize"
            style={{ bottom: '-8px', left: '50%', transform: 'translateX(-50%)' }}
            onMouseDown={(e) => handleDragStart(e, 's')}
            onTouchStart={(e) => handleDragStart(e, 's')}
          />
          <div 
            className="absolute w-4 h-4 bg-white border-2 border-blue-500 cursor-w-resize"
            style={{ top: '50%', left: '-8px', transform: 'translateY(-50%)' }}
            onMouseDown={(e) => handleDragStart(e, 'w')}
            onTouchStart={(e) => handleDragStart(e, 'w')}
          />
          <div 
            className="absolute w-4 h-4 bg-white border-2 border-blue-500 cursor-e-resize"
            style={{ top: '50%', right: '-8px', transform: 'translateY(-50%)' }}
            onMouseDown={(e) => handleDragStart(e, 'e')}
            onTouchStart={(e) => handleDragStart(e, 'e')}
          />
        </div>
        
        {/* Zoom controls */}
        <div className="absolute bottom-4 right-4 flex flex-col space-y-2">
          <button
            onClick={zoomIn}
            className="w-12 h-12 bg-black bg-opacity-70 hover:bg-opacity-90 text-white rounded-full flex items-center justify-center transition-all"
            title="Zoom In"
          >
            <ZoomIn size={20} />
          </button>
          <button
            onClick={zoomOut}
            className="w-12 h-12 bg-black bg-opacity-70 hover:bg-opacity-90 text-white rounded-full flex items-center justify-center transition-all"
            title="Zoom Out"
          >
            <ZoomOut size={20} />
          </button>
          <button
            onClick={fitToScreen}
            className="w-12 h-12 bg-blue-600 bg-opacity-80 hover:bg-opacity-100 text-white rounded-full flex items-center justify-center transition-all"
            title="Fit to Screen"
          >
            <FitScreen size={18} />
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-gray-900 p-4 space-y-4 max-h-64 overflow-y-auto">
        {/* Aspect Ratios */}
        <div className="flex justify-center space-x-3 flex-wrap gap-2">
          {aspectRatios.map((ratio) => (
            <button
              key={ratio.label}
              onClick={() => setAspect(ratio.value)}
              className={`px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                aspect === ratio.value 
                  ? 'bg-blue-600 text-white ring-2 ring-blue-400' 
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
            >
              {ratio.label}
            </button>
          ))}
        </div>

        {/* Zoom Control */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300">
              Zoom: {zoom.toFixed(1)}x
            </label>
          </div>
          <div className="relative">
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.1"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>

        {/* Rotation Control */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300">
              Rotation: {rotation.toFixed(0)}°
            </label>
            <button
              onClick={autoStraighten}
              className="flex items-center space-x-1 text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              <RotateCcw size={16} />
              <span>Auto-Straighten</span>
            </button>
          </div>
          <div className="relative">
            <input
              type="range"
              min="-45"
              max="45"
              step="0.5"
              value={rotation}
              onChange={(e) => setRotation(Number(e.target.value))}
              className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-center space-x-4">
          <button
            onClick={resetCrop}
            className="flex items-center space-x-1 text-blue-400 hover:text-blue-300 transition-colors"
          >
            <Maximize2 size={16} />
            <span>Reset Crop</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Cropper;