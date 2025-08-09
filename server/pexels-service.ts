import fetch from 'node-fetch';

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  photographer_id: number;
  avg_color: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    portrait: string;
    landscape: string;
    tiny: string;
  };
  liked: boolean;
  alt: string;
}

interface PexelsResponse {
  total_results: number;
  page: number;
  per_page: number;
  photos: PexelsPhoto[];
  next_page?: string;
}

export class PexelsService {
  private apiKey: string;
  private baseUrl: string = 'https://api.pexels.com/v1';
  private imageCache: Map<string, string> = new Map();

  constructor() {
    this.apiKey = process.env.PEXELS_API_KEY || '';
    if (!this.apiKey) {
      console.warn('PEXELS_API_KEY not found in environment variables');
    }
  }

  async searchImageByTopic(query: string, imageIndex: number = 0): Promise<string> {
    try {
      // Create cache key with query and index for unique image assignment
      const cacheKey = `${query}_${imageIndex}`;
      
      // Check cache first
      if (this.imageCache.has(cacheKey)) {
        console.log(`Using cached image for: ${cacheKey}`);
        return this.imageCache.get(cacheKey)!;
      }

      if (!this.apiKey) {
        console.warn('Pexels API key not available, using placeholder image');
        const placeholderUrl = this.generatePlaceholderImage(query);
        this.imageCache.set(cacheKey, placeholderUrl);
        return placeholderUrl;
      }

      // Clean and enhance the search query for better results
      const searchQuery = this.enhanceSearchQuery(query);
      
      console.log(`Searching Pexels for: ${searchQuery} (index: ${imageIndex})`);

      // Try multiple search strategies for better results
      const searchStrategies = [
        searchQuery,
        this.getBackupSearchQuery(query),
        this.getGenericSearchQuery(query)
      ];

      for (let i = 0; i < searchStrategies.length; i++) {
        const strategy = searchStrategies[i];
        console.log(`Trying search strategy ${i + 1}: ${strategy}`);
        
        const response = await fetch(`${this.baseUrl}/search?query=${encodeURIComponent(strategy)}&per_page=20&orientation=landscape`, {
          headers: {
            'Authorization': this.apiKey,
            'User-Agent': 'TIMIO News Research App'
          }
        });

        if (!response.ok) {
          console.error(`Pexels API error for strategy ${i + 1}: ${response.status} ${response.statusText}`);
          continue;
        }

        const data: PexelsResponse = await response.json();
        
        if (data.photos && data.photos.length > 0) {
          // Filter and rank images for better relevance
          const relevantPhotos = this.filterRelevantImages(data.photos, query);
          
          if (relevantPhotos.length > 0) {
            // Success! Select image based on index
            const selectedPhoto = relevantPhotos[imageIndex % relevantPhotos.length];
            console.log(`Selected image ${imageIndex} from strategy ${i + 1}: ${selectedPhoto.alt} by ${selectedPhoto.photographer}`);
            
            // Cache the result
            const imageUrl = selectedPhoto.src.large;
            this.imageCache.set(cacheKey, imageUrl);
            
            return imageUrl;
          }
        }
      }

      // If all strategies fail, use placeholder
      console.warn(`No relevant images found for any strategy for query: ${query}`);
      const placeholderUrl = this.generatePlaceholderImage(query);
      this.imageCache.set(cacheKey, placeholderUrl);
      return placeholderUrl;



    } catch (error) {
      console.error('Error fetching image from Pexels:', error);
      const placeholderUrl = this.generatePlaceholderImage(query);
      this.imageCache.set(cacheKey, placeholderUrl);
      return placeholderUrl;
    }
  }

