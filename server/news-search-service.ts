// Real news search service using authentic APIs
import fetch from 'node-fetch';

interface NewsArticle {
  title: string;
  excerpt: string;
  url: string;
  source: string;
  publishedAt: string;
  imageUrl?: string;
}

export class NewsSearchService {
  private newsApiKey: string;
  
  constructor() {
    this.newsApiKey = process.env.NEWS_API_KEY || '';
  }

  async searchNews(query: string, limit: number = 6): Promise<NewsArticle[]> {
    try {
      // Try multiple news APIs to ensure we get real results
      const articles = await this.searchWithNewsAPI(query, limit);
      
      if (articles.length === 0) {
        console.log('No articles found from NewsAPI, trying EventRegistry...');
        return await this.searchWithEventRegistry(query, limit);
      }
      
      return articles;
    } catch (error) {
      console.error('Error searching news:', error);
      return [];
    }
  }

  private async searchWithNewsAPI(query: string, limit: number): Promise<NewsArticle[]> {
    if (!this.newsApiKey) {
      console.log('NEWS_API_KEY not provided, skipping NewsAPI search');
      return [];
    }

    try {
      const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&pageSize=${limit}&apiKey=${this.newsApiKey}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error('NewsAPI error:', response.status, response.statusText);
        return [];
      }

      const data = await response.json() as any;
      
      if (!data.articles || data.articles.length === 0) {
        console.log('No articles returned from NewsAPI');
        return [];
      }

      return data.articles.map((article: any) => ({
        title: article.title || 'Untitled',
        excerpt: article.description || 'No description available',
        url: article.url || '',
        source: article.source?.name || 'Unknown Source',
        publishedAt: article.publishedAt || new Date().toISOString(),
        imageUrl: article.urlToImage
      })).filter((article: NewsArticle) => 
        article.url && 
        article.url.startsWith('http') && 
        !article.url.includes('removed') &&
        article.title !== '[Removed]'
      );
    } catch (error) {
      console.error('NewsAPI search error:', error);
      return [];
    }
  }

  private async searchWithEventRegistry(query: string, limit: number): Promise<NewsArticle[]> {
    // Fallback to EventRegistry API (same as current RSS service)
    const eventRegistryKey = process.env.EVENT_REGISTRY_API_KEY || '';
    
    if (!eventRegistryKey) {
      console.log('EVENT_REGISTRY_API_KEY not provided, returning empty results');
      return [];
    }

    try {
      const url = `https://eventregistry.org/api/v1/event/getEvents`;
      const body = {
        action: 'getEvents',
        keyword: query,
        conceptUri: 'dmoz/Society/Politics',
        sourceLocationUri: 'http://en.wikipedia.org/wiki/United_States',
        lang: 'eng',
        eventsSortBy: 'date',
        eventsCount: limit,
        includeEventArticles: true,
        apiKey: eventRegistryKey
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        console.error('EventRegistry error:', response.status);
        return [];
      }

      const data = await response.json() as any;
      const articles: NewsArticle[] = [];

      if (data.events?.results) {
        for (const event of data.events.results.slice(0, limit)) {
          if (event.articles?.results) {
            for (const article of event.articles.results.slice(0, 2)) {
              articles.push({
                title: article.title || event.title?.eng || 'Untitled',
                excerpt: article.summary || event.summary?.eng || 'No summary available',
                url: article.url || '',
                source: article.source?.title || 'Unknown Source',
                publishedAt: article.dateTime || event.eventDate || new Date().toISOString(),
                imageUrl: article.image
              });
            }
          }
        }
      }

      return articles.filter(article => 
        article.url && 
        article.url.startsWith('http')
      );
    } catch (error) {
      console.error('EventRegistry search error:', error);
      return [];
    }
  }

  // Verify that URLs are actually accessible (quick check)
  async verifyUrls(articles: NewsArticle[]): Promise<NewsArticle[]> {
    const verified: NewsArticle[] = [];
    
    for (const article of articles) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(article.url, { 
          method: 'HEAD',
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          verified.push(article);
          console.log(`✓ Verified URL: ${article.url}`);
        } else {
          console.log(`✗ Failed URL (${response.status}): ${article.url}`);
        }
      } catch (error) {
        console.log(`✗ Failed URL (error): ${article.url}`);
      }
    }
    
    return verified;
  }
}

export const newsSearchService = new NewsSearchService();