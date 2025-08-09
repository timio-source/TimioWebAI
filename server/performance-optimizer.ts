// Performance optimization utilities for the research service

export class PerformanceOptimizer {
  private static imageCache = new Map<string, string>();
  private static responseCache = new Map<string, any>();
  private static CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  // Quick image fallbacks for common topics
  private static quickImageFallbacks = {
    'news': 'https://images.pexels.com/photos/7618405/pexels-photo-7618405.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    'politics': 'https://images.pexels.com/photos/6238297/pexels-photo-6238297.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    'ai': 'https://images.pexels.com/photos/18068747/pexels-photo-18068747.png?auto=compress&cs=tinysrgb&h=650&w=940',
    'technology': 'https://images.pexels.com/photos/18068747/pexels-photo-18068747.png?auto=compress&cs=tinysrgb&h=650&w=940',
    'science': 'https://images.pexels.com/photos/2280571/pexels-photo-2280571.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    'health': 'https://images.pexels.com/photos/40568/medical-appointment-doctor-healthcare-40568.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    'business': 'https://images.pexels.com/photos/7688336/pexels-photo-7688336.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    'finance': 'https://images.pexels.com/photos/7688336/pexels-photo-7688336.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'
  };

  static getQuickImage(query: string): string | null {
    const lowerQuery = query.toLowerCase();
    
    for (const [pattern, url] of Object.entries(this.quickImageFallbacks)) {
      if (lowerQuery.includes(pattern)) {
        console.log(`Quick image fallback for pattern: ${pattern}`);
        return url;
      }
    }
    
    return null;
  }

  static cacheResponse(key: string, response: any): void {
    this.responseCache.set(key, {
      data: response,
      timestamp: Date.now()
    });
  }

  static getCachedResponse(key: string): any | null {
    const cached = this.responseCache.get(key);
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_DURATION) {
      console.log(`Cache hit for response: ${key}`);
      return cached.data;
    }
    return null;
  }

  static simplifyJsonRepair(content: string): string {
    // Fast, simple JSON repair for common issues
    return content
      // Fix smart quotes
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      // Fix common structural issues
      .replace(/^[\s,]+/, '')
      .replace(/,[\s,]+/g, ',')
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/([{\[])\s*,/g, '$1')
      // Basic cleanup
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  }

  static async optimizedImageSearch(query: string, index: number = 0): Promise<string> {
    const cacheKey = `${query}_${index}`;
    
    // Check cache first
    if (this.imageCache.has(cacheKey)) {
      return this.imageCache.get(cacheKey)!;
    }

    // Try quick fallback first
    const quickImage = this.getQuickImage(query);
    if (quickImage) {
      this.imageCache.set(cacheKey, quickImage);
      return quickImage;
    }

    // Default fallback image
    const defaultImage = 'https://images.pexels.com/photos/7618405/pexels-photo-7618405.jpeg?auto=compress&cs=tinysrgb&h=650&w=940';
    this.imageCache.set(cacheKey, defaultImage);
    return defaultImage;
  }
}