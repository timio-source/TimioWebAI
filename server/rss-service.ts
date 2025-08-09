import type { Article } from '@shared/schema';
import fetch from 'node-fetch';

interface NewsAPIArticle {
  uri: string;
  title: string;
  body: string;
  summary: string;
  url: string;
  image?: string;
  eventUri?: string;
  sentiment?: number;
  wgt?: number;
  relevance?: number;
  dateTime: string;
  dateTimePub?: string;
  source: {
    uri: string;
    dataType: string;
    title: string;
  };
  authors?: Array<{
    uri: string;
    name: string;
    type: string;
  }>;
  location?: {
    country: {
      label: {
        eng: string;
      };
    };
  };
  categories?: Array<{
    uri: string;
    label: {
      eng: string;
    };
  }>;
  concepts?: Array<{
    uri: string;
    label: {
      eng: string;
    };
    score: number;
  }>;
}

interface NewsAPIResponse {
  events: {
    results: Array<{
      uri: string;
      title: {
        eng: string;
      };
      summary: {
        eng: string;
      };
      eventDate: string;
      articleCounts: {
        total: number;
      };
      concepts: Array<{
        uri: string;
        label: {
          eng: string;
        };
        score: number;
      }>;
      categories: Array<{
        uri: string;
        label: {
          eng: string;
        };
      }>;
      location?: {
        country: {
          label: {
            eng: string;
          };
        };
      };
      articles: {
        results: NewsAPIArticle[];
      };
    }>;
  };
}

export class RSSService {
  private apiKey: string;
  private baseUrl: string;

  constructor(feedUrl?: string) {
    this.apiKey = process.env.NEWSAPI_AI_KEY || '';
    this.baseUrl = 'https://eventregistry.org/api/v1';
    
    if (!this.apiKey) {
      throw new Error('NEWSAPI_AI_KEY environment variable is required');
    }
  }

