import { Button } from "@/components/ui/button";
import { Settings, RefreshCw } from "lucide-react";
import { useLocation } from "wouter";
import timioLogo from "@assets/App Icon_1751662407764.png";

interface HeaderProps {
  onThemeToggle: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  showRefresh?: boolean;
}

export function Header({ onThemeToggle, onRefresh, isRefreshing = false, showRefresh = false }: HeaderProps) {
  const [, setLocation] = useLocation();

  const handleLogoClick = () => {
    setLocation('/');
  };

  return (
    <header className="theme-header-bg shadow-sm relative">
      <div className="absolute bottom-0 left-0 right-0 h-0.5 theme-divider"></div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-4 min-h-[80px] sm:min-h-[120px] lg:h-32">
          {/* Logo and Title - Clickable */}
          <div 
            className="flex items-center space-x-2 sm:space-x-4 cursor-pointer hover:opacity-80 transition-opacity duration-200"
            onClick={handleLogoClick}
          >
            <img 
              src={timioLogo} 
              alt="TIMIO Logo" 
              className="w-12 h-12 sm:w-16 sm:h-16 lg:w-24 lg:h-24"
            />
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-bold theme-header-text">TIMIO News</h1>
              <p className="text-sm sm:text-base lg:text-lg theme-tagline-text">Truth. Trust. Transparency.</p>
            </div>
          </div>
          
          {/* Header Actions */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            {/* Legal Links - Hidden on mobile for space */}
            <div className="hidden lg:flex items-center space-x-4 mr-4">
              <a 
                href="https://timio.news/privacy" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm theme-tagline-text hover:theme-header-text transition-colors duration-200"
              >
                Privacy Policy
              </a>
              <a 
                href="https://timio.news/terms-of-service/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm theme-tagline-text hover:theme-header-text transition-colors duration-200"
              >
                Terms of Service
              </a>
            </div>

            {/* Refresh Button (if enabled) */}
            {showRefresh && onRefresh && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4 min-h-[32px] sm:min-h-[36px] touch-manipulation"
              >
                <RefreshCw className={`h-3 w-3 sm:h-4 sm:w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            )}

            {/* Theme Toggle Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={onThemeToggle}
              className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4 min-h-[32px] sm:min-h-[36px] touch-manipulation"
            >
              <Settings className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Theme</span>
            </Button>
          </div>
        </div>

        {/* Mobile Legal Links */}
        <div className="lg:hidden pb-4 flex items-center justify-center space-x-6">
          <a 
            href="https://timio.news/privacy" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-xs theme-tagline-text hover:theme-header-text transition-colors duration-200"
          >
            Privacy Policy
          </a>
          <a 
            href="https://timio.news/terms-of-service/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-xs theme-tagline-text hover:theme-header-text transition-colors duration-200"
          >
            Terms of Service
          </a>
        </div>
      </div>
    </header>
  );
}