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
  { label: '1', value: 1 },
  { label: '4/3', value: 4/3 },
  { label: '3/2', value: 3/2 },
  { label: '16/9', value: 16/9 },
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
      
      // Set initial crop area to center of image
      centerImage(width, height);
    };
    img.src = image.src;
  }, [image.src]);

  // Center the image in the crop area
  const centerImage = (imgWidth: number, imgHeight: number) => {
    // Calculate the crop area to center the image
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;
    
    // Calculate the scaled dimensions of the image
    const scaleX = containerWidth / imgWidth;
    const scaleY = containerHeight / imgHeight;
    const scale = Math.min(scaleX, scaleY) * zoom;
    
    const displayWidth = imgWidth * scale;
    const displayHeight = imgHeight * scale;
    
    // Calculate the centered position
    const offsetX = (containerWidth - displayWidth) / 2;
    const offsetY = (containerHeight - displayHeight) / 2;
    
    // Calculate the crop area dimensions (initially full image)
    let cropWidth = imgWidth;
    let cropHeight = imgHeight;
    
    // Adjust crop area if aspect ratio is set
    if (aspect) {
      if (aspect > 1) { // Landscape
        cropHeight = imgWidth / aspect;
        if (cropHeight > imgHeight) {
          cropHeight = imgHeight;
          cropWidth = imgHeight * aspect;
        }
      } else { // Portrait or square
        cropWidth = imgHeight * aspect;
        if (cropWidth > imgWidth) {
          cropWidth = imgWidth;
          cropHeight = imgWidth / aspect;
        }
      }
    }
    
    // Center the crop area
    const cropX = Math.max(0, (imgWidth - cropWidth) / 2);
    const cropY = Math.max(0, (imgHeight - cropHeight) / 2);
    
    setCropArea({
      x: cropX,
      y: cropY,
      width: cropWidth,
      height: cropHeight
    });
  };

  // Convert screen coordinates to image coordinates
  const screenToImageCoords = useCallback((screenX: number, screenY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;
    
    const scaleX = containerWidth / imageDimensions.width;
    const scaleY = containerHeight / imageDimensions.height;
    const scale = Math.min(scaleX, scaleY) * zoom;
    
    const displayWidth = imageDimensions.width * scale;
    const displayHeight = imageDimensions.height * scale;
    
    const offsetX = (containerWidth - displayWidth) / 2;
    const offsetY = (containerHeight - displayHeight) / 2;
    
    // Convert screen coordinates to image coordinates
    const relativeX = screenX - containerRect.left - offsetX;
    const relativeY = screenY - containerRect.top - offsetY;
    
    const imageX = relativeX / scale;
    const imageY = relativeY / scale;
    
    return { x: imageX, y: imageY };
  }, [imageDimensions, zoom]);

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
    
    // Prevent default to avoid scrolling on touch devices
    e.preventDefault();
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const deltaX = clientX - dragState.start.x;
    const deltaY = clientY - dragState.start.y;
    
    // Convert delta to image coordinates
    const containerRect = containerRef.current.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;
    const scaleX = containerWidth / imageDimensions.width;
    const scaleY = containerHeight / imageDimensions.height;
    const scale = Math.min(scaleX, scaleY) * zoom;
    
    const imageDeltaX = deltaX / scale;
    const imageDeltaY = deltaY / scale;
    
    let newCrop = { ...dragState.initialCrop };
    
    switch (dragState.dragType) {
      case 'nw':
        newCrop.x += imageDeltaX;
        newCrop.y += imageDeltaY;
        newCrop.width -= imageDeltaX;
        newCrop.height -= imageDeltaY;
        break;
      case 'ne':
        newCrop.y += imageDeltaY;
        newCrop.width += imageDeltaX;
        newCrop.height -= imageDeltaY;
        break;
      case 'sw':
        newCrop.x += imageDeltaX;
        newCrop.width -= imageDeltaX;
        newCrop.height += imageDeltaY;
        break;
      case 'se':
        newCrop.width += imageDeltaX;
        newCrop.height += imageDeltaY;
        break;
      case 'n':
        newCrop.y += imageDeltaY;
        newCrop.height -= imageDeltaY;
        break;
      case 's':
        newCrop.height += imageDeltaY;
        break;
      case 'w':
        newCrop.x += imageDeltaX;
        newCrop.width -= imageDeltaX;
        break;
      case 'e':
        newCrop.width += imageDeltaX;
        break;
      case 'move':
        newCrop.x += imageDeltaX;
        newCrop.y += imageDeltaY;
        break;
    }
    
    // Apply aspect ratio if set
    if (aspect && dragState.dragType !== 'move') {
      const aspectRatio = aspect;
      if (['n', 's'].includes(dragState.dragType)) {
        newCrop.width = newCrop.height * aspectRatio;
      } else if (['w', 'e'].includes(dragState.dragType)) {
        newCrop.height = newCrop.width / aspectRatio;
      } else {
        // For corner handles, maintain aspect ratio based on width change
        newCrop.height = newCrop.width / aspectRatio;
      }
    }
    
    // Boundary checks with minimum size
    const minSize = 50;
    newCrop.width = Math.max(minSize, newCrop.width);
    newCrop.height = Math.max(minSize, newCrop.height);
    
    // Keep within image bounds
    newCrop.x = Math.max(0, Math.min(imageDimensions.width - newCrop.width, newCrop.x));
    newCrop.y = Math.max(0, Math.min(imageDimensions.height - newCrop.height, newCrop.y));
    
    // Adjust size if it goes beyond bounds
    newCrop.width = Math.min(imageDimensions.width - newCrop.x, newCrop.width);
    newCrop.height = Math.min(imageDimensions.height - newCrop.y, newCrop.height);
    
    setCropArea(newCrop);
  }, [dragState, aspect, imageDimensions, zoom]);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDragState(prev => ({ ...prev, isDragging: false }));
  }, []);

  // Add event listeners for drag operations
  useEffect(() => {
    if (dragState.isDragging) {
      const handleMouseMove = (e: MouseEvent) => handleDragMove(e);
      const handleTouchMove = (e: TouchEvent) => {
        e.preventDefault(); // Prevent scrolling
        handleDragMove(e);
      };
      
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('mouseup', handleDragEnd);
      window.addEventListener('touchend', handleDragEnd);
      
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('touchmove', handleTouchMove);
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
    
    // Set canvas size to the crop area dimensions
    canvas.width = cropArea.width;
    canvas.height = cropArea.height;
    
    if (rotation !== 0) {
      // Handle rotation case
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      
      // Draw the rotated image, cropping to the selected area
      ctx.drawImage(
        imageRef.current,
        cropArea.x - imageDimensions.width / 2,
        cropArea.y - imageDimensions.height / 2,
        imageDimensions.width,
        imageDimensions.height
      );
      
      ctx.restore();
    } else {
      // Simple crop without rotation
      ctx.drawImage(
        imageRef.current,
        cropArea.x,           // Source X
        cropArea.y,           // Source Y
        cropArea.width,       // Source Width
        cropArea.height,      // Source Height
        0,                    // Destination X
        0,                    // Destination Y
        cropArea.width,       // Destination Width
        cropArea.height       // Destination Height
      );
    }
    
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        onCropComplete({
          croppedImage: url,
          croppedBlob: blob,
          rotation: 0 // Reset rotation since it's been applied
        });
      }
    }, 'image/jpeg', 0.95);
  };

  // Reset crop to full image
  const resetCrop = () => {
    centerImage(imageDimensions.width, imageDimensions.height);
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
  const fitToScreen = () => {
    setZoom(1);
    // Center the image after zooming
    setTimeout(() => centerImage(imageDimensions.width, imageDimensions.height), 0);
  };

  // Center image when zoom changes
  useEffect(() => {
    if (imageLoaded) {
      centerImage(imageDimensions.width, imageDimensions.height);
    }
  }, [zoom, aspect, imageLoaded]);

  // Calculate crop area position and size for the UI
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
   <div className="h-full flex flex-col bg-gradient-to-br from-blue-50 to-indigo-100">
  {/* Header */}
  <div className="bg-white/90 backdrop-blur-sm shadow-sm px-4 py-3 flex items-center justify-between">
    <button 
      onClick={onBack} 
      className="flex items-center gap-2 text-gray-700 hover:text-blue-600 transition-colors"
    >
      <ArrowLeft className="w-5 h-5" />
      <span className="text-lg font-medium">Back</span>
    </button>
    <h2 className="text-gray-800 text-lg font-bold">Adjust Crop</h2>
    <button 
      onClick={handleSave} 
      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors font-medium"
    >
      <Check className="w-5 h-5" />
      <span className="text-lg">Done</span>
    </button>
  </div>

  {/* Crop Area */}
  <div 
    ref={containerRef}
    className="relative flex-1 min-h-0 bg-white/60 overflow-hidden touch-none shadow-inner"
    style={{ touchAction: 'none' }}
  >
    {/* Background image */}
    <img
      ref={imageRef}
      src={image.src}
      alt="Crop source"
      className="absolute pointer-events-none select-none"
      style={{
        width: displayWidth,
        height: displayHeight,
        left: offsetX,
        top: offsetY,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: 'center center',
      }}
      draggable={false}
    />
    
    {/* Crop overlay */}
    <div 
      className="absolute border-2 border-blue-600 border-opacity-80"
      style={{
        left: cropLeft,
        top: cropTop,
        width: cropWidth,
        height: cropHeight,
        background: 'transparent',
      }}
    >
      {/* Grid lines */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Vertical lines */}
        {[...Array(2)].map((_, i) => (
          <div 
            key={`v-${i}`} 
            className="absolute top-0 bottom-0 border-l border-blue-500 border-opacity-40"
            style={{ left: `${(i + 1) * 33.33}%` }}
          />
        ))}
        
        {/* Horizontal lines */}
        {[...Array(2)].map((_, i) => (
          <div 
            key={`h-${i}`} 
            className="absolute left-0 right-0 border-t border-blue-500 border-opacity-40"
            style={{ top: `${(i + 1) * 33.33}%` }}
          />
        ))}
      </div>
      
      {/* Corner handles */}
      <div 
        className="absolute w-8 h-8 bg-white border-2 border-blue-600 cursor-nw-resize touch-manipulation shadow-sm"
        style={{ 
          top: '-16px', 
          left: '-16px',
          borderRadius: '50%',
          touchAction: 'none'
        }}
        onMouseDown={(e) => handleDragStart(e, 'nw')}
        onTouchStart={(e) => handleDragStart(e, 'nw')}
      />
      <div 
        className="absolute w-8 h-8 bg-white border-2 border-blue-600 cursor-ne-resize touch-manipulation shadow-sm"
        style={{ 
          top: '-16px', 
          right: '-16px',
          borderRadius: '50%',
          touchAction: 'none'
        }}
        onMouseDown={(e) => handleDragStart(e, 'ne')}
        onTouchStart={(e) => handleDragStart(e, 'ne')}
      />
      <div 
        className="absolute w-8 h-8 bg-white border-2 border-blue-600 cursor-sw-resize touch-manipulation shadow-sm"
        style={{ 
          bottom: '-16px', 
          left: '-16px',
          borderRadius: '50%',
          touchAction: 'none'
        }}
        onMouseDown={(e) => handleDragStart(e, 'sw')}
        onTouchStart={(e) => handleDragStart(e, 'sw')}
      />
      <div 
        className="absolute w-8 h-8 bg-white border-2 border-blue-600 cursor-se-resize touch-manipulation shadow-sm"
        style={{ 
          bottom: '-16px', 
          right: '-16px',
          borderRadius: '50%',
          touchAction: 'none'
        }}
        onMouseDown={(e) => handleDragStart(e, 'se')}
        onTouchStart={(e) => handleDragStart(e, 'se')}
      />
      
      {/* Edge handles */}
      <div 
        className="absolute w-8 h-6 bg-white border-2 border-blue-600 cursor-n-resize touch-manipulation shadow-sm"
        style={{ 
          top: '-12px', 
          left: '50%', 
          transform: 'translateX(-50%)',
          borderRadius: '4px',
          touchAction: 'none'
        }}
        onMouseDown={(e) => handleDragStart(e, 'n')}
        onTouchStart={(e) => handleDragStart(e, 'n')}
      />
      <div 
        className="absolute w-8 h-6 bg-white border-2 border-blue-600 cursor-s-resize touch-manipulation shadow-sm"
        style={{ 
          bottom: '-12px', 
          left: '50%', 
          transform: 'translateX(-50%)',
          borderRadius: '4px',
          touchAction: 'none'
        }}
        onMouseDown={(e) => handleDragStart(e, 's')}
        onTouchStart={(e) => handleDragStart(e, 's')}
      />
      <div 
        className="absolute w-6 h-8 bg-white border-2 border-blue-600 cursor-w-resize touch-manipulation shadow-sm"
        style={{ 
          top: '50%', 
          left: '-12px', 
          transform: 'translateY(-50%)',
          borderRadius: '4px',
          touchAction: 'none'
        }}
        onMouseDown={(e) => handleDragStart(e, 'w')}
        onTouchStart={(e) => handleDragStart(e, 'w')}
      />
      <div 
        className="absolute w-6 h-8 bg-white border-2 border-blue-600 cursor-e-resize touch-manipulation shadow-sm"
        style={{ 
          top: '50%', 
          right: '-12px', 
          transform: 'translateY(-50%)',
          borderRadius: '4px',
          touchAction: 'none'
        }}
        onMouseDown={(e) => handleDragStart(e, 'e')}
        onTouchStart={(e) => handleDragStart(e, 'e')}
      />
    </div>
    
    {/* Center move handle */}
    <div 
      className="absolute w-10 h-10 bg-white bg-opacity-90 border-2 border-blue-600 cursor-move touch-manipulation shadow-sm"
      style={{
        left: cropLeft + cropWidth / 2 - 20,
        top: cropTop + cropHeight / 2 - 20,
        borderRadius: '50%',
        touchAction: 'none',
        backdropFilter: 'blur(2px)'
      }}
      onMouseDown={(e) => handleDragStart(e, 'move')}
      onTouchStart={(e) => handleDragStart(e, 'move')}
    >
      <div className="absolute inset-2 bg-blue-600 rounded-full opacity-60"></div>
    </div>
  </div>

  {/* Controls */}
  <div className="bg-white/90 backdrop-blur-sm shadow-sm p-4 space-y-4 max-h-64 overflow-y-auto">
    {/* Zoom Controls */}
    <div className="flex justify-center gap-3">
      <button
        onClick={zoomOut}
        className="w-12 h-12 bg-white/60 hover:bg-white/80 border border-gray-200 text-gray-700 rounded-full flex items-center justify-center transition-all touch-manipulation shadow-sm"
        title="Zoom Out"
      >
        <ZoomOut className="w-5 h-5" />
      </button>
      <button
        onClick={zoomIn}
        className="w-12 h-12 bg-white/60 hover:bg-white/80 border border-gray-200 text-gray-700 rounded-full flex items-center justify-center transition-all touch-manipulation shadow-sm"
        title="Zoom In"
      >
        <ZoomIn className="w-5 h-5" />
      </button>
      <button
        onClick={fitToScreen}
        className="w-12 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center justify-center transition-all touch-manipulation shadow-sm"
        title="Fit to Screen"
      >
        <FitScreen className="w-5 h-5" />
      </button>
    </div>

    {/* Aspect Ratios */}
    <div className="flex justify-center gap-2 flex-wrap">
      {aspectRatios.map((ratio) => (
        <button
          key={ratio.label}
          onClick={() => setAspect(ratio.value)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all touch-manipulation ${
            aspect === ratio.value 
              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm' 
              : 'bg-white/60 hover:bg-white/80 border border-gray-200 text-gray-700'
          }`}
        >
          {ratio.label}
        </button>
      ))}
    </div>

    {/* Zoom Control */}
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">
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
          className="w-full h-6 bg-gray-200 rounded-lg appearance-none cursor-pointer touch-manipulation"
        />
      </div>
    </div>

    {/* Rotation Control */}
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">
          Rotation: {rotation.toFixed(0)}°
        </label>
        <button
          onClick={autoStraighten}
          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 transition-colors touch-manipulation font-medium"
        >
          <RotateCcw className="w-4 h-4" />
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
          className="w-full h-6 bg-gray-200 rounded-lg appearance-none cursor-pointer touch-manipulation"
        />
      </div>
    </div>

    {/* Actions */}
    <div className="flex justify-center">
      <button
        onClick={resetCrop}
        className="flex items-center gap-1 text-blue-600 hover:text-blue-700 transition-colors touch-manipulation font-medium"
      >
        <Maximize2 className="w-4 h-4" />
        <span>Reset Crop</span>
      </button>
    </div>
  </div>
</div>
  );
};

export default Cropper;