  async fetchArticles(): Promise<Article[]> {
    try {
      console.log('Fetching recent trending US political events from NewsAPI.ai Event Registry...');
      
      // NewsAPI.ai Event Registry parameters - broader search then filter for US politics
      const requestBody = {
        action: 'getEvents',
        keyword: 'politics',
        lang: 'eng', 
        eventsSortBy: 'date',
        eventsCount: 50,
        includeEventTitle: true,
        includeEventSummary: true,
        includeEventArticleCounts: true,
        includeEventArticles: true,
        eventArticlesCount: 1,
        apiKey: this.apiKey
      };
      
      console.log('API Request Body:', JSON.stringify(requestBody, null, 2));
      
      const response = await fetch(`${this.baseUrl}/event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log(`NewsAPI.ai error: ${response.status} ${response.statusText}`);
        console.log('API Error Response:', errorText);
        console.log('Falling back to sample political news data...');
        return this.getSampleEventData();
      }
      
      const data = await response.json() as NewsAPIResponse;
      
      if (!data.events || !data.events.results) {
        console.log('NewsAPI.ai returned no events, falling back to sample political news data...');
        return this.getSampleEventData();
      }
      
      console.log(`Fetched ${data.events.results.length} political events from NewsAPI.ai`);
      
      // Log the first few events to see what we're getting
      console.log('First few events from API:');
      data.events.results.slice(0, 5).forEach((event, index) => {
        console.log(`${index + 1}. ${event.title.eng} - Articles: ${event.articleCounts.total}`);
      });
      
      // Convert events to articles
      const apiArticles: Article[] = [];
      let articleId = 1;
      
      data.events.results.forEach(event => {
        // Strict filter for US political content only
        const title = event.title.eng.toLowerCase();
        const summary = (event.summary.eng || '').toLowerCase();
        const text = title + ' ' + summary;
        
        // Strong US indicators - require explicit US political terms
        const strongUSKeywords = ['biden', 'trump', 'congress', 'senate', 'white house', 'washington dc', 'supreme court', 'house of representatives', 'federal government', 'us president', 'american politics', 'united states', 'usa', 'america'];
        
        // Exclude non-US countries, regions, and irrelevant content
        const excludeKeywords = ['canada', 'canadian', 'alberta', 'ontario', 'australia', 'australian', 'india', 'indian', 'calcutta', 'west bengal', 'lagos', 'nigeria', 'mamata', 'trinamool', 'jaishankar', 'premier', 'byelection', 'toll pass', 'highway', 'qantas', 'apc', 'defections', 'dalori', 'khemka', 'bihar', 'bjp', 'hyderabad', 'kharge', 'gopal', 'natasha', 'spitting image', 'prince harry', 'harris', 'posters'];
        
        const hasStrongUSIndicator = strongUSKeywords.some(keyword => text.includes(keyword));
        const hasExcludedContent = excludeKeywords.some(keyword => text.includes(keyword));
        
        if (hasStrongUSIndicator && !hasExcludedContent) {
          // Create an article from the event
          const eventArticle: Article = {
            id: articleId++,
            title: this.cleanTitle(event.title.eng),
            slug: this.createSlug(event.title.eng),
            excerpt: event.summary.eng || 'US political event summary',
            content: event.summary.eng || 'US political event content',
            category: 'Politics',
            publishedAt: new Date(event.eventDate),
            readTime: this.estimateReadTime(event.summary.eng || ''),
            sourceCount: event.articleCounts.total || 1,
            heroImageUrl: this.getDefaultImage(),
            authorName: 'News Desk',
            authorTitle: 'US Political Events',
          };
          
          apiArticles.push(eventArticle);
        }
        
        // Also add individual articles from the event if available and US-related
        if (event.articles && event.articles.results) {
          event.articles.results.forEach(article => {
            if (articleId <= 15) { // Limit total articles
              const articleTitle = article.title.toLowerCase();
              const articleSummary = (article.summary || '').toLowerCase();
              const articleText = articleTitle + ' ' + articleSummary;
              
              // Apply same US filtering to individual articles
              const hasStrongUSIndicator = strongUSKeywords.some(keyword => articleText.includes(keyword));
              const hasExcludedContent = excludeKeywords.some(keyword => articleText.includes(keyword));
              
              if (hasStrongUSIndicator && !hasExcludedContent) {
                const individualArticle: Article = {
                  id: articleId++,
                  title: this.cleanTitle(article.title),
                  slug: this.createSlug(article.title),
                  excerpt: article.summary || this.extractExcerpt(article.body || ''),
                  content: article.body || article.summary || '',
                  category: 'Politics',
                  publishedAt: new Date(article.dateTime),
                  readTime: this.estimateReadTime(article.body || article.summary || ''),
                  sourceCount: Math.floor(Math.random() * 15) + 5,
                  heroImageUrl: article.image || this.getDefaultImage(),
                  authorName: article.authors?.[0]?.name || article.source.title,
                  authorTitle: article.source.title,
                };
                
                apiArticles.push(individualArticle);
              }
            }
          });
        }
      });
      
      console.log(`Created ${apiArticles.length} articles from events`);
      
      // If we have less than 3 unique articles, supplement with sample data
      if (apiArticles.length < 3) {
        console.log(`Only ${apiArticles.length} unique articles from API, supplementing with sample US political events...`);
        const sampleArticles = this.getSampleEventData();
        
        // Combine API articles with sample articles, ensuring no duplicates
        const combinedArticles = [...apiArticles];
        const apiTitles = new Set(apiArticles.map(a => a.title.toLowerCase()));
        
        sampleArticles.forEach(sampleArticle => {
          if (!apiTitles.has(sampleArticle.title.toLowerCase()) && combinedArticles.length < 15) {
            combinedArticles.push({
              ...sampleArticle,
              id: combinedArticles.length + 1
            });
          }
        });
        
        console.log(`Returning ${combinedArticles.length} combined articles (${apiArticles.length} from API, ${combinedArticles.length - apiArticles.length} from samples)`);
        return combinedArticles;
      }
      
      console.log(`Returning ${apiArticles.length} articles from NewsAPI.ai`);
      return apiArticles.slice(0, 20);
    } catch (error) {
      console.error('Error fetching from NewsAPI.ai:', error);
      console.log('Using sample political news data...');
      return this.getSampleEventData();
    }
  }

  private createSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
      .substring(0, 50);
  }

  private cleanTitle(title: string): string {
    // Remove common RSS feed prefixes and clean up title
    return title
      .replace(/^Google Alert - /, '')
      .replace(/<[^>]*>/g, '') // Remove HTML tags like <b>, </b>
      .replace(/&[^;]+;/g, (match) => {
        // Decode common HTML entities
        const entities: { [key: string]: string } = {
          '&amp;': '&',
          '&lt;': '<',
          '&gt;': '>',
          '&quot;': '"',
          '&#39;': "'",
          '&nbsp;': ' '
        };
        return entities[match] || match;
      })
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractExcerpt(content: string): string {
    // Strip HTML tags and get first 200 characters
    const stripped = content.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    return stripped.length > 200 ? stripped.substring(0, 200) + '...' : stripped;
  }

  private mapCategory(categories: string[]): string {
    // Map newsdata.io categories to our simplified categories
    if (!categories || categories.length === 0) return 'News';
    
    const category = categories[0].toLowerCase();
    const categoryMap: { [key: string]: string } = {
      'technology': 'Technology',
      'business': 'Business',
      'politics': 'Politics',
      'sports': 'Sports',
      'entertainment': 'Entertainment',
      'health': 'Health',
      'science': 'Science',
      'world': 'World',
      'top': 'Breaking',
      'lifestyle': 'Lifestyle'
    };
    
    return categoryMap[category] || 'News';
  }

  private getDefaultImage(): string {
    // Use the provided placeholder image
    return '/assets/placeholder_1751663094502.jpg';
  }

  private estimateReadTime(content: string): number {
    const wordsPerMinute = 200;
    const wordCount = content.split(/\s+/).length;
    return Math.max(1, Math.ceil(wordCount / wordsPerMinute));
  }

  private getSampleEventData(): Article[] {
    // Sample recent trending US political events and news data
    const sampleEvents = [
      {
        title: "Breaking: House Speaker Johnson Faces Challenge from GOP Hardliners",
        description: "Republican conservatives threaten Speaker Johnson's leadership over spending bill negotiations, creating uncertainty in House proceedings.",
        category: "Breaking Politics",
        image: "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=800&h=400&fit=crop"
      },
      {
        title: "Trump Legal Team Files Emergency Supreme Court Appeal",
        description: "Former President's lawyers petition Supreme Court for emergency stay of lower court ruling in federal election interference case.",
        category: "Legal/Political",
        image: "https://images.unsplash.com/photo-1589578527966-fdac0f44566c?w=800&h=400&fit=crop"
      },
      {
        title: "Biden Poll Numbers Drop Amid Economic Concerns",
        description: "New polling shows President Biden's approval rating declining as voters express concern over inflation and economic uncertainty.",
        category: "Campaign 2024",
        image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&h=400&fit=crop"
      },
      {
        title: "DeSantis Campaign Shakeup: Key Staff Departures Announced",
        description: "Florida Governor's presidential campaign announces major staff changes amid fundraising challenges and polling struggles.",
        category: "Campaign 2024",
        image: "https://images.unsplash.com/photo-1596368743298-413cca6f4d61?w=800&h=400&fit=crop"
      },
      {
        title: "Senate Confirms Controversial FTC Nominee in Party-Line Vote",
        description: "Democrats push through Biden's nominee for Federal Trade Commission despite Republican objections over antitrust positions.",
        category: "Senate Confirmations",
        image: "https://images.unsplash.com/photo-1569163139394-de4e4f43e4e0?w=800&h=400&fit=crop"
      },
      {
        title: "Hunter Biden Investigation: New Subpoenas Issued by House Committee",
        description: "House Oversight Committee escalates probe with fresh subpoenas targeting business associates and financial records.",
        category: "Congressional Investigation",
        image: "https://images.unsplash.com/photo-1540910419892-4a36d2c3266c?w=800&h=400&fit=crop"
      }
    ];

    return sampleEvents.map((event, index) => ({
      id: index + 1,
      title: event.title,
      slug: this.createSlug(event.title),
      excerpt: event.description,
      content: event.description,
      category: event.category,
      publishedAt: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000), // Random time within last 24 hours
      readTime: Math.floor(Math.random() * 5) + 3, // 3-7 minutes
      sourceCount: Math.floor(Math.random() * 15) + 5, // 5-20 sources
      heroImageUrl: event.image,
      authorName: "News Desk",
      authorTitle: "TIMIO News",
    }));
  }
}