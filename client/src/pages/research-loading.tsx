import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { SearchLoadingState } from "@/components/ui/loading-skeleton";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import { ThemeController } from "@/components/theme-controller";
import { useToast } from "@/hooks/use-toast";
import timioLogo from "@assets/App Icon_1751662407764.png";

export default function ResearchLoadingPage() {
  const [, setLocation] = useLocation();
  const [showThemeController, setShowThemeController] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [estimatedTime, setEstimatedTime] = useState(20);
  const { toast } = useToast();

  const researchMutation = useMutation({
    mutationFn: async (query: string) => {
      const response = await apiRequest("POST", "/api/research", { query });
      return response.json();
    },
    onSuccess: (data) => {
      // Navigate to the generated research report
      setLocation(`/article/${data.slug}`);
      toast({
        title: "Research Report Generated",
        description: "Your comprehensive research report is ready to view.",
      });
    },
    onError: (error) => {
      console.error("Research generation failed:", error);
      toast({
        title: "Research Failed",
        description: "Unable to generate research report. Please try again.",
        variant: "destructive",
      });
      // Navigate back to feed on error
      setLocation('/');
    }
  });

  useEffect(() => {
    // Get the search query from localStorage
    const query = localStorage.getItem('searchQuery') || "your topic";
    setSearchQuery(query);

    // Start the research process automatically
    if (query && query !== "your topic") {
      researchMutation.mutate(query);
    }

    // Simulate countdown timer
    const interval = setInterval(() => {
      setEstimatedTime((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Loading messages that cycle
  const loadingMessages = [
    "Analyzing primary sources and government documents...",
    "Researching different perspectives from news outlets...",
    "Gathering timeline of key events...",
    "Fetching relevant images and media...",
    "Compiling comprehensive research report...",
    "Finalizing fact-checking and source verification..."
  ];

  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMessageIndex((prev) => (prev + 1) % loadingMessages.length);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen theme-page-bg">
      {/* Header */}
      <header className="theme-header-bg shadow-sm relative">
        <div className="absolute bottom-0 left-0 right-0 h-0.5 theme-divider"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4 min-h-[80px] sm:min-h-[120px] lg:h-32">
            <div className="flex items-center space-x-2 sm:space-x-4">
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
            
            <div className="flex items-center space-x-2 sm:space-x-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowThemeController(!showThemeController)}
                className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4"
              >
                <Settings className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Theme</span>
              </Button>

            </div>
          </div>
        </div>
      </header>

      {/* Loading Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Loading Status */}
        <div className="text-center mb-8">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold theme-headline-text mb-4">
              Generating Research Report: "{searchQuery}"
            </h2>
            <div className="space-y-4">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-600 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${Math.max(10, 100 - (estimatedTime / 20) * 100)}%` }}
                ></div>
              </div>
              <p className="text-gray-600 text-lg">
                {loadingMessages[currentMessageIndex]}
              </p>
              <p className="text-sm text-gray-500">
                Estimated time remaining: {estimatedTime} seconds
              </p>
            </div>
          </div>
        </div>

        {/* Loading Skeleton */}
        <div className="animate-pulse">
          {/* Hero Section Skeleton */}
          <div className="relative h-64 md:h-96 bg-gray-200 rounded-lg mb-8">
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent rounded-lg">
              <div className="absolute bottom-6 left-6 right-6">
                <div className="h-4 bg-gray-300 rounded w-20 mb-4"></div>
                <div className="h-8 bg-gray-300 rounded w-3/4 mb-2"></div>
                <div className="h-6 bg-gray-300 rounded w-1/2"></div>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-12 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-8 space-y-8">
              {/* Executive Summary Skeleton */}
              <div className="bg-white rounded-lg border p-6">
                <div className="flex items-center mb-4">
                  <div className="w-8 h-8 bg-gray-200 rounded-full mr-3"></div>
                  <div className="h-6 bg-gray-200 rounded w-48"></div>
                </div>
                <div className="space-y-3">
                  <div className="h-4 bg-gray-200 rounded w-full"></div>
                  <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                  <div className="h-4 bg-gray-200 rounded w-4/5"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                </div>
              </div>

              {/* Expandable Sections Skeleton */}
              {["Raw Info", "Different Perspectives", "Conflicting Info"].map((title, index) => (
                <div key={index} className="bg-white rounded-lg border">
                  <div className="p-6 border-b">
                    <div className="flex items-center">
                      <div className="w-8 h-8 bg-gray-200 rounded-full mr-3"></div>
                      <div className="h-6 bg-gray-200 rounded w-40"></div>
                    </div>
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="h-4 bg-gray-200 rounded w-full"></div>
                    <div className="h-4 bg-gray-200 rounded w-4/5"></div>
                    <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                    <div className="space-y-3 mt-6">
                      {[1, 2, 3].map((item) => (
                        <div key={item} className="flex items-start">
                          <div className="w-2 h-2 bg-gray-200 rounded-full mt-2 mr-3"></div>
                          <div className="flex-1">
                            <div className="h-3 bg-gray-200 rounded w-full mb-2"></div>
                            <div className="h-3 bg-gray-200 rounded w-3/4"></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-4 space-y-8">
              {/* Timeline Skeleton */}
              <div className="bg-white rounded-lg border p-6">
                <div className="h-6 bg-gray-200 rounded w-32 mb-6"></div>
                <div className="space-y-6">
                  {[1, 2, 3, 4].map((item) => (
                    <div key={item} className="flex">
                      <div className="flex-shrink-0">
                        <div className="w-3 h-3 bg-gray-200 rounded-full mt-1"></div>
                      </div>
                      <div className="ml-4 flex-1">
                        <div className="h-4 bg-gray-200 rounded w-20 mb-2"></div>
                        <div className="h-5 bg-gray-200 rounded w-full mb-2"></div>
                        <div className="h-3 bg-gray-200 rounded w-4/5"></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Related Articles Skeleton */}
              <div className="bg-white rounded-lg border p-6">
                <div className="h-6 bg-gray-200 rounded w-40 mb-6"></div>
                <div className="space-y-6">
                  {[1, 2, 3].map((article) => (
                    <div key={article} className="flex space-x-4">
                      <div className="w-16 h-16 bg-gray-200 rounded-lg flex-shrink-0"></div>
                      <div className="flex-1">
                        <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
                        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                        <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Theme Controller */}
      {showThemeController && <ThemeController onClose={() => setShowThemeController(false)} />}
    </div>
  );
}