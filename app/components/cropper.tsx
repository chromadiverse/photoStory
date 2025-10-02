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
  MonitorCog as FitScreen,
  RotateCcw as RotateIcon
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
 
  initialMouse: Point;
  initialCropStart: Point;
}

// Only the priority ratios as requested
const printRatios = [
  { label: 'Free', value: null },
  { label: '3:2', value: 3/2 },
  { label: '5:4', value: 5/4 },
  { label: '7:5', value: 7/5 },
  { label: '1:1', value: 1 },
];

const Cropper: React.FC<CropperProps> = ({ image, onCropComplete, onBack }) => {
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [originalDimensions, setOriginalDimensions] = useState({ width: 0, height: 0 });
  const [cropArea, setCropArea] = useState<CropArea>({ x: 0, y: 0, width: 0, height: 0 });
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(0.5);
  const [aspect, setAspect] = useState<number | null>(null);
  const [selectedRatio, setSelectedRatio] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState>({ 
    isDragging: false, 
    dragType: 'none', 
    start: { x: 0, y: 0 }, 
    initialCrop: { x: 0, y: 0, width: 0, height: 0 },
    initialMouse: { x: 0, y: 0 },
    initialCropStart: { x: 0, y: 0 }
  });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Initialize image dimensions and crop area
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      setOriginalDimensions({ width, height });
      setImageDimensions({ width, height });
      setOriginalImageSrc(image.src); // Store original source
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

  // Resize the original image to match the selected aspect ratio (with padding)
  const resizeImageToRatio = useCallback(async (targetRatio: number | null) => {
    if (!originalImageSrc || targetRatio === null) {
      // For 'Free' ratio, reset to original
      setProcessedImage(null);
      setImageDimensions({ width: originalDimensions.width, height: originalDimensions.height });
      setCropArea({
        x: 0,
        y: 0,
        width: originalDimensions.width,
        height: originalDimensions.height
      });
      return;
    }

    const originalWidth = originalDimensions.width;
    const originalHeight = originalDimensions.height;
    const originalRatio = originalWidth / originalHeight;

    let newWidth: number, newHeight: number;

    // Calculate new dimensions that match the target ratio (with padding)
    if (originalRatio > targetRatio) {
      // Original is wider than target - add vertical padding
      newWidth = originalWidth;
      newHeight = originalWidth / targetRatio;
    } else {
      // Original is taller than target - add horizontal padding
      newHeight = originalHeight;
      newWidth = originalHeight * targetRatio;
    }

    // Create canvas to resize with padding
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = newWidth;
    canvas.height = newHeight;

    // Fill with white background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, newWidth, newHeight);

    // Create temporary image from original source
    const tempImg = new Image();
    tempImg.src = originalImageSrc;
    
    // Wait for image to load
    await new Promise<void>((resolve) => {
      tempImg.onload = () => resolve();
    });

    // Calculate position to center the original image
    const offsetX = (newWidth - originalWidth) / 2;
    const offsetY = (newHeight - originalHeight) / 2;

    // Draw the original image centered
    ctx.drawImage(
      tempImg,
      offsetX, // Destination X
      offsetY, // Destination Y
      originalWidth, // Destination Width
      originalHeight  // Destination Height
    );

    // Convert to blob and create object URL
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.95);
    });

    if (blob) {
      const url = URL.createObjectURL(blob);
      setProcessedImage(url);
      
      // Update image dimensions to the new ratio
      setImageDimensions({
        width: newWidth,
        height: newHeight
      });
      
      // Reset crop area to full new image
      setCropArea({
        x: 0,
        y: 0,
        width: newWidth,
        height: newHeight
      });
    }
  }, [originalImageSrc, originalDimensions]);

  // Handle ratio selection
  const handleRatioSelect = (ratioOption: typeof printRatios[0]) => {
    setSelectedRatio(ratioOption.label);
    setAspect(ratioOption.value);
    
    // Resize the original image to match this ratio
    resizeImageToRatio(ratioOption.value);
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
    initialCrop: { ...cropArea },
    initialMouse: { x: clientX, y: clientY },
    initialCropStart: { x: cropArea.x, y: cropArea.y }
  });
};
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
      // Top-left corner
      newCrop.x = dragState.initialCropStart.x + imageDeltaX;
      newCrop.y = dragState.initialCropStart.y + imageDeltaY;
      newCrop.width = dragState.initialCrop.width - imageDeltaX;
      newCrop.height = dragState.initialCrop.height - imageDeltaY;
      break;
    case 'ne':
      // Top-right corner
      newCrop.y = dragState.initialCropStart.y + imageDeltaY;
      newCrop.width = dragState.initialCrop.width + imageDeltaX;
      newCrop.height = dragState.initialCrop.height - imageDeltaY;
      break;
    case 'sw':
      // Bottom-left corner
      newCrop.x = dragState.initialCropStart.x + imageDeltaX;
      newCrop.width = dragState.initialCrop.width - imageDeltaX;
      newCrop.height = dragState.initialCrop.height + imageDeltaY;
      break;
    case 'se':
      // Bottom-right corner
      newCrop.width = dragState.initialCrop.width + imageDeltaX;
      newCrop.height = dragState.initialCrop.height + imageDeltaY;
      break;
    case 'n':
      // Top edge
      newCrop.y = dragState.initialCropStart.y + imageDeltaY;
      newCrop.height = dragState.initialCrop.height - imageDeltaY;
      break;
    case 's':
      // Bottom edge
      newCrop.height = dragState.initialCrop.height + imageDeltaY;
      break;
    case 'w':
      // Left edge
      newCrop.x = dragState.initialCropStart.x + imageDeltaX;
      newCrop.width = dragState.initialCrop.width - imageDeltaX;
      break;
    case 'e':
      // Right edge
      newCrop.width = dragState.initialCrop.width + imageDeltaX;
      break;
    case 'move':
      // Moving the entire crop area
      newCrop.x = dragState.initialCropStart.x + imageDeltaX;
      newCrop.y = dragState.initialCropStart.y + imageDeltaY;
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
    const imgSrc = processedImage || image.src;
    
    // Create a temporary image to get dimensions
    const tempImg = new Image();
    tempImg.src = imgSrc;
    
    tempImg.onload = () => {
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
          tempImg,
          cropArea.x - tempImg.width / 2,
          cropArea.y - tempImg.height / 2,
          tempImg.width,
          tempImg.height
        );
        
        ctx.restore();
      } else {
        // Simple crop without rotation
        ctx.drawImage(
          tempImg,
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
    setRotation(0);
  };

  // Zoom controls
  const zoomIn = () => setZoom(prev => Math.min(prev + 0.1, 3));
  const zoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.1));
  const fitToScreen = () => {
    setZoom(1);
    // Reset crop area to full image after zooming
    setCropArea({
      x: 0,
      y: 0,
      width: imageDimensions.width,
      height: imageDimensions.height
    });
  };

  // Rotate image (vertical/horizontal switch)
  const rotateImage = () => {
    const newRotation = (rotation + 90) % 360;
    setRotation(newRotation);
  };

  // Center image when zoom changes
  useEffect(() => {
    if (imageLoaded) {
      setCropArea({
        x: 0,
        y: 0,
        width: imageDimensions.width,
        height: imageDimensions.height
      });
    }
  }, [imageDimensions]);

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
   <div className="h-full flex flex-col bg-black">
  {/* Header */}
  <div className="bg-black px-4 py-3 flex items-center justify-between">
    <button 
      onClick={onBack} 
      className="flex items-center gap-2 text-white hover:text-blue-400 transition-colors"
    >
      <ArrowLeft className="w-5 h-5" />
      <span className="text-lg font-medium">Cancel</span>
    </button>
    <h2 className="text-white text-lg font-bold">Edit</h2>
    <button 
      onClick={handleSave} 
      className="flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors font-medium"
    >
      <span className="text-lg">Done</span>
    </button>
  </div>

  {/* Crop Area */}
  <div 
    ref={containerRef}
    className="relative flex-1 min-h-0 bg-black overflow-hidden touch-none"
    style={{ touchAction: 'none' }}
  >
    {/* Background image */}
    <img
      ref={imageRef}
      src={processedImage || image.src}
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
      className="absolute border-2 border-white border-opacity-80"
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
            className="absolute top-0 bottom-0 border-l border-white border-opacity-40"
            style={{ left: `${(i + 1) * 33.33}%` }}
          />
        ))}
        
        {/* Horizontal lines */}
        {[...Array(2)].map((_, i) => (
          <div 
            key={`h-${i}`} 
            className="absolute left-0 right-0 border-t border-white border-opacity-40"
            style={{ top: `${(i + 1) * 33.33}%` }}
          />
        ))}
      </div>
      
      {/* Corner handles */}
      <div 
        className="absolute w-6 h-6 bg-white border-2 border-white cursor-nw-resize touch-manipulation"
        style={{ 
          top: '-12px', 
          left: '-12px',
          borderRadius: '50%',
          touchAction: 'none'
        }}
        onMouseDown={(e) => handleDragStart(e, 'nw')}
        onTouchStart={(e) => handleDragStart(e, 'nw')}
      />
      <div 
        className="absolute w-6 h-6 bg-white border-2 border-white cursor-ne-resize touch-manipulation"
        style={{ 
          top: '-12px', 
          right: '-12px',
          borderRadius: '50%',
          touchAction: 'none'
        }}
        onMouseDown={(e) => handleDragStart(e, 'ne')}
        onTouchStart={(e) => handleDragStart(e, 'ne')}
      />
      <div 
        className="absolute w-6 h-6 bg-white border-2 border-white cursor-sw-resize touch-manipulation"
        style={{ 
          bottom: '-12px', 
          left: '-12px',
          borderRadius: '50%',
          touchAction: 'none'
        }}
        onMouseDown={(e) => handleDragStart(e, 'sw')}
        onTouchStart={(e) => handleDragStart(e, 'sw')}
      />
      <div 
        className="absolute w-6 h-6 bg-white border-2 border-white cursor-se-resize touch-manipulation"
        style={{ 
          bottom: '-12px', 
          right: '-12px',
          borderRadius: '50%',
          touchAction: 'none'
        }}
        onMouseDown={(e) => handleDragStart(e, 'se')}
        onTouchStart={(e) => handleDragStart(e, 'se')}
      />
    </div>
  </div>

  {/* Controls */}
  <div className="bg-black p-4 space-y-4">
    {/* Rotate and Aspect Controls */}
    <div className="flex justify-center gap-6">
      <button
        onClick={rotateImage}
        className="flex flex-col items-center gap-1 text-white hover:text-blue-400 transition-colors"
        title="Rotate Image"
      >
        <div className="w-10 h-10 flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 12a10 10 0 1 0 10-10 10 10 0 0 0-10 10Z" />
            <path d="M2 12h5l-5 5V2" />
          </svg>
        </div>
        <span className="text-xs">Rotate</span>
      </button>
      
      <button
        onClick={zoomOut}
        className="flex flex-col items-center gap-1 text-white hover:text-blue-400 transition-colors"
        title="Zoom Out"
      >
        <div className="w-10 h-10 flex items-center justify-center">
          <ZoomOut className="w-6 h-6" />
        </div>
        <span className="text-xs">Zoom Out</span>
      </button>
      
      <button
        onClick={zoomIn}
        className="flex flex-col items-center gap-1 text-white hover:text-blue-400 transition-colors"
        title="Zoom In"
      >
        <div className="w-10 h-10 flex items-center justify-center">
          <ZoomIn className="w-6 h-6" />
        </div>
        <span className="text-xs">Zoom In</span>
      </button>
    </div>

    {/* Aspect Ratios */}
    <div className="flex justify-center gap-2 flex-wrap">
      {printRatios.map((ratio) => (
        <button
          key={ratio.label}
          onClick={() => handleRatioSelect(ratio)}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition-all touch-manipulation ${
            selectedRatio === ratio.label 
              ? 'bg-white text-black' 
              : 'bg-gray-800 text-white hover:bg-gray-700'
          }`}
        >
          {ratio.label}
        </button>
      ))}
    </div>
  </div>
</div>
  );
};

export default Cropper;