  private enhanceSearchQuery(query: string): string {
    // Map research topics to better search terms for political/news imagery
    const topicMappings: { [key: string]: string } = {
      'supreme court': 'supreme court building justice',
      'border control': 'border fence immigration',
      'immigration': 'immigration border policy',
      'inflation': 'economy money finance',
      'healthcare': 'hospital medical healthcare',
      'congress': 'capitol building congress',
      'senate': 'senate chamber government',
      'house': 'house representatives capitol',
      'election': 'voting ballot election',
      'economy': 'business finance economy',
      'trade': 'shipping containers trade',
      'tariffs': 'trade commerce economics',
      'tax': 'money taxes finance',
      'budget': 'government budget finance',
      'defense': 'military defense pentagon',
      'security': 'security government building',
      'flooding': 'flooding disaster water',
      'floods': 'flooding disaster water',
      'climate': 'climate change environment',
      'weather': 'storm weather disaster',
      'disaster': 'disaster emergency response',
      'texas': 'texas state government',
      'california': 'california state government',
      'technology': 'technology innovation computer',
      'artificial intelligence': 'technology computer ai',
      'ai': 'technology computer artificial intelligence',
      // Major News Agencies & Wire Services
      'reuters': 'reuters news agency building journalism office',
      'associated press': 'associated press news wire journalism office',
      'ap news': 'associated press news wire journalism office',
      'agence france-presse': 'afp news wire journalism office',
      'afp': 'afp news wire journalism office',
      'bloomberg': 'bloomberg news finance business office',
      'getty images': 'getty images photography news media',
      
      // Television News Networks
      'cnn': 'cnn news network television studio journalism',
      'fox news': 'fox news television studio journalism',
      'msnbc': 'msnbc television news studio journalism',
      'nbc news': 'nbc news television studio journalism',
      'abc news': 'abc news television studio journalism',
      'cbs news': 'cbs news television studio journalism',
      'bbc': 'bbc news broadcasting television journalism',
      'sky news': 'sky news television journalism',
      'npr': 'npr radio news broadcasting journalism',
      
      // Major Newspapers
      'wall street journal': 'wall street journal newspaper finance business',
      'new york times': 'new york times newspaper journalism office',
      'washington post': 'washington post newspaper journalism office',
      'usa today': 'usa today newspaper journalism office',
      'guardian': 'guardian newspaper journalism office',
      'financial times': 'financial times newspaper finance business',
      'los angeles times': 'los angeles times newspaper journalism',
      'chicago tribune': 'chicago tribune newspaper journalism',
      'boston globe': 'boston globe newspaper journalism',
      
      // Magazines
      'time': 'time magazine cover journalism office',
      'newsweek': 'newsweek magazine journalism office',
      'economist': 'economist magazine finance business',
      'atlantic': 'atlantic magazine journalism office',
      'new yorker': 'new yorker magazine journalism office',
      'forbes': 'forbes magazine business finance office',
      'fortune': 'fortune magazine business finance office',
      'rolling stone': 'rolling stone magazine journalism office',
      
      // Digital/Online News
      'politico': 'politico news politics journalism office',
      'huffpost': 'huffington post news journalism office',
      'buzzfeed': 'buzzfeed news journalism office',
      'vox': 'vox media news journalism office',
      'slate': 'slate magazine journalism office',
      'salon': 'salon news journalism office',
      'daily beast': 'daily beast news journalism office',
      'axios': 'axios news journalism office',
      'the hill': 'the hill news politics journalism',
      
      // International News
      'al jazeera': 'al jazeera news international journalism',
      'france 24': 'france 24 news international journalism',
      'deutsche welle': 'deutsche welle news international journalism',
      'rt': 'rt news international journalism',
      'xinhua': 'xinhua news international journalism',
      'tass': 'tass news international journalism',
      
      // Reference & Knowledge
      'wikipedia': 'wikipedia encyclopedia books knowledge research',
      'britannica': 'encyclopedia britannica books knowledge',
      
      // Special Sources
      'serve source': 'community volunteers helping people service',
      'local news': 'local news television journalism',
      'press release': 'press release news announcement',
      'government': 'government building official news',
      'white house': 'white house government news',
      'pentagon': 'pentagon military defense news',
      'supreme court': 'supreme court justice legal news'
    };

    const lowerQuery = (query || '').toLowerCase();
    
    // Check for exact matches first
    for (const [key, value] of Object.entries(topicMappings)) {
      if (lowerQuery.includes(key)) {
        console.log(`News source mapping found: ${key} -> ${value}`);
        return value;
      }
    }

    // Check if it's likely a news source based on common patterns
    const newsPatterns = [
      /news/i,
      /times/i,
      /post/i,
      /journal/i,
      /tribune/i,
      /herald/i,
      /gazette/i,
      /press/i,
      /media/i,
      /broadcasting/i,
      /network/i,
      /magazine/i,
      /weekly/i,
      /daily/i,
      /wire/i,
      /agency/i,
      /service/i
    ];
    
    const isLikelyNewsSource = newsPatterns.some(pattern => pattern.test(lowerQuery));
    if (isLikelyNewsSource) {
      console.log(`Likely news source detected: ${query} -> using news imagery`);
      return 'news media journalism office newspaper';
    }

    // If no specific mapping, add generic political/government terms
    if (this.isPoliticalTopic(lowerQuery)) {
      return `${query} government politics`;
    }

    // Default fallback - treat unknown sources as news sources
    console.log(`Unknown source: ${query} -> treating as news source`);
    return 'news media journalism office';
  }

  private isPoliticalTopic(query: string): boolean {
    const politicalKeywords = [
      'trump', 'biden', 'president', 'white house', 'administration',
      'republican', 'democrat', 'party', 'campaign', 'vote', 'legislation',
      'bill', 'law', 'policy', 'regulation', 'federal', 'state', 'government'
    ];

    return politicalKeywords.some(keyword => query.includes(keyword));
  }

