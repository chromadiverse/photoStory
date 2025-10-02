'use client'

import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  ArrowLeft, 
  RotateCw as RotateIcon
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

  // =============== PINCH-TO-ZOOM STATE ===============
  const [touchDistance, setTouchDistance] = useState(0);
  const [initialZoom, setInitialZoom] = useState(0.5);

  // Initialize image dimensions and crop area
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      setOriginalDimensions({ width, height });
      setImageDimensions({ width, height });
      setOriginalImageSrc(image.src);
      setImageLoaded(true);
      
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

    if (originalRatio > targetRatio) {
      newWidth = originalWidth;
      newHeight = originalWidth / targetRatio;
    } else {
      newHeight = originalHeight;
      newWidth = originalHeight * targetRatio;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = newWidth;
    canvas.height = newHeight;

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, newWidth, newHeight);

    const tempImg = new Image();
    tempImg.src = originalImageSrc;
    
    await new Promise<void>((resolve) => {
      tempImg.onload = () => resolve();
    });

    const offsetX = (newWidth - originalWidth) / 2;
    const offsetY = (newHeight - originalHeight) / 2;

    ctx.drawImage(tempImg, offsetX, offsetY, originalWidth, originalHeight);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.95);
    });

    if (blob) {
      const url = URL.createObjectURL(blob);
      setProcessedImage(url);
      setImageDimensions({ width: newWidth, height: newHeight });
      setCropArea({ x: 0, y: 0, width: newWidth, height: newHeight });
    }
  }, [originalImageSrc, originalDimensions]);

  // Handle ratio selection
  const handleRatioSelect = (ratioOption: typeof printRatios[0]) => {
    setSelectedRatio(ratioOption.label);
    setAspect(ratioOption.value);
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
    e.preventDefault();
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const deltaX = clientX - dragState.start.x;
    const deltaY = clientY - dragState.start.y;
    
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
        newCrop.x = dragState.initialCropStart.x + imageDeltaX;
        newCrop.y = dragState.initialCropStart.y + imageDeltaY;
        newCrop.width = dragState.initialCrop.width - imageDeltaX;
        newCrop.height = dragState.initialCrop.height - imageDeltaY;
        break;
      case 'ne':
        newCrop.y = dragState.initialCropStart.y + imageDeltaY;
        newCrop.width = dragState.initialCrop.width + imageDeltaX;
        newCrop.height = dragState.initialCrop.height - imageDeltaY;
        break;
      case 'sw':
        newCrop.x = dragState.initialCropStart.x + imageDeltaX;
        newCrop.width = dragState.initialCrop.width - imageDeltaX;
        newCrop.height = dragState.initialCrop.height + imageDeltaY;
        break;
      case 'se':
        newCrop.width = dragState.initialCrop.width + imageDeltaX;
        newCrop.height = dragState.initialCrop.height + imageDeltaY;
        break;
      case 'move':
        newCrop.x = dragState.initialCropStart.x + imageDeltaX;
        newCrop.y = dragState.initialCropStart.y + imageDeltaY;
        break;
      default:
        return;
    }
    
    if (aspect && dragState.dragType !== 'move') {
      newCrop.height = newCrop.width / aspect;
    }
    
    const minSize = 50;
    newCrop.width = Math.max(minSize, newCrop.width);
    newCrop.height = Math.max(minSize, newCrop.height);
    
    newCrop.x = Math.max(0, Math.min(imageDimensions.width - newCrop.width, newCrop.x));
    newCrop.y = Math.max(0, Math.min(imageDimensions.height - newCrop.height, newCrop.y));
    
    newCrop.width = Math.min(imageDimensions.width - newCrop.x, newCrop.width);
    newCrop.height = Math.min(imageDimensions.height - newCrop.y, newCrop.height);
    
    setCropArea(newCrop);
  }, [dragState, aspect, imageDimensions, zoom]);

  const handleDragEnd = useCallback(() => {
    setDragState(prev => ({ ...prev, isDragging: false }));
  }, []);

  useEffect(() => {
    if (dragState.isDragging) {
      const handleMouseMove = (e: MouseEvent) => handleDragMove(e);
      const handleTouchMove = (e: TouchEvent) => {
        e.preventDefault();
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

  // =============== PINCH-TO-ZOOM ===============
const getDistance = (touches: React.TouchList) => {
  if (touches.length < 2) return 0;
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
};

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      setTouchDistance(getDistance(e.touches));
      setInitialZoom(zoom);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 2 && touchDistance > 0) {
      const newDistance = getDistance(e.touches);
      const zoomChange = newDistance / touchDistance;
      const newZoom = Math.max(0.3, Math.min(initialZoom * zoomChange, 3));
      setZoom(newZoom);
    }
  };

  const handleTouchEnd = () => {
    setTouchDistance(0);
  };

  // =============== ROTATION ===============
  const rotateImage = () => {
    const newRotation = (rotation + 90) % 360;
    setRotation(newRotation);
    
    if (newRotation % 180 !== 0) {
      setImageDimensions(prev => ({
        width: prev.height,
        height: prev.width
      }));
      
      setCropArea(prev => ({
        x: Math.min(prev.x, imageDimensions.height - 50),
        y: Math.min(prev.y, imageDimensions.width - 50),
        width: Math.min(prev.width, imageDimensions.height),
        height: Math.min(prev.height, imageDimensions.width)
      }));
    }
  };

  // =============== SAVE ===============
  const handleSave = async () => {
    const imgSrc = processedImage || image.src;
    const tempImg = new Image();
    tempImg.src = imgSrc;
    
    tempImg.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const outputWidth = cropArea.width;
      const outputHeight = cropArea.height;

      if (rotation % 360 === 0) {
        canvas.width = outputWidth;
        canvas.height = outputHeight;
        ctx.drawImage(
          tempImg,
          cropArea.x, cropArea.y,
          outputWidth, outputHeight,
          0, 0,
          outputWidth, outputHeight
        );
      } else {
        canvas.width = outputWidth;
        canvas.height = outputHeight;
        ctx.save();
        ctx.translate(outputWidth / 2, outputHeight / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.drawImage(
          tempImg,
          cropArea.x, cropArea.y,
          outputWidth, outputHeight,
          -outputWidth / 2, -outputHeight / 2,
          outputWidth, outputHeight
        );
        ctx.restore();
      }

      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          onCropComplete({
            croppedImage: url,
            croppedBlob: blob,
            rotation: 0
          });
        }
      }, 'image/jpeg', 0.92);
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

  // Calculate display metrics
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

  if (!imageLoaded) {
    return (
      <div className="h-full flex items-center justify-center bg-black">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-black text-white">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between bg-black/80">
        <button 
          onClick={onBack} 
          className="flex items-center gap-2 text-white hover:text-blue-300"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Cancel</span>
        </button>
        <h2 className="font-bold text-lg">Edit</h2>
        <button 
          onClick={handleSave} 
          className="text-blue-400 font-medium hover:text-blue-300"
        >
          Done
        </button>
      </div>

      {/* Crop Area */}
      <div 
        ref={containerRef}
        className="relative flex-1 min-h-0 bg-black overflow-hidden"
        style={{ touchAction: 'none' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <img
          src={processedImage || image.src}
          alt="Crop source"
          className="absolute select-none"
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
            left: offsetX + cropArea.x * scale,
            top: offsetY + cropArea.y * scale,
            width: cropArea.width * scale,
            height: cropArea.height * scale,
          }}
        >
          {/* Grid lines */}
          <div className="absolute inset-0 pointer-events-none">
            {[...Array(2)].map((_, i) => (
              <div 
                key={`v-${i}`} 
                className="absolute top-0 bottom-0 border-l border-white border-opacity-30"
                style={{ left: `${(i + 1) * 33.33}%` }}
              />
            ))}
            {[...Array(2)].map((_, i) => (
              <div 
                key={`h-${i}`} 
                className="absolute left-0 right-0 border-t border-white border-opacity-30"
                style={{ top: `${(i + 1) * 33.33}%` }}
              />
            ))}
          </div>
          
          {/* Corner handles - LARGER FOR TOUCH */}
          <div 
            className="absolute w-8 h-8 bg-white rounded-full border-2 border-white shadow-lg"
            style={{ top: '-16px', left: '-16px', touchAction: 'none' }}
            onMouseDown={(e) => handleDragStart(e, 'nw')}
            onTouchStart={(e) => handleDragStart(e, 'nw')}
          />
          <div 
            className="absolute w-8 h-8 bg-white rounded-full border-2 border-white shadow-lg"
            style={{ top: '-16px', right: '-16px', touchAction: 'none' }}
            onMouseDown={(e) => handleDragStart(e, 'ne')}
            onTouchStart={(e) => handleDragStart(e, 'ne')}
          />
          <div 
            className="absolute w-8 h-8 bg-white rounded-full border-2 border-white shadow-lg"
            style={{ bottom: '-16px', left: '-16px', touchAction: 'none' }}
            onMouseDown={(e) => handleDragStart(e, 'sw')}
            onTouchStart={(e) => handleDragStart(e, 'sw')}
          />
          <div 
            className="absolute w-8 h-8 bg-white rounded-full border-2 border-white shadow-lg"
            style={{ bottom: '-16px', right: '-16px', touchAction: 'none' }}
            onMouseDown={(e) => handleDragStart(e, 'se')}
            onTouchStart={(e) => handleDragStart(e, 'se')}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="bg-black/80 p-4 space-y-4">
        {/* Aspect Ratios */}
        <div className="flex justify-center gap-2 flex-wrap">
          {printRatios.map((ratio) => (
            <button
              key={ratio.label}
              onClick={() => handleRatioSelect(ratio)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium min-w-[60px] transition-colors ${
                selectedRatio === ratio.label 
                  ? 'bg-white text-black' 
                  : 'bg-gray-700 text-white active:bg-gray-600 hover:bg-gray-600'
              }`}
            >
              {ratio.label}
            </button>
          ))}
        </div>

        {/* Rotation Button - BELOW RATIOS */}
        <div className="flex justify-center pt-1">
          <button
            onClick={rotateImage}
            className="flex flex-col items-center gap-1.5 text-white hover:text-blue-300 active:scale-95 transition-transform"
            aria-label="Rotate image 90 degrees"
          >
            <div className="w-12 h-12 flex items-center justify-center bg-gray-800 rounded-full">
              <RotateIcon className="w-6 h-6" />
            </div>
            <span className="text-xs font-medium">Rotate</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Cropper;