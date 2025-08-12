import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Mail, Users, Star, ArrowRight, RefreshCw, Sparkles } from "lucide-react";

interface EmailSignupSectionProps {
  className?: string;
}

export function EmailSignupSection({ className = "" }: EmailSignupSectionProps) {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleEmailSubmit = async () => {
    if (!email) return;
    
    setIsSubmitting(true);
    // Simulate API call - replace with actual submission logic
    setTimeout(() => {
      setIsSubmitting(false);
      setShowSuccess(true);
      setEmail("");
      setTimeout(() => setShowSuccess(false), 4000);
    }, 1000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleEmailSubmit();
    }
  };

  return (
    <section className={`theme-header-bg border-b theme-divider ${className}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <div className="max-w-4xl mx-auto">
          {/* Main Content */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <div className="flex items-center space-x-2">
                <Sparkles className="h-6 w-6 theme-header-text opacity-70" />
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold theme-header-text">
                  Join the Future of News
                </h2>
                <Sparkles className="h-6 w-6 theme-header-text opacity-70" />
              </div>
            </div>
            
            <p className="text-lg sm:text-xl theme-tagline-text mb-6 max-w-2xl mx-auto leading-relaxed">
              Be among the first to experience truly transparent journalism. 
              <span className="font-semibold theme-header-text"> First 100 users get lifetime premium access.</span>
            </p>

            {/* Premium Badge */}
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 mb-8">
              <Star className="h-4 w-4 text-amber-500 fill-current mr-2" />
              <span className="text-sm font-medium text-amber-700">
                Limited Time: Premium for Life
              </span>
              <Star className="h-4 w-4 text-amber-500 fill-current ml-2" />
            </div>
          </div>

          {/* Signup Form */}
          <div className="max-w-md mx-auto">
            {showSuccess ? (
              <div className="text-center py-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                    <ArrowRight className="h-4 w-4 text-white transform rotate-45" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold theme-header-text mb-2">Welcome to TIMIO!</h3>
                <p className="theme-tagline-text">
                  You're now on the waitlist. We'll notify you when we launch.
                </p>
              </div>
            ) : (
              <div className="bg-white/50 backdrop-blur-sm rounded-2xl border border-gray-200/50 shadow-lg p-6 sm:p-8">
                <div className="space-y-4">
                  {/* Email Input */}
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="email"
                      placeholder="Enter your email address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyPress={handleKeyPress}
                      className="w-full pl-12 pr-4 py-4 text-base border border-gray-300 rounded-xl bg-white/80 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-500"
                    />
                  </div>

                  {/* Submit Button */}
                  <Button
                    onClick={handleEmailSubmit}
                    disabled={isSubmitting || !email}
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="h-5 w-5 animate-spin" />
                        Joining Waitlist...
                      </>
                    ) : (
                      <>
                        Join the Waitlist
                        <ArrowRight className="h-5 w-5" />
                      </>
                    )}
                  </Button>
                </div>

                {/* Social Proof & Features */}
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <div className="flex items-center justify-center text-sm theme-tagline-text mb-4">
                    <Users className="h-4 w-4 mr-2" />
                    <span>Join 1,247+ journalists and readers</span>
                  </div>
                  
                  {/* Feature List */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center theme-tagline-text">
                      <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                      <span>Ad-free reading</span>
                    </div>
                    <div className="flex items-center theme-tagline-text">
                      <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                      <span>Source transparency</span>
                    </div>
                    <div className="flex items-center theme-tagline-text">
                      <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                      <span>Early access to features</span>
                    </div>
                    <div className="flex items-center theme-tagline-text">
                      <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                      <span>Premium content</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Trust Indicators */}
          <div className="mt-8 text-center">
            <p className="text-xs theme-tagline-text mb-4">
              Trusted by readers worldwide • No spam, unsubscribe anytime
            </p>
            
            {/* Social Proof Logos or Badges */}
            <div className="flex items-center justify-center space-x-6 opacity-60">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold text-blue-600">PBS</span>
                </div>
                <span className="text-xs theme-tagline-text">As seen on</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Updated Header Component (cleaned up version)
export function Header({ onThemeToggle, onRefresh, isRefreshing = false, showRefresh = false }) {
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
        <div className="lg:hidden pb-4">
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
    </header>
  );
}