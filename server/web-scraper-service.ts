import axios from 'axios';
import * as cheerio from 'cheerio';

export interface ScrapedContent {
  url: string;
  title: string;
  content: string;
  quotes: string[];
  author?: string;
  publishedDate?: string;
  source: string;
  error?: string;
}

export interface ScrapingResult {
  success: boolean;
  data?: ScrapedContent;
  error?: string;
}

export class WebScraperService {
  private userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  ];

  async scrapeUrl(url: string, sourceName: string): Promise<ScrapingResult> {
    try {
      console.log(`Scraping URL: ${url}`);
      
      const userAgent = this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
        timeout: 10000, // 10 second timeout
        maxRedirects: 5
      });

      const html = response.data;
      const $ = cheerio.load(html);

      // Extract title
      const title = $('title').text().trim() || 
                   $('h1').first().text().trim() || 
                   $('meta[property="og:title"]').attr('content') || 
                   'No title found';

      // Extract main content
      const content = this.extractMainContent($);

      // Extract quotes
      const quotes = this.extractQuotes($);

      // Extract author
      const author = this.extractAuthor($);

      // Extract published date
      const publishedDate = this.extractPublishedDate($);

      const scrapedContent: ScrapedContent = {
        url,
        title,
        content,
        quotes,
        author,
        publishedDate,
        source: sourceName
      };

      console.log(`✓ Successfully scraped: ${title} (${quotes.length} quotes found)`);
      
      return {
        success: true,
        data: scrapedContent
      };

    } catch (error) {
      console.error(`✗ Failed to scrape ${url}:`, error instanceof Error ? error.message : 'Unknown error');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private extractMainContent($: cheerio.CheerioAPI): string {
    // Remove script and style elements
    $('script, style, nav, header, footer, .ad, .ads, .advertisement').remove();

    // Try different content selectors
    const contentSelectors = [
      'article',
      '.article-content',
      '.post-content',
      '.entry-content',
      '.content',
      '.main-content',
      'main',
      '.story-body',
      '.article-body',
      'p'
    ];

    for (const selector of contentSelectors) {
      const element = $(selector);
      if (element.length > 0) {
        const text = element.text().trim();
        if (text.length > 200) { // Minimum content length
          return this.cleanText(text);
        }
      }
    }

    // Fallback: get all paragraph text
    const paragraphs = $('p').map((_, el) => $(el).text().trim()).get();
    return this.cleanText(paragraphs.join(' '));
  }

  private extractQuotes($: cheerio.CheerioAPI): string[] {
    const quotes: string[] = [];

    // Look for blockquotes
    $('blockquote').each((_, element) => {
      const quote = $(element).text().trim();
      if (quote.length > 20 && quote.length < 500) {
        quotes.push(quote);
      }
    });

    // Look for quoted text in different formats
    $('q, .quote, .quotation').each((_, element) => {
      const quote = $(element).text().trim();
      if (quote.length > 20 && quote.length < 500) {
        quotes.push(quote);
      }
    });

    // Look for text in quotes
    const textContent = $('body').text();
    const quoteMatches = textContent.match(/"([^"]{20,200})"/g);
    if (quoteMatches) {
      quoteMatches.forEach(match => {
        const quote = match.replace(/"/g, '').trim();
        if (quote.length > 20 && !quotes.includes(quote)) {
          quotes.push(quote);
        }
      });
    }

    return quotes.slice(0, 10); // Limit to 10 quotes
  }

  private extractAuthor($: cheerio.CheerioAPI): string | undefined {
    const authorSelectors = [
      '.author',
      '.byline',
      '.author-name',
      '[rel="author"]',
      '.writer',
      '.reporter',
      'meta[name="author"]',
      'meta[property="article:author"]'
    ];

    for (const selector of authorSelectors) {
      const element = $(selector);
      if (element.length > 0) {
        const author = element.text().trim() || element.attr('content');
        if (author && author.length > 0) {
          return author;
        }
      }
    }

    return undefined;
  }

  private extractPublishedDate($: cheerio.CheerioAPI): string | undefined {
    const dateSelectors = [
      'meta[property="article:published_time"]',
      'meta[name="publish_date"]',
      '.published-date',
      '.date',
      '.timestamp',
      'time[datetime]'
    ];

    for (const selector of dateSelectors) {
      const element = $(selector);
      if (element.length > 0) {
        const date = element.attr('content') || element.attr('datetime') || element.text().trim();
        if (date && date.length > 0) {
          return date;
        }
      }
    }

    return undefined;
  }

  private cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/\n+/g, ' ') // Replace multiple newlines with space
      .trim()
      .substring(0, 5000); // Limit content length
  }

  async scrapeMultipleUrls(urls: string[], sourceNames: string[]): Promise<ScrapedContent[]> {
    console.log(`Starting to scrape ${urls.length} URLs...`);
    
    const results: ScrapedContent[] = [];
    const maxConcurrent = 3; // Limit concurrent requests
    
    for (let i = 0; i < urls.length; i += maxConcurrent) {
      const batch = urls.slice(i, i + maxConcurrent);
      const batchNames = sourceNames.slice(i, i + maxConcurrent);
      
      const batchPromises = batch.map((url, index) => 
        this.scrapeUrl(url, batchNames[index])
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.success && result.value.data) {
          results.push(result.value.data);
        }
      });
      
      // Small delay between batches to be respectful
      if (i + maxConcurrent < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`✓ Successfully scraped ${results.length} out of ${urls.length} URLs`);
    return results;
  }
}

export const webScraperService = new WebScraperService(); 