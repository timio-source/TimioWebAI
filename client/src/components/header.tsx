import { Button } from "@/components/ui/button";
import { Settings, RefreshCw, Mail, Users, Star, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import timioLogo from "@assets/App Icon_1751662407764.png";

interface HeaderProps {
  onThemeToggle: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  showRefresh?: boolean;
}

export function Header({ onThemeToggle, onRefresh, isRefreshing = false, showRefresh = false }: HeaderProps) {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleLogoClick = () => {
    setLocation('/');
  };

  const handleEmailSubmit = async () => {
    if (!email) return;
    
    setIsSubmitting(true);
    // Simulate API call - replace with actual submission logic
    setTimeout(() => {
      setIsSubmitting(false);
      setShowSuccess(true);
      setEmail("");
      setTimeout(() => setShowSuccess(false), 3000);
    }, 1000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleEmailSubmit();
    }
  };

  // Load the waitlist script when component mounts
  useEffect(() => {
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://eocampaign1.com/form/0d3b352c-5893-11f0-91b6-a1c5ee19d5ba.js';
    script.setAttribute('data-form', '0d3b352c-5893-11f0-91b6-a1c5ee19d5ba');
    
    // Keep original script functionality but hide it since we're replacing with custom design
    const waitlistContainer = document.querySelector('.waitlist-container-hidden');
    if (waitlistContainer) {
      waitlistContainer.appendChild(script);
    }

    return () => {
      if (waitlistContainer && waitlistContainer.contains(script)) {
        waitlistContainer.removeChild(script);
      }
    };
  }, []);

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

          {/* Enhanced Email Signup Section - Desktop */}
          <div className="hidden md:flex items-center">
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-6 shadow-xl border border-white/20 backdrop-blur-sm">
              <div className="text-center mb-4">
                <div className="flex items-center justify-center mb-2">
                  <div className="bg-white/20 rounded-full p-2 mr-2">
                    <Star className="h-5 w-5 text-yellow-300 fill-current" />
                  </div>
                  <h3 className="text-white font-bold text-lg">Join TIMIO</h3>
                </div>
                <p className="text-blue-100 text-sm font-medium">
                  First <span className="font-bold text-yellow-300">100 users</span> get free premium 
                  <span className="font-bold text-white"> for life!</span>
                </p>
              </div>
              
              {showSuccess ? (
                <div className="flex items-center justify-center py-3 px-4 bg-green-500 rounded-lg">
                  <div className="flex items-center text-white font-semibold">
                    <div className="w-2 h-2 bg-green-300 rounded-full mr-2 animate-pulse"></div>
                    Successfully joined the waitlist!
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyPress={handleKeyPress}
                      className="w-full pl-10 pr-4 py-3 rounded-lg border-0 bg-white/95 text-gray-800 placeholder-gray-500 font-medium focus:outline-none focus:ring-2 focus:ring-white/50 transition-all duration-200"
                    />
                  </div>
                  <Button
                    onClick={handleEmailSubmit}
                    disabled={isSubmitting || !email}
                    className="bg-white text-blue-600 hover:bg-blue-50 font-bold px-6 py-3 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Joining...
                      </>
                    ) : (
                      <>
                        Sign Up
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              )}
              
              <div className="flex items-center justify-center mt-3 text-blue-100 text-xs">
                <Users className="h-3 w-3 mr-1" />
                <span>Join 1,247+ users already signed up</span>
              </div>
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

        {/* Mobile Section - Enhanced Email Signup + Legal Links */}
        <div className="md:hidden pb-4">
          {/* Mobile Email Signup */}
          <div className="mb-4">
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-4 shadow-lg mx-2">
              <div className="text-center mb-3">
                <div className="flex items-center justify-center mb-1">
                  <Star className="h-4 w-4 text-yellow-300 fill-current mr-1" />
                  <h3 className="text-white font-bold text-base">Join TIMIO</h3>
                </div>
                <p className="text-blue-100 text-xs">
                  First <span className="font-bold text-yellow-300">100 users</span> get 
                  <span className="font-bold text-white"> free premium for life!</span>
                </p>
              </div>
              
              {showSuccess ? (
                <div className="flex items-center justify-center py-2 px-3 bg-green-500 rounded-lg">
                  <div className="flex items-center text-white font-semibold text-sm">
                    <div className="w-2 h-2 bg-green-300 rounded-full mr-2 animate-pulse"></div>
                    Joined waitlist!
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyPress={handleKeyPress}
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg border-0 bg-white/95 text-gray-800 placeholder-gray-500 font-medium focus:outline-none focus:ring-2 focus:ring-white/50 text-sm"
                    />
                  </div>
                  <Button
                    onClick={handleEmailSubmit}
                    disabled={isSubmitting || !email}
                    className="w-full bg-white text-blue-600 hover:bg-blue-50 font-bold py-2.5 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Joining...
                      </>
                    ) : (
                      <>
                        Sign Up Free
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              )}
              
              <div className="flex items-center justify-center mt-2 text-blue-100 text-xs">
                <Users className="h-3 w-3 mr-1" />
                <span>1,247+ users signed up</span>
              </div>
            </div>
          </div>
          
          {/* Mobile Legal Links */}
          <div className="flex items-center justify-center space-x-6">
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
      </div>
      
      {/* Hidden container for original script */}
      <div className="waitlist-container-hidden" style={{display: 'none'}}></div>
    </header>
  );
}