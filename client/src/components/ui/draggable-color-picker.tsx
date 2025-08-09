import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';

interface DraggableColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label: string;
}

export function DraggableColorPicker({ value, onChange, label }: DraggableColorPickerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const presetColors = [
    { name: 'White', value: '#ffffff' },
    { name: 'Black', value: '#000000' },
    { name: 'Navy', value: '#162043' },
    { name: 'Transparent', value: 'transparent' },
  ];

  useEffect(() => {
    if (showPicker && canvasRef.current) {
      drawColorSpectrum();
    }
  }, [showPicker]);

  const drawColorSpectrum = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Create horizontal gradient (hue)
    const hueGradient = ctx.createLinearGradient(0, 0, width, 0);
    hueGradient.addColorStop(0, '#ff0000');
    hueGradient.addColorStop(1/6, '#ffff00');
    hueGradient.addColorStop(2/6, '#00ff00');
    hueGradient.addColorStop(3/6, '#00ffff');
    hueGradient.addColorStop(4/6, '#0000ff');
    hueGradient.addColorStop(5/6, '#ff00ff');
    hueGradient.addColorStop(1, '#ff0000');

    ctx.fillStyle = hueGradient;
    ctx.fillRect(0, 0, width, height);

    // Create vertical gradient (saturation/brightness)
    const saturationGradient = ctx.createLinearGradient(0, 0, 0, height);
    saturationGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    saturationGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
    saturationGradient.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
    saturationGradient.addColorStop(1, 'rgba(0, 0, 0, 1)');

    ctx.fillStyle = saturationGradient;
    ctx.fillRect(0, 0, width, height);
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    updateColorFromPosition(e);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      updateColorFromPosition(e);
    }
  };

  const handleCanvasMouseUp = () => {
    setIsDragging(false);
  };

  const updateColorFromPosition = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageData = ctx.getImageData(x, y, 1, 1);
    const r = imageData.data[0];
    const g = imageData.data[1];
    const b = imageData.data[2];
    
    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    onChange(hex);
  };

  const getCurrentColor = () => {
    if (value.includes('rgb')) {
      const match = value.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        const r = parseInt(match[1]);
        const g = parseInt(match[2]);
        const b = parseInt(match[3]);
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      }
    }
    return value;
  };

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium block">{label}</label>
      
      {/* Color Preview and Toggle */}
      <div className="flex gap-2 items-center">
        <div
          className="w-12 h-8 border-2 border-gray-300 rounded cursor-pointer"
          style={{ backgroundColor: getCurrentColor() }}
          onClick={() => setShowPicker(!showPicker)}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowPicker(!showPicker)}
          className="text-xs"
        >
          {showPicker ? 'Close' : 'Pick Color'}
        </Button>
      </div>

      {/* Draggable Color Picker */}
      {showPicker && (
        <div 
          ref={pickerRef}
          className="relative bg-white border border-gray-300 rounded-lg p-4 shadow-lg"
        >
          {/* Preset Colors */}
          <div className="mb-3">
            <div className="text-xs font-medium text-gray-600 mb-2">Quick Colors:</div>
            <div className="flex gap-2">
              {presetColors.map((preset) => (
                <button
                  key={preset.value}
                  className={`w-8 h-8 rounded border-2 border-gray-300 hover:border-gray-400 transition-colors ${
                    preset.value === 'transparent' ? 'bg-transparent bg-checkerboard' : ''
                  }`}
                  style={{ 
                    backgroundColor: preset.value === 'transparent' ? 'transparent' : preset.value,
                    backgroundImage: preset.value === 'transparent' 
                      ? 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)'
                      : undefined,
                    backgroundSize: preset.value === 'transparent' ? '8px 8px' : undefined,
                    backgroundPosition: preset.value === 'transparent' ? '0 0, 0 4px, 4px -4px, -4px 0px' : undefined
                  }}
                  onClick={() => onChange(preset.value)}
                  title={preset.name}
                />
              ))}
            </div>
          </div>

          <canvas
            ref={canvasRef}
            width={200}
            height={150}
            className="border border-gray-200 cursor-crosshair"
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
          />

          {/* Current Color Display */}
          <div className="mt-3 text-xs font-mono text-gray-600">
            Current: {getCurrentColor()}
          </div>
        </div>
      )}
    </div>
  );
}