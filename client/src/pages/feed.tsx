import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Clock, TrendingUp, Eye, Search, Zap, RefreshCw, Mail, Users, ArrowRight, Image as ImageIcon, AlertCircle, CheckCircle, Star, ExternalLink } from "lucide-react";
import { useLocation } from "wouter";
import { ThemeController } from "@/components/theme-controller";
import { useTheme } from "@/hooks/use-theme";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useState, useEffect } from "react";
import { Header } from "@/components/header";

import chromeIcon from "@assets/Google_Chrome_Web_Store_icon_2015 (2)_1751671046716.png";

interface FeedArticle {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  publishedAt: string;
  readTime: number;
  sourceCount: number;
  heroImageUrl: string;
  authorName?: string;
  authorTitle?: string;
  keywords?: string[];
  importance_score?: number;
  image_source?: string;
}

interface ImageLoadState {
  [key: string]: {
    isLoading: boolean;
    hasError: boolean;
    attemptCount: number;
  };
}

// Enhanced Image Component with better error handling and backend integration
const EnhancedArticleImage: React.FC<{
  article: FeedArticle;
  onImageLoad?: () => void;
  onImageError?: () => void;
}> = ({ article, onImageLoad, onImageError }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState(article.heroImageUrl);
  const [fallbackAttempt, setFallbackAttempt] = useState(0);

  // Enhanced fallback images based on category and keywords
  const generateFallbackImages = () => {
    const category = article.category?.toLowerCase() || 'general';
    const keywords = article.keywords?.slice(0, 2).join(',') || 'news';
    
    const fallbacks = [
      // Original image
      article.heroImageUrl,
      
      // Category-specific high-quality images
      `https://source.unsplash.com/1200x800/?${encodeURIComponent(keywords)},${category}`,
      `https://source.unsplash.com/1200x800/?${category},news`,
      
      // Specific category fallbacks
      ...(getCategoryImages(category)),
      
      // Final fallbacks
      'https://source.unsplash.com/1200x800/?news,journalism',
      'https://source.unsplash.com/1200x800/?breaking,news',
      'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=1200&q=80'
    ].filter(Boolean);

    return Array.from(new Set(fallbacks));
  };

  const getCategoryImages = (category: string) => {
    const categoryMap: { [key: string]: string[] } = {
      'politics': [
        'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=1200&q=80',
        'https://images.unsplash.com/photo-1586892478025-2b5472316f22?w=1200&q=80'
      ],
      'technology': [
        'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=1200&q=80',
        'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=1200&q=80'
      ],
      'business': [
        'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&q=80',
        'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=1200&q=80'
      ],
      'health': [
        'https://images.unsplash.com/photo-1576091160399-112ba8d25d1f?w=1200&q=80',
        'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=1200&q=80'
      ],
      'environment': [
        'https://images.unsplash.com/photo-1569163139394-de4e5f43e4e3?w=1200&q=80',
        'https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=1200&q=80'
      ],
      'international': [
        'https://images.unsplash.com/photo-1526666923127-b2970f64b422?w=1200&q=80',
        'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&q=80'
      ]
    };

    return categoryMap[category] || [];
  };

  const handleImageError = () => {
    const fallbacks = generateFallbackImages();
    
    if (fallbackAttempt < fallbacks.length - 1) {
      const nextImage = fallbacks[fallbackAttempt + 1];
      setFallbackAttempt(prev => prev + 1);
      setCurrentImageUrl(nextImage);
      setIsLoading(true);
      setHasError(false);
    } else {
      setIsLoading(false);
      setHasError(true);
      onImageError?.();
    }
  };

  const handleImageLoad = () => {
    setIsLoading(false);
    setHasError(false);
    onImageLoad?.();
  };

  const getImageSourceBadge = () => {
    const source = article.image_source;
    if (!source || fallbackAttempt > 0) return null;

    const badges: { [key: string]: { label: string; color: string } } = {
      'enhanced_extraction': { label: 'News Source', color: 'bg-green-100 text-green-800' },
      'contextual_search': { label: 'API Search', color: 'bg-blue-100 text-blue-800' },
      'category_fallback': { label: 'Category', color: 'bg-purple-100 text-purple-800' },
      'fallback': { label: 'Stock', color: 'bg-gray-100 text-gray-800' }
    };

    const badge = badges[source];
    if (!badge) return null;

    return (
      <Badge variant="outline" className={`${badge.color} border-white/20 text-xs`}>
        {badge.label}
      </Badge>
    );
  };

  if (hasError && fallbackAttempt >= generateFallbackImages().length - 1) {
    return (
      <div className="relative overflow-hidden">
        <div className="w-full h-48 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium">Image unavailable</p>
          </div>
        </div>
        
        {/* Overlay content */}
        <div className="absolute inset-0 bg-black bg-opacity-40"></div>
        <div className="absolute top-4 left-4">
          <Badge variant="secondary" className="bg-blue-100 text-blue-800">
            {article.category}
          </Badge>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <p className="text-sm font-medium text-blue-300 mb-1 flex items-center">
            <Zap className="h-3 w-3 mr-1" />
            View research report:
          </p>
          <h3 className="text-xl font-semibold text-white mb-2 line-clamp-2">
            {article.title}
          </h3>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse flex items-center justify-center z-10">
          <div className="text-center text-gray-400">
            <ImageIcon className="h-8 w-8 mx-auto mb-2 animate-pulse" />
            <p className="text-xs">Loading image...</p>
          </div>
        </div>
      )}
      
      <img 
        src={currentImageUrl}
        alt={article.title}
        className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-200"
        loading="lazy"
        onLoad={handleImageLoad}
        onError={handleImageError}
        style={{ display: isLoading ? 'none' : 'block' }}
      />
      
      {/* Overlay content */}
      <div className="absolute inset-0 bg-black bg-opacity-40"></div>
      
      {/* Category badge */}
      <div className="absolute top-4 left-4">
        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
          {article.category}
        </Badge>
      </div>
      
      {/* Image source badge */}
      <div className="absolute top-4 right-4">
        {getImageSourceBadge()}
        {fallbackAttempt > 0 && (
          <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-white/20 text-xs ml-2">
            Fallback {fallbackAttempt}
          </Badge>
        )}
      </div>
      
      {/* Importance indicator */}
      {article.importance_score && article.importance_score > 7 && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2">
          <Badge variant="outline" className="bg-red-100 text-red-800 border-white/20 text-xs flex items-center">
            <Star className="h-3 w-3 mr-1" />
            High Priority
          </Badge>
        </div>
      )}
      
      {/* Headline overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-4">
        <p className="text-sm font-medium text-blue-300 mb-1 flex items-center">
          <Zap className="h-3 w-3 mr-1" />
          View research report:
        </p>
        <h3 className="text-xl font-semibold text-white mb-2 line-clamp-2 group-hover:text-blue-200 transition-colors duration-200">
          {article.title}
        </h3>
      </div>
    </div>
  );
};

export default function EnhancedFeedPage() {
  const queryClient = useQueryClient();
  
  // Enhanced API integration with better error handling
  const { data: articles, isLoading, error, refetch } = useQuery<FeedArticle[]>({
    queryKey: ['api/feed'],
    queryFn: async () => {
      const response = await apiRequest("GET", "api/feed", {});
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  const [showThemeController, setShowThemeController] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [, setLocation] = useLocation();
  const { currentTheme } = useTheme();
  const { toast } = useToast();
  const [useDummyMode, setUseDummyMode] = useState(false);
  const [imageStates, setImageStates] = useState<ImageLoadState>({});

  // Email signup state
  const [email, setEmail] = useState("");
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [showEmailSuccess, setShowEmailSuccess] = useState(false);

  // Check dummy mode
  useEffect(() => {
    const checkDummyMode = () => {
      const isDummy = localStorage.getItem('useDummyArticle') === 'true';
      setUseDummyMode(isDummy);
    };
    
    checkDummyMode();
    
    const handleStorageChange = () => checkDummyMode();
    window.addEventListener('storage', handleStorageChange);
    
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Enhanced topic refresh mutation
  const refreshTopicsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "api/force-generate-topics", {});
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${response.status}: ${errorText}`);
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['api/feed'] });
      toast({
        title: "Topics Refreshed",
        description: `Generated ${data.topics_count} new important news topics with enhanced images.`,
      });
    },
    onError: (error) => {
      console.error("Failed to refresh topics:", error);
      toast({
        title: "Refresh Failed",
        description: "Unable to generate new topics. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Image refresh mutation
  const refreshImagesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "api/refresh-images", {});
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${response.status}: ${errorText}`);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api/feed'] });
      toast({
        title: "Images Refreshed",
        description: "Article images have been updated with better quality sources.",
      });
    },
    onError: (error) => {
      console.error("Failed to refresh images:", error);
      toast({
        title: "Image Refresh Failed",
        description: "Unable to refresh images. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Enhanced research mutation
  const researchMutation = useMutation({
    mutationFn: async (query: string) => {
      try {
        const response = await apiRequest("POST", "api/research", { query });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`${response.status}: ${errorText}`);
        }
        
        return response.json();
      } catch (error) {
        console.error("API request failed:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      setLocation(`/article/${data.slug}`);
      toast({
        title: "Research Report Generated",
        description: "Your comprehensive research report with enhanced analysis is ready.",
      });
    },
    onError: (error) => {
      console.error("Research generation failed:", error);
      toast({
        title: "Research Failed",
        description: "Unable to generate research report. Please try again.",
        variant: "destructive",
      });
      setLocation('/');
    }
  });

  const handleSearch = () => {
    if (searchQuery.trim()) {
      localStorage.setItem('searchQuery', searchQuery);
      
      if (useDummyMode) {
        setLocation('/article/one-big-beautiful-bill-trump-2025');
        return;
      }
      
      setLocation('/research-loading');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleTopicResearch = (articleTitle: string, articleSlug?: string) => {
    localStorage.setItem('searchQuery', articleTitle);
    
    if (useDummyMode) {
      setLocation('/article/one-big-beautiful-bill-trump-2025');
      return;
    }
    
    if (articleSlug) {
      setLocation(`/article/${articleSlug}`);
      return;
    }
    
    setLocation('/research-loading');
  };

  const handleRefreshTopics = () => {
    refreshTopicsMutation.mutate();
  };

  const handleRefreshImages = () => {
    refreshImagesMutation.mutate();
  };

  const handleThemeToggle = () => {
    setShowThemeController(!showThemeController);
  };

  // Email signup handler
  const handleEmailSubmit = async () => {
    if (!email || !email.includes('@')) return;
    
    setIsSubmittingEmail(true);
    setTimeout(() => {
      setIsSubmittingEmail(false);
      setShowEmailSuccess(true);
      setEmail("");
      setTimeout(() => setShowEmailSuccess(false), 4000);
    }, 1000);
  };

  const handleEmailKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleEmailSubmit();
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="theme-header-bg shadow-sm relative">
          <div className="absolute bottom-0 left-0 right-0 h-0.5 theme-divider"></div>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between py-4 min-h-[80px] sm:min-h-[120px] lg:h-32">
              <div className="flex items-center space-x-2 sm:space-x-4">
                <Skeleton className="h-12 w-12 sm:h-16 sm:w-16 lg:h-24 lg:w-24" />
                <div>
                  <Skeleton className="h-6 w-32 sm:h-8 sm:w-40 lg:h-10 lg:w-48" />
                  <Skeleton className="h-4 w-24 sm:h-5 sm:w-32 mt-1" />
                </div>
              </div>
              
              <div className="flex items-center space-x-2 sm:space-x-4">
                <Skeleton className="h-6 w-12 sm:h-8 sm:w-16" />
                <Skeleton className="h-8 w-12 sm:h-10 sm:w-20" />
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex gap-8">
            <div className="flex-1 max-w-4xl">
              <div className="mb-8">
                <Skeleton className="h-10 w-64 mb-2" />
                <Skeleton className="h-6 w-96" />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[...Array(6)].map((_, index) => (
                  <Card key={index} className="shadow-card overflow-hidden">
                    <Skeleton className="h-48 w-full" />
                    <CardContent className="p-6">
                      <Skeleton className="h-6 w-full mb-2" />
                      <Skeleton className="h-4 w-3/4 mb-4" />
                      <div className="flex items-center space-x-4">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-4 w-16" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
            
            <div className="hidden lg:block w-80 flex-shrink-0">
              <div className="sticky top-24 space-y-4">
                <Skeleton className="w-full h-64 rounded-lg" />
                <Skeleton className="w-full h-12 rounded-lg" />
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen theme-page-bg">
      <Header 
        onThemeToggle={handleThemeToggle}
        onRefresh={handleRefreshTopics}
        isRefreshing={refreshTopicsMutation.isPending}
        showRefresh={true}
      />

      {/* Enhanced Email Signup Section */}
      <section className="bg-gray-50 border-b border-gray-200 py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-12">
            <div className="text-center lg:text-left flex-shrink-0">
              <p className="text-lg theme-header-text mb-1">
                First <span className="font-bold">100 users</span> to get free premium <span className="font-bold">for life.</span>
              </p>
              <p className="text-sm text-gray-600">Enhanced with AI-powered image extraction</p>
            </div>

            <div className="flex flex-col items-center">
              <h3 className="text-xl font-semibold theme-header-text mb-4 text-center">Sign-up for TIMIO</h3>
              
              {showEmailSuccess ? (
                <div className="flex items-center text-green-600 font-medium">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Successfully joined the waitlist!
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
                  <div className="relative flex-1">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="email"
                      placeholder="Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyPress={handleEmailKeyPress}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                  </div>
                  <Button
                    onClick={handleEmailSubmit}
                    disabled={isSubmittingEmail || !email}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                  >
                    {isSubmittingEmail ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Signing up...
                      </>
                    ) : (
                      'Sign-up'
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-8">
          <div className="flex-1 max-w-4xl">
            {/* Enhanced Research Input */}
            <div className="flex flex-col items-center space-y-4 sm:space-y-6 mb-8 sm:mb-12">
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold theme-research-prompt-text text-center px-4">
                Generate a report on any event
              </h2>
              <div className="relative w-full max-w-4xl px-4 sm:px-0">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl sm:rounded-2xl blur-sm opacity-20"></div>
                <div className="relative bg-white rounded-xl sm:rounded-2xl shadow-xl sm:shadow-2xl border-2 border-blue-200 hover:border-blue-400 transition-all duration-300 hover:shadow-3xl transform hover:-translate-y-1">
                  <Search className="absolute left-3 sm:left-6 top-1/2 transform -translate-y-1/2 h-4 w-4 sm:h-7 sm:w-7 text-blue-500" />
                  <Input
                    type="text"
                    placeholder="Enter a story to research..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={researchMutation.isPending}
                    className="w-full pl-10 sm:pl-16 pr-20 sm:pr-32 py-3 sm:py-6 text-base sm:text-xl bg-transparent border-0 focus:ring-0 focus:outline-none placeholder:text-gray-400 touch-manipulation disabled:opacity-50"
                  />
                  <div className="absolute right-1 sm:right-4 top-1/2 transform -translate-y-1/2">
                    <Button 
                      onClick={handleSearch}
                      disabled={researchMutation.isPending || !searchQuery.trim()}
                      className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 px-2 sm:px-6 py-1.5 sm:py-2 text-white font-semibold rounded-lg shadow-md text-xs sm:text-base disabled:opacity-50 touch-manipulation min-h-[36px] sm:min-h-[40px]"
                    >
                      {researchMutation.isPending ? (
                        <span className="hidden sm:inline">Researching...</span>
                      ) : (
                        <span className="hidden sm:inline">Research</span>
                      )}
                      {researchMutation.isPending ? (
                        <span className="sm:hidden">...</span>
                      ) : (
                        <span className="sm:hidden">Go</span>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Enhanced Page Header */}
            <div className="mb-6 sm:mb-8 px-4 sm:px-0">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold theme-header-text mb-2">
                    Today's Important News
                  </h1>
                  <p className="text-base sm:text-lg theme-tagline-text">
                    AI curated important stories with enhanced image extraction
                  </p>
                </div>
                <div className="hidden sm:flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={handleRefreshImages}
                    disabled={refreshImagesMutation.isPending}
                    className="flex items-center gap-2"
                  >
                    <ImageIcon className={`h-4 w-4 ${refreshImagesMutation.isPending ? 'animate-pulse' : ''}`} />
                    Images
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => refetch()}
                    disabled={isLoading}
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    Reload
                  </Button>
                </div>
              </div>
            </div>

            {/* Enhanced Error State */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-red-800 font-medium flex items-center">
                      <AlertCircle className="h-4 w-4 mr-2" />
                      Unable to load news topics
                    </h3>
                    <p className="text-red-600 text-sm mt-1">
                      There was an issue connecting to the enhanced news service. Please try again.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetch()}
                    className="text-red-600 border-red-200 hover:bg-red-50"
                  >
                    Retry
                  </Button>
                </div>
              </div>
            )}

            {/* Enhanced Articles Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 px-4 sm:px-0">
              {articles?.map((article) => (
                <Card 
                  key={article.id} 
                  className="theme-article-card-bg theme-article-card-border theme-article-card-hover border-2 shadow-card hover:shadow-card-hover transition-all duration-200 cursor-pointer group overflow-hidden h-full"
                  onClick={() => handleTopicResearch(article.title, article.slug)}
                >
                  <EnhancedArticleImage 
                    article={article}
                    onImageLoad={() => {
                      setImageStates(prev => ({
                        ...prev,
                        [article.id]: { ...prev[article.id], isLoading: false }
                      }));
                    }}
                    onImageError={() => {
                      setImageStates(prev => ({
                        ...prev,
                        [article.id]: { ...prev[article.id], hasError: true }
                      }));
                    }}
                  />

                  <CardContent className="p-4 flex flex-col flex-grow">
                    <p className="theme-body-text mb-4 line-clamp-3 flex-grow">
                      {article.excerpt}
                    </p>
                    
                    <div className="flex items-center justify-between text-sm text-muted mt-auto">
                      <div className="flex items-center space-x-4">
                        <span className="flex items-center">
                          <Clock className="h-4 w-4 mr-1" />
                          {new Date(article.publishedAt).toLocaleDateString()}
                        </span>
                        <span className="flex items-center">
                          <TrendingUp className="h-4 w-4 mr-1" />
                          {article.sourceCount} sources
                        </span>
                        <span className="flex items-center">
                          <Eye className="h-4 w-4 mr-1" />
                          {article.readTime} min
                        </span>
                      </div>
                      
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-xs">
                        <span className="text-blue-600 font-medium">View Report</span>
                      </div>
                    </div>

                    {/* Enhanced metadata display */}
                    {(article.keywords || article.importance_score) && (
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                        <div className="flex flex-wrap gap-1">
                          {article.keywords?.slice(0, 3).map((keyword, index) => (
                            <Badge 
                              key={index} 
                              variant="outline" 
                              className="text-xs px-2 py-0.5 bg-gray-50 text-gray-600 border-gray-200"
                            >
                              {keyword}
                            </Badge>
                          ))}
                        </div>
                        
                        {article.importance_score && article.importance_score > 5 && (
                          <div className="flex items-center text-xs text-orange-600">
                            <Star className="h-3 w-3 mr-1" />
                            {article.importance_score}/10
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Enhanced Empty State */}
            {articles && articles.length === 0 && (
              <div className="text-center py-12">
                <div className="text-gray-400 mb-4">
                  <TrendingUp className="h-16 w-16 mx-auto" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No important news topics found</h3>
                <p className="text-gray-600 mb-4">
                  Our enhanced AI is currently generating fresh important news topics with improved image extraction.
                </p>
                <div className="flex justify-center gap-3">
                  <Button
                    onClick={handleRefreshTopics}
                    disabled={refreshTopicsMutation.isPending}
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshTopicsMutation.isPending ? 'animate-spin' : ''}`} />
                    {refreshTopicsMutation.isPending ? 'Generating...' : 'Generate Topics'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleRefreshImages}
                    disabled={refreshImagesMutation.isPending}
                    className="flex items-center gap-2"
                  >
                    <ImageIcon className={`h-4 w-4 ${refreshImagesMutation.isPending ? 'animate-pulse' : ''}`} />
                    Refresh Images
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Enhanced Right sidebar */}
          <div className="hidden lg:block w-80 flex-shrink-0">
            <div className="sticky top-24 space-y-4 theme-sidebar-bg theme-sidebar-border border p-4 rounded-lg">
              {/* API Status Indicator */}
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="text-sm font-semibold text-blue-800 mb-2 flex items-center">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Enhanced Features Active
                </h4>
                <ul className="text-xs text-blue-600 space-y-1">
                  <li>• Multi-API image extraction</li>
                  <li>• Quality scoring system</li>
                  <li>• Smart category fallbacks</li>
                  <li>• Importance ranking</li>
                </ul>
              </div>

              {/* Image refresh controls */}
              <div className="mb-4">
                <Button
                  onClick={handleRefreshImages}
                  disabled={refreshImagesMutation.isPending}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-4 rounded-lg text-sm flex items-center justify-center gap-2"
                >
                  {refreshImagesMutation.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Refreshing Images...
                    </>
                  ) : (
                    <>
                      <ImageIcon className="h-4 w-4" />
                      Refresh All Images
                    </>
                  )}
                </Button>
              </div>

              <img 
                src="/asseen-on.png" 
                alt="As seen on PBS and Automateed" 
                className="w-full h-auto rounded-lg shadow-lg"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />

              <a 
                href="https://timio.news" 
                target="_blank" 
                rel="noopener noreferrer"
                className="block w-full bg-black hover:bg-gray-800 text-white font-semibold py-4 px-8 rounded-lg text-left transition-colors duration-200 text-2xl flex items-center"
              >
                <ExternalLink className="h-5 w-5 mr-3" />
                Learn more about TIMIO News
              </a>
              
              <a 
                href="https://chromewebstore.google.com/detail/timio-chrome-early-access/mkldmejplmgbjobhddcbilhfpcoholjh" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center w-full bg-black hover:bg-gray-800 text-white font-semibold py-3 px-6 rounded-lg text-left transition-colors duration-200 text-lg"
              >
                <img 
                  src={chromeIcon} 
                  alt="Chrome Web Store" 
                  className="w-6 h-6 mr-3"
                />
                Try the TIMIO Chrome Extension
              </a>

              {/* Enhanced info about image sources */}
              <div className="mt-6 p-3 bg-green-50 border border-green-200 rounded-lg">
                <h4 className="text-sm font-semibold text-green-800 mb-2">Enhanced Image Quality</h4>
                <p className="text-xs text-green-600 mb-2">
                  Article images are sourced using advanced extraction from news APIs, Brave Search, and Unsplash with smart quality scoring.
                </p>
                <div className="text-xs text-green-600">
                  <strong>Sources:</strong> News sites, Brave API, Unsplash, Category-specific
                </div>
              </div>

              {/* Debug info for development */}
              {process.env.NODE_ENV === 'development' && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <h4 className="text-sm font-semibold text-yellow-800 mb-2">Debug Info</h4>
                  <div className="text-xs text-yellow-600 space-y-1">
                    <div>Articles loaded: {articles?.length || 0}</div>
                    <div>Image errors: {Object.values(imageStates).filter(s => s.hasError).length}</div>
                    <div>Enhanced features: Active</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      
      {/* Theme Controller */}
      {showThemeController && <ThemeController onClose={() => setShowThemeController(false)} />}
    </div>
  );
}