  private filterRelevantImages(photos: PexelsPhoto[], originalQuery: string): PexelsPhoto[] {
    const lowerQuery = originalQuery.toLowerCase();
    
    // Score images based on relevance
    const scoredPhotos = photos.map(photo => {
      let score = 0;
      const alt = (photo.alt || '').toLowerCase();
      
      // Boost score for news-related keywords
      const newsKeywords = ['news', 'journalism', 'media', 'press', 'newspaper', 'television', 'studio', 'office', 'building', 'government', 'politics', 'research', 'books', 'library'];
      newsKeywords.forEach(keyword => {
        if (alt.includes(keyword)) score += 10;
      });
      
      // Boost score for query-specific terms
      const queryTerms = lowerQuery.split(' ');
      queryTerms.forEach(term => {
        if (alt.includes(term)) score += 5;
      });
      
      // Penalize irrelevant content
      const irrelevantKeywords = ['fashion', 'beauty', 'food', 'travel', 'sports', 'music', 'art', 'nature', 'animal', 'sunset', 'beach', 'party', 'wedding'];
      irrelevantKeywords.forEach(keyword => {
        if (alt.includes(keyword)) score -= 5;
      });
      
      // Boost professional/business imagery
      const professionalKeywords = ['business', 'professional', 'corporate', 'meeting', 'conference', 'presentation', 'document', 'paper', 'work', 'desk'];
      professionalKeywords.forEach(keyword => {
        if (alt.includes(keyword)) score += 8;
      });
      
      // Prefer landscape orientation for better display
      if (photo.width > photo.height) score += 3;
      
      return { photo, score };
    });
    
    // Sort by score (highest first) and return top photos
    const relevantPhotos = scoredPhotos
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(item => item.photo);
    
    // If no relevant photos found, return all photos as fallback
    return relevantPhotos.length > 0 ? relevantPhotos : photos;
  }

  private getBackupSearchQuery(query: string): string {
    const lowerQuery = query.toLowerCase();
    
    // News source backup terms
    const newsSourceBackups: { [key: string]: string } = {
      'reuters': 'news agency office journalism',
      'ap news': 'news wire service journalism',
      'cnn': 'television news studio',
      'bbc': 'broadcasting news studio',
      'nytimes': 'newspaper journalism office',
      'wsj': 'business finance newspaper',
      'washington post': 'newspaper office journalism',
      'time': 'magazine journalism office',
      'newsweek': 'magazine news office',
      'wikipedia': 'encyclopedia books research',
      'politico': 'politics news office',
      'axios': 'news media office',
      'bloomberg': 'finance business news'
    };
    
    for (const [source, backup] of Object.entries(newsSourceBackups)) {
      if (lowerQuery.includes(source)) {
        return backup;
      }
    }
    
    // Topic-based backup terms
    if (lowerQuery.includes('government')) return 'government building politics';
    if (lowerQuery.includes('congress')) return 'capitol building government';
    if (lowerQuery.includes('senate')) return 'senate chamber government';
    if (lowerQuery.includes('court')) return 'court justice legal';
    if (lowerQuery.includes('election')) return 'voting ballot democracy';
    if (lowerQuery.includes('economy')) return 'business finance economics';
    if (lowerQuery.includes('healthcare')) return 'hospital medical health';
    if (lowerQuery.includes('education')) return 'school university learning';
    if (lowerQuery.includes('technology')) return 'computer technology innovation';
    if (lowerQuery.includes('environment')) return 'nature environment climate';
    
    return 'news media journalism office';
  }

  private getGenericSearchQuery(query: string): string {
    const lowerQuery = query.toLowerCase();
    
    // Determine the most appropriate generic category
    if (lowerQuery.includes('news') || lowerQuery.includes('media')) {
      return 'news media journalism';
    }
    if (lowerQuery.includes('government') || lowerQuery.includes('politics')) {
      return 'government building politics';
    }
    if (lowerQuery.includes('business') || lowerQuery.includes('finance')) {
      return 'business finance office';
    }
    if (lowerQuery.includes('research') || lowerQuery.includes('study')) {
      return 'research books library';
    }
    if (lowerQuery.includes('technology') || lowerQuery.includes('ai')) {
      return 'technology computer innovation';
    }
    
    // Default fallback
    return 'professional business office';
  }

  private generatePlaceholderImage(query: string): string {
    // Generate a descriptive placeholder as fallback
    const safeQuery = query || 'news';
    const cleanQuery = safeQuery.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '+');
    return `https://via.placeholder.com/800x400/1e40af/white?text=${encodeURIComponent(cleanQuery)}`;
  }
}

export const pexelsService = new PexelsService();