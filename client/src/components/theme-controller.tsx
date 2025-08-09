import { useState, useRef, useEffect } from 'react';
import { useTheme } from '@/hooks/use-theme';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { DraggableColorPicker } from '@/components/ui/draggable-color-picker';
import { Palette, RotateCcw, Move, X } from 'lucide-react';
import { ThemeConfig, defaultTheme, darkTheme, blueTheme, navyTheme, ThemeManager } from '@/lib/theme';

interface ThemeControllerProps {
  onClose?: () => void;
}

export function ThemeController({ onClose }: ThemeControllerProps = {}) {
  const { currentTheme, setTheme } = useTheme();
  const [workingTheme, setWorkingTheme] = useState<ThemeConfig>(currentTheme);
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [useDummyArticle, setUseDummyArticle] = useState(() => {
    const stored = localStorage.getItem('useDummyArticle');
    return stored ? stored === 'true' : false; // Default to false
  });
  const cardRef = useRef<HTMLDivElement>(null);

  const handleColorChange = (property: keyof ThemeConfig, value: string) => {
    const newTheme = { ...workingTheme, [property]: value };
    setWorkingTheme(newTheme);
    setTheme(newTheme);
  };

  const resetToDefault = () => {
    setWorkingTheme(defaultTheme);
    setTheme(defaultTheme);
  };

  const handleDummyArticleToggle = (checked: boolean) => {
    setUseDummyArticle(checked);
    localStorage.setItem('useDummyArticle', checked.toString());
    
    // Trigger a storage event to notify other components
    window.dispatchEvent(new Event('storage'));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.drag-handle')) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      const cardWidth = window.innerWidth < 768 ? window.innerWidth - 20 : 600;
      const newX = Math.max(0, Math.min(window.innerWidth - cardWidth, e.clientX - dragStart.x));
      const newY = Math.max(0, Math.min(window.innerHeight - 400, e.clientY - dragStart.y));
      setPosition({ x: newX, y: newY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragStart]);

  // Center the modal initially
  useEffect(() => {
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      setPosition({
        x: (window.innerWidth - rect.width) / 2,
        y: (window.innerHeight - rect.height) / 2
      });
    }
  }, []);

  const ColorInput = ({ 
    label, 
    property, 
    value 
  }: { 
    label: string; 
    property: keyof ThemeConfig; 
    value: string; 
  }) => (
    <DraggableColorPicker
      label={label}
      value={value}
      onChange={(color) => handleColorChange(property, color)}
    />
  );

  return (
    <Card 
      ref={cardRef}
      className="w-[calc(100vw-20px)] md:w-[600px] shadow-xl bg-white max-h-[80vh] md:max-h-[600px] overflow-hidden select-none mx-2 md:mx-0"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 1000,
        cursor: isDragging ? 'grabbing' : 'default'
      }}
      onMouseDown={handleMouseDown}
    >
      <CardHeader className="pb-3 drag-handle cursor-grab active:cursor-grabbing px-3 md:px-6">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg md:text-xl flex items-center gap-1 md:gap-2 pointer-events-none">
            <Move className="h-4 w-4 md:h-5 md:w-5 text-gray-400" />
            <Palette className="h-5 w-5 md:h-6 md:w-6" />
            <span className="hidden sm:inline">Custom Colors</span>
            <span className="sm:hidden">Theme</span>
          </CardTitle>
          <div className="flex items-center gap-1 md:gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={resetToDefault}
              className="flex items-center gap-1 md:gap-2 pointer-events-auto text-xs md:text-sm px-2 md:px-3"
            >
              <RotateCcw className="h-3 w-3 md:h-4 md:w-4" />
              <span className="hidden sm:inline">Reset</span>
            </Button>
            {onClose && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={onClose}
                className="pointer-events-auto p-1 md:p-2"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <div className="max-h-[calc(80vh-120px)] md:max-h-[500px] overflow-y-auto">
        <CardContent className="space-y-4 px-3 md:px-6">
        
        {/* Preset Themes */}
        <div className="space-y-3 pb-4 border-b border-gray-200">
          <h3 className="font-medium text-sm text-gray-700">Preset Themes</h3>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                ThemeManager.useDefaultTheme();
                setWorkingTheme(defaultTheme);
              }}
              className="text-xs"
            >
              Default Light
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                ThemeManager.useDarkTheme();
                setWorkingTheme(darkTheme);
              }}
              className="text-xs"
            >
              Dark
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                ThemeManager.useBlueTheme();
                setWorkingTheme(blueTheme);
              }}
              className="text-xs"
            >
              Blue
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                ThemeManager.useNavyTheme();
                setWorkingTheme(navyTheme);
              }}
              className="text-xs"
            >
              Navy
            </Button>
          </div>
        </div>

        {/* Dummy Article Toggle */}
        <div className="space-y-3 pb-4 border-b border-gray-200">
          <h3 className="font-medium text-sm text-gray-700">Article Settings</h3>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="dummy-article-toggle" className="text-sm font-medium">
                Use Dummy Article
              </Label>
              <p className="text-xs text-gray-500">
                Show original "Big Beautiful Bill" content instead of AI-generated research
              </p>
            </div>
            <Switch
              id="dummy-article-toggle"
              checked={useDummyArticle}
              onCheckedChange={handleDummyArticleToggle}
            />
          </div>
        </div>

        {/* Color Settings in Grid Layout */}
        <div className="grid grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-4">
            <div className="space-y-3">
              <h3 className="font-medium text-sm text-gray-700">Page & Layout</h3>
              <ColorInput 
                label="Page Background" 
                property="pageBackground" 
                value={workingTheme.pageBackground} 
              />
              <ColorInput 
                label="Divider Color" 
                property="dividerColor" 
                value={workingTheme.dividerColor} 
              />
              <ColorInput 
                label="Icon Background" 
                property="iconBackground" 
                value={workingTheme.iconBackground} 
              />
            </div>

            <div className="space-y-3">
              <h3 className="font-medium text-sm text-gray-700">Cards</h3>
              <ColorInput 
                label="Report Card Background" 
                property="reportCardBackground" 
                value={workingTheme.reportCardBackground} 
              />
              <ColorInput 
                label="Report Card Border" 
                property="reportCardBorder" 
                value={workingTheme.reportCardBorder} 
              />
              <ColorInput 
                label="Article Card Background" 
                property="articleCardBackground" 
                value={workingTheme.articleCardBackground} 
              />
              <ColorInput 
                label="Article Card Border" 
                property="articleCardBorder" 
                value={workingTheme.articleCardBorder} 
              />
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            <div className="space-y-3">
              <h3 className="font-medium text-sm text-gray-700">Borders</h3>
              <ColorInput 
                label="Border Color" 
                property="borderColor" 
                value={workingTheme.borderColor} 
              />
              <ColorInput 
                label="Focus Border" 
                property="borderFocusColor" 
                value={workingTheme.borderFocusColor} 
              />
            </div>

            <div className="space-y-3">
              <h3 className="font-medium text-sm text-gray-700">Header & Sidebar</h3>
              <ColorInput 
                label="Header Background" 
                property="headerBackground" 
                value={workingTheme.headerBackground} 
              />
              <ColorInput 
                label="Sidebar Background" 
                property="sidebarBackground" 
                value={workingTheme.sidebarBackground} 
              />
              <ColorInput 
                label="Sidebar Text" 
                property="sidebarTextColor" 
                value={workingTheme.sidebarTextColor} 
              />
              <ColorInput 
                label="Sidebar Border" 
                property="sidebarBorderColor" 
                value={workingTheme.sidebarBorderColor} 
              />
            </div>

            <div className="space-y-3">
              <h3 className="font-medium text-sm text-gray-700">Text Colors</h3>
              <ColorInput 
                label="Header Text" 
                property="headerTextColor" 
                value={workingTheme.headerTextColor} 
              />
              <ColorInput 
                label="Headline Text" 
                property="headlineTextColor" 
                value={workingTheme.headlineTextColor} 
              />
              <ColorInput 
                label="Body Text" 
                property="bodyTextColor" 
                value={workingTheme.bodyTextColor} 
              />
              <ColorInput 
                label="Muted Text" 
                property="mutedTextColor" 
                value={workingTheme.mutedTextColor} 
              />
              <ColorInput 
                label="Research Prompt Text" 
                property="researchPromptTextColor" 
                value={workingTheme.researchPromptTextColor} 
              />
              <ColorInput 
                label="Research Report Label" 
                property="researchReportLabelColor" 
                value={workingTheme.researchReportLabelColor} 
              />
              <ColorInput 
                label="Tagline Text" 
                property="taglineTextColor" 
                value={workingTheme.taglineTextColor} 
              />
            </div>
          </div>
        </div>
        </CardContent>
      </div>
    </Card>
  );
}

// Development-only theme controller (shows only in development)
export function DevThemeController() {
  if (import.meta.env.PROD) {
    return null;
  }
  
  return <ThemeController />;
}