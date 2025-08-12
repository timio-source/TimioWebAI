import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Clock, TrendingUp, Eye, Search, Zap, RefreshCw, Mail, Users, ArrowRight } from "lucide-react";
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
}

export default function FeedPage() {
  const queryClient = useQueryClient();
  
  // Fetch articles with better error handling and retry logic
  const { data: articles, isLoading, error, refetch } = useQuery<FeedArticle[]>({
    queryKey: ['api/feed'],
    retry: 2,
    retryDelay: 1000,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  const [showThemeController, setShowThemeController] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [, setLocation] = useLocation();
  const { currentTheme } = useTheme();
  const { toast } = useToast();
  const [useDummyMode, setUseDummyMode] = useState(false);

  // Email signup state
  const [email, setEmail] = useState("");
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [showEmailSuccess, setShowEmailSuccess] = useState(false);

  // Check dummy mode on component mount and when localStorage changes
  useEffect(() => {
    const checkDummyMode = () => {
      const isDummy = localStorage.getItem('useDummyArticle') === 'true';
      setUseDummyMode(isDummy);
    };
    
    checkDummyMode();
    
    // Listen for localStorage changes
    const handleStorageChange = () => checkDummyMode();
    window.addEventListener('storage', handleStorageChange);
    
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Manual refresh mutation for generating new topics
  const refreshTopicsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "api/force-generate-topics", {});
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${response.status}: ${errorText}`);
      }
      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch the feed
      queryClient.invalidateQueries({ queryKey: ['api/feed'] });
      toast({
        title: "Topics Refreshed",
        description: "New important news topics have been generated.",
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

  // Research mutation with improved error handling
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
      // Navigate to the research loading page with the query
      setLocation('/research-loading');
      toast({
        title: "Research Started",
        description: "Generating your comprehensive research report...",
      });
    },
    onError: (error) => {
      console.error("Research generation failed:", error);
      toast({
        title: "Research Failed",
        description: "Unable to start research. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleSearch = () => {
    if (searchQuery.trim()) {
      // Save search query to localStorage for persistence
      localStorage.setItem('searchQuery', searchQuery);
      
      if (useDummyMode) {
        // If dummy mode is enabled, navigate directly to the dummy article
        setLocation('/article/one-big-beautiful-bill-trump-2025');
        return;
      }
      
      // Trigger the research mutation
      researchMutation.mutate(searchQuery.trim());
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleTopicResearch = (articleTitle: string) => {
    // Save the article title as the search query
    localStorage.setItem('searchQuery', articleTitle);
    
    if (useDummyMode) {
      // If dummy mode is enabled, navigate directly to the dummy article
      setLocation('/article/one-big-beautiful-bill-trump-2025');
      return;
    }
    
    // Navigate to research loading page which will handle the research
    setLocation('/research-loading');
  };

  const handleRefreshTopics = () => {
    refreshTopicsMutation.mutate();
  };

  const handleThemeToggle = () => {
    setShowThemeController(!showThemeController);
  };

  // Email signup handler
  const handleEmailSubmit = async () => {
    if (!email || !email.includes('@')) return;
    
    setIsSubmittingEmail(true);
    // Simulate API call - replace with actual submission logic
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
        {/* Header with skeleton */}
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

        {/* Loading Content */}
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
      {/* Header Component */}
      <Header 
        onThemeToggle={handleThemeToggle}
        onRefresh={handleRefreshTopics}
        isRefreshing={refreshTopicsMutation.isPending}
        showRefresh={true}
      />

      {/* Simple Email Signup Section */}
      <section className="theme-header-bg border-b theme-divider py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
            
            {/* Left side - Message */}
            <div className="text-center lg:text-left">
              <p className="text-lg theme-header-text mb-1">
                First <span className="font-bold">100 users</span> to get free premium <span className="font-bold">for life.</span>
              </p>
            </div>

            {/* Right side - Signup Form */}
            <div className="flex flex-col items-center lg:items-end">
              <h3 className="text-xl font-semibold theme-header-text mb-4">Sign-up for TIMIO</h3>
              
              {showEmailSuccess ? (
                <div className="flex items-center text-green-600 font-medium">
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Successfully joined the waitlist!
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
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

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-8">
          {/* Left side - Articles */}
          <div className="flex-1 max-w-4xl">
            {/* Research Input */}
            <div className="flex flex-col items-center space-y-4 sm:space-y-6 mb-8 sm:mb-12">
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold theme-research-prompt-text text-center px-4">
                Generate a report on any event
              </h2>
              <div className="relative w-full max-w-2xl px-4 sm:px-0">
                {/* Enhanced background with gradient */}
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

            {/* Page Header */}
            <div className="mb-6 sm:mb-8 px-4 sm:px-0">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold theme-header-text mb-2">
                    Today's Important News
                  </h1>
                  <p className="text-base sm:text-lg theme-tagline-text">
                    AI curated important stories - Politics, Technology, Business, Health & Global Affairs
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => refetch()}
                  disabled={isLoading}
                  className="hidden sm:flex items-center gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                  Reload
                </Button>
              </div>
            </div>

            {/* Error State */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-red-800 font-medium">Unable to load news topics</h3>
                    <p className="text-red-600 text-sm mt-1">
                      There was an issue connecting to the news service. Please try again.
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

            {/* Articles Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 px-4 sm:px-0">
              {articles?.map((article) => (
                <Card key={article.id} className="theme-article-card-bg theme-article-card-border theme-article-card-hover border-2 shadow-card hover:shadow-card-hover transition-all duration-200 cursor-pointer group overflow-hidden h-full">
                    {/* Article Image with Overlay */}
                    <div className="relative overflow-hidden">
                      <img 
                        src={article.heroImageUrl}
                        alt={article.title}
                        className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-200"
                        loading="lazy"
                        onError={(e) => {
                          // Fallback image if original fails to load
                          e.currentTarget.src = "https://images.pexels.com/photos/518543/pexels-photo-518543.jpeg";
                        }}
                      />
                      {/* Semitransparent mask */}
                      <div className="absolute inset-0 bg-black bg-opacity-40"></div>
                      
                      {/* Category badge */}
                      <div className="absolute top-4 left-4">
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                          {article.category}
                        </Badge>
                      </div>
                      
                      {/* Headline overlay */}
                      <div className="absolute bottom-0 left-0 right-0 p-4">
                        <p className="text-sm font-medium text-blue-300 mb-1 flex items-center">
                          <Zap className="h-3 w-3 mr-1" />
                          Research this topic:
                        </p>
                        <h3 
                          className="text-xl font-semibold text-white mb-2 line-clamp-2 group-hover:text-blue-200 transition-colors duration-200 cursor-pointer hover:underline"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleTopicResearch(article.title);
                          }}
                        >
                          {article.title}
                        </h3>
                      </div>
                    </div>

                    {/* Article Content */}
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
                        
                        <Button
                          size="sm"
                          variant="outline"
                          className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-xs"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleTopicResearch(article.title);
                          }}
                        >
                          Research
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
              ))}
            </div>

            {/* Empty State */}
            {articles && articles.length === 0 && (
              <div className="text-center py-12">
                <div className="text-gray-400 mb-4">
                  <TrendingUp className="h-16 w-16 mx-auto" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No important news topics found</h3>
                <p className="text-gray-600 mb-4">
                  Our AI is currently generating fresh important news topics. This may take a moment.
                </p>
                <Button
                  onClick={handleRefreshTopics}
                  disabled={refreshTopicsMutation.isPending}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${refreshTopicsMutation.isPending ? 'animate-spin' : ''}`} />
                  {refreshTopicsMutation.isPending ? 'Generating...' : 'Generate Topics'}
                </Button>
              </div>
            )}
          </div>

          {/* Right sidebar - As seen on */}
          <div className="hidden lg:block w-80 flex-shrink-0">
            <div className="sticky top-24 space-y-4 theme-sidebar-bg theme-sidebar-border border p-4 rounded-lg">
              <img 
                src="/asseen-on.png" 
                alt="As seen on PBS and Automateed" 
                className="w-full h-auto rounded-lg shadow-lg"
                onError={(e) => {
                  // Hide image if it fails to load
                  e.currentTarget.style.display = 'none';
                }}
              />

              <a 
                href="https://timio.news" 
                target="_blank" 
                rel="noopener noreferrer"
                className="block w-full bg-black hover:bg-gray-800 text-white font-semibold py-4 px-8 rounded-lg text-left transition-colors duration-200 text-2xl"
              >
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
            </div>
          </div>
        </div>
      </main>
      
      {/* Theme Controller */}
      {showThemeController && <ThemeController onClose={() => setShowThemeController(false)} />}
    </div>
  );
}