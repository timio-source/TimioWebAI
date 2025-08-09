import { cn } from "@/lib/utils";

interface LoadingSkeletonProps {
  className?: string;
}

export function LoadingSkeleton({ className }: LoadingSkeletonProps) {
  return (
    <div className={cn("animate-pulse", className)}>
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
          {[1, 2, 3].map((section) => (
            <div key={section} className="bg-white rounded-lg border">
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
  );
}

export function SearchLoadingState() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="h-20 bg-white border-b border-gray-200">
        <div className="mx-auto px-4 h-full flex items-center justify-between">
          <div className="h-8 bg-gray-200 rounded w-32 animate-pulse"></div>
          <div className="h-8 bg-gray-200 rounded w-8 animate-pulse"></div>
        </div>
      </header>

      {/* Loading Message */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <div className="h-8 bg-gray-200 rounded w-80 mx-auto mb-4 animate-pulse"></div>
          <div className="h-4 bg-gray-200 rounded w-64 mx-auto animate-pulse"></div>
        </div>

        <LoadingSkeleton />
      </div>
    </div>
  );
}