import OpenAI from "openai";
import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
import type { TimelineItem, CitedSource, RawFacts, Perspective, ExecutiveSummary } from "@shared/schema";

// API interface for Article (different from database schema)
interface ArticleAPI {
  id: number;
  slug: string;
  title: string;
  content: string;
  category: string;
  excerpt: string;
  heroImageUrl: string;
  publishedAt: string; // ISO string for API
  readTime: number;
  sourceCount: number;
  authorName: string;
  authorTitle: string;
}
import { pexelsService } from "./pexels-service";
import { webScraperService, type ScrapedContent, type ScrapingResult } from "./web-scraper-service";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ResearchReport {
  article: ArticleAPI;
  executiveSummary: ExecutiveSummary;
  timelineItems: TimelineItem[];
  citedSources: CitedSource[];
  rawFacts: RawFacts[];
  perspectives: Perspective[];
}

export class TavilyResearchAgent {
  private tavilySearch: TavilySearchResults;
  private cache: Map<string, any> = new Map(); // Simple in-memory cache
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Check if Tavily API key is available
    if (!process.env.TAVILY_API_KEY) {
      throw new Error('TAVILY_API_KEY environment variable is required');
    }
    
    console.log('Initializing Tavily search with API key:', process.env.TAVILY_API_KEY.substring(0, 10) + '...');
    
    // Initialize Tavily search tool with minimal configuration
    this.tavilySearch = new TavilySearchResults({
      apiKey: process.env.TAVILY_API_KEY,
      maxResults: 15, // Increased to ensure we have enough results for 10 articles
      searchDepth: "basic"
    });
  }

  async generateResearchReport(query: string, heroImageUrl?: string): Promise<ResearchReport> {
    const startTime = Date.now();
    console.log('\n=== TAVILY RESEARCH AGENT: GENERATING REPORT (OPTIMIZED) ===');
    console.log('Query:', query);

    // Check cache first
    const cacheKey = `report_${query.toLowerCase().replace(/\s+/g, '_')}`;
    const cached = this.getCachedResult(cacheKey);
    if (cached) {
      console.log('✓ Returning cached result');
      return cached;
    }

    try {
      // Step 1: Parallel initialization of hero image and web search
      console.log('Step 1: Starting parallel search and image fetch...');
      const [searchResults, initialHeroImage] = await Promise.all([
        this.performOptimizedSearch(query),
        heroImageUrl ? Promise.resolve(heroImageUrl) : pexelsService.searchImageByTopic(query, 0)
      ]);

      if (!searchResults || searchResults.length === 0) {
        console.log('No search results found, creating fallback report...');
        return this.createFallbackReport(query, 'No search results found');
      }

      // Step 2: Parallel web scraping (limit to 10 URLs for testing)
      const searchResultsToScrape = searchResults.slice(0, 10);
      console.log(`Step 2: Starting parallel scraping of ${searchResultsToScrape.length} URLs...`);
      
      const [scrapedContent, sourceImages] = await Promise.all([
        this.parallelWebScraping(searchResultsToScrape), // pass search results
        this.parallelImageFetching(searchResultsToScrape) // Fetch images in parallel for 10 sources
      ]);

      // Step 3: Generate optimized report with truncated content
      console.log('Step 3: Generating optimized AI report...');
      const reportData = await this.generateOptimizedAIReport(query, searchResults, scrapedContent, searchResultsToScrape.map(r => r.url));

      // Step 4: Build final report with pre-fetched images
      console.log('Step 4: Building final report...');
      const report = await this.buildFinalReport(reportData, query, initialHeroImage, sourceImages);

      // Cache the result
      this.setCachedResult(cacheKey, report);

      const endTime = Date.now();
      console.log(`✅ OPTIMIZED research report generated in ${endTime - startTime}ms (vs ~26s typical)`);
      
      return report;
    } catch (error) {
      console.error('Optimized Tavily Research Agent Error:', error);
      throw new Error('Failed to generate research report');
    }
  }

  // Enhanced JSON parsing with multiple fallback strategies
  private async parseAndValidateJSON(content: string, query: string): Promise<any> {
    console.log('=== JSON PARSING AND VALIDATION ===');
    console.log('Content length:', content.length);
    
    // Strategy 1: Direct parsing (should work with response_format: json_object)
    try {
      const parsed = JSON.parse(content);
      console.log('✓ Direct JSON parsing successful');
      return this.validateReportStructure(parsed, query);
    } catch (error) {
      console.log('✗ Direct parsing failed:', error instanceof Error ? error.message : 'Unknown error');
    }

    // Strategy 2: Clean and try again
    try {
      const cleaned = this.cleanJsonString(content);
      const parsed = JSON.parse(cleaned);
      console.log('✓ Cleaned JSON parsing successful');
      return this.validateReportStructure(parsed, query);
    } catch (error) {
      console.log('✗ Cleaned parsing failed:', error instanceof Error ? error.message : 'Unknown error');
    }

    // Strategy 3: Extract JSON from markdown or other formatting
    try {
      const extracted = this.extractJsonFromContent(content);
      const parsed = JSON.parse(extracted);
      console.log('✓ Extracted JSON parsing successful');
      return this.validateReportStructure(parsed, query);
    } catch (error) {
      console.log('✗ Extracted parsing failed:', error instanceof Error ? error.message : 'Unknown error');
    }

    // Strategy 4: Try to repair common JSON issues
    try {
      const repaired = this.repairCommonJsonIssues(content);
      const parsed = JSON.parse(repaired);
      console.log('✓ Repaired JSON parsing successful');
      return this.validateReportStructure(parsed, query);
    } catch (error) {
      console.log('✗ Repaired parsing failed:', error instanceof Error ? error.message : 'Unknown error');
    }

    // Strategy 5: Create minimal valid structure
    console.log('⚠️ All parsing strategies failed, creating minimal valid structure');
    return this.createMinimalValidStructure(query);
  }

  // Validate the parsed report structure
  private validateReportStructure(data: any, query: string): any {
    console.log('Validating report structure...');
    
    // Ensure required fields exist
    if (!data.article) {
      data.article = {};
    }
    
    if (!data.article.title) {
      data.article.title = `Research Report: ${query}`;
    }
    
    if (!data.article.content) {
      data.article.content = `Research report on: ${query}`;
    }
    
    if (!data.article.excerpt) {
      data.article.excerpt = `Research findings about ${query}`;
    }
    
    // Ensure arrays exist
    if (!Array.isArray(data.rawFacts)) data.rawFacts = [];
    if (!Array.isArray(data.timelineItems)) data.timelineItems = [];
    if (!Array.isArray(data.perspectives)) data.perspectives = [];
    if (!Array.isArray(data.conflictingClaims)) data.conflictingClaims = [];
    if (!Array.isArray(data.citedSources)) data.citedSources = [];
    
    console.log('✓ Report structure validation complete');
    return data;
  }

  // Clean JSON string
  private cleanJsonString(content: string): string {
    // Remove markdown code blocks
    let cleaned = content.replace(/```json\n?/g, '').replace(/\n?```$/g, '');
    
    // Remove leading/trailing whitespace
    cleaned = cleaned.trim();
    
    // Fix common escape issues
    cleaned = cleaned.replace(/\\"/g, '"');
    cleaned = cleaned.replace(/\\n/g, '\\n');
    cleaned = cleaned.replace(/\\t/g, '\\t');
    
    return cleaned;
  }

  // Extract JSON from content that might have extra formatting
  private extractJsonFromContent(content: string): string {
    // Find JSON object boundaries
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    
    if (start !== -1 && end !== -1 && end > start) {
      return content.substring(start, end + 1);
    }
    
    throw new Error('No JSON object found in content');
  }

  // Repair common JSON issues
  private repairCommonJsonIssues(content: string): string {
    let repaired = content;
    
    // Fix unescaped quotes in strings
    repaired = repaired.replace(/"([^"]*)"([^"]*)"([^"]*)"/g, '"$1\\"$2\\"$3"');
    
    // Fix trailing commas
    repaired = repaired.replace(/,(\s*[}\]])/g, '$1');
    
    // Fix missing quotes around property names
    repaired = repaired.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
    
    // Fix newlines in strings
    repaired = repaired.replace(/\n/g, '\\n');
    repaired = repaired.replace(/\r/g, '\\r');
    repaired = repaired.replace(/\t/g, '\\t');
    
    return repaired;
  }

  // Create minimal valid structure when all parsing fails
  private createMinimalValidStructure(query: string): any {
    console.log('Creating minimal valid structure...');
    
    return {
      article: {
        title: `Research Report: ${query}`,
        excerpt: `Research findings about ${query}`,
        content: `Unable to generate comprehensive research report due to technical issues. Please try again later.`,
        category: "Research",
        publishedAt: new Date().toISOString(),
        readTime: 1,
        sourceCount: 0
      },
      rawFacts: [],
      timelineItems: [],
      perspectives: [],
      conflictingClaims: [],
      citedSources: []
    };
  }

  private formatPerspectives(perspectives: any[], conflictingClaims: any[]): any[] {
    const formattedPerspectives: any[] = [];
    let index = 0;
    const usedSources = new Set<string>();

    console.log(`=== FORMATTING PERSPECTIVES ===`);
    console.log(`Input perspectives: ${perspectives.length}`);
    console.log(`Input conflicting claims: ${conflictingClaims.length}`);

    // Format regular perspectives with enhanced depth
    perspectives.forEach((perspective: any) => {
      // Skip if we've already used this source to ensure diversity
      if (usedSources.has(perspective.source)) {
        console.log(`Skipping duplicate source: ${perspective.source}`);
        return;
      }
      
      usedSources.add(perspective.source);
      
      formattedPerspectives.push({
        id: Date.now() + index++,
        articleId: Date.now(),
        viewpoint: perspective.viewpoint,
        description: perspective.description,
        source: perspective.source,
        quote: perspective.quote,
        color: perspective.color || 'blue',
        url: perspective.url,
        reasoning: perspective.reasoning || `Analysis from ${perspective.source}`,
        evidence: perspective.evidence || perspective.quote,
        conflictSource: null, // Will be populated if there's a conflicting claim
        conflictQuote: null   // Will be populated if there's a conflicting claim
      });
    });

    // Process conflicting claims and merge them into perspectives
    conflictingClaims.forEach((conflict: any, conflictIndex: number) => {
      console.log(`Processing conflicting claim ${conflictIndex + 1}: ${conflict.topic}`);
      
      // Find or create a perspective for source A
      let perspectiveA = formattedPerspectives.find(p => 
        p.source === conflict.sourceA.source || 
        p.source.toLowerCase().includes(conflict.sourceA.source.toLowerCase()) ||
        conflict.sourceA.source.toLowerCase().includes(p.source.toLowerCase())
      );
      
      if (!perspectiveA) {
        // Create new perspective for source A
        perspectiveA = {
          id: Date.now() + index++,
          articleId: Date.now(),
          viewpoint: `${conflict.topic} - Supporting View`,
          description: `Analysis of ${conflict.topic} from ${conflict.sourceA.source}`,
          source: conflict.sourceA.source,
          quote: conflict.sourceA.claim,
          color: 'green',
          url: conflict.sourceA.url,
          reasoning: `Position from ${conflict.sourceA.source}`,
          evidence: conflict.sourceA.claim,
          conflictSource: conflict.sourceB.source,
          conflictQuote: conflict.sourceB.claim,
          conflictUrl: conflict.sourceB.url
        };
        formattedPerspectives.push(perspectiveA);
        console.log(`Created new perspective A for: ${conflict.sourceA.source}`);
      } else {
        // Update existing perspective with conflict information
        perspectiveA.conflictSource = conflict.sourceB.source;
        perspectiveA.conflictQuote = conflict.sourceB.claim;
        perspectiveA.conflictUrl = conflict.sourceB.url;
        console.log(`Updated existing perspective A for: ${conflict.sourceA.source}`);
      }
      
      // Find or create a perspective for source B
      let perspectiveB = formattedPerspectives.find(p => 
        p.source === conflict.sourceB.source || 
        p.source.toLowerCase().includes(conflict.sourceB.source.toLowerCase()) ||
        conflict.sourceB.source.toLowerCase().includes(p.source.toLowerCase())
      );
      
      if (!perspectiveB) {
        // Create new perspective for source B
        perspectiveB = {
          id: Date.now() + index++,
          articleId: Date.now(),
          viewpoint: `${conflict.topic} - Opposing View`,
          description: `Analysis of ${conflict.topic} from ${conflict.sourceB.source}`,
          source: conflict.sourceB.source,
          quote: conflict.sourceB.claim,
          color: 'red',
          url: conflict.sourceB.url,
          reasoning: `Position from ${conflict.sourceB.source}`,
          evidence: conflict.sourceB.claim,
          conflictSource: conflict.sourceA.source,
          conflictQuote: conflict.sourceA.claim,
          conflictUrl: conflict.sourceA.url
        };
        formattedPerspectives.push(perspectiveB);
        console.log(`Created new perspective B for: ${conflict.sourceB.source}`);
      } else {
        // Update existing perspective with conflict information
        perspectiveB.conflictSource = conflict.sourceA.source;
        perspectiveB.conflictQuote = conflict.sourceA.claim;
        perspectiveB.conflictUrl = conflict.sourceA.url;
        console.log(`Updated existing perspective B for: ${conflict.sourceB.source}`);
      }
    });

    // Ensure we have at least 2 different perspectives
    if (formattedPerspectives.length < 2) {
      console.log('Warning: Limited perspectives found, adding fallback perspective');
      formattedPerspectives.push({
        id: Date.now() + index++,
        articleId: Date.now(),
        viewpoint: 'Additional Analysis',
        description: 'Further analysis and context about the topic',
        source: 'Research Analysis',
        quote: 'Additional research and analysis provides further context on this topic.',
        color: 'purple',
        url: null,
        reasoning: 'Comprehensive research analysis',
        evidence: 'Based on available research data and analysis',
        conflictSource: null,
        conflictQuote: null
      });
    }

    const perspectivesWithConflicts = formattedPerspectives.filter(p => p.conflictSource && p.conflictQuote);
    console.log(`Formatted ${formattedPerspectives.length} perspectives from ${usedSources.size} unique sources`);
    console.log(`${perspectivesWithConflicts.length} perspectives have conflicting information`);
    console.log(`Perspectives with conflicts:`, perspectivesWithConflicts.map(p => `${p.source} vs ${p.conflictSource}`));
    
    return formattedPerspectives;
  }

  private groupRawFactsByCategory(rawFactsArray: any[]): any[] {
    // Group raw facts by category
    const groupedFacts = rawFactsArray.reduce((acc: any, item: any) => {
      const category = item.category || 'General';
      if (!acc[category]) {
        acc[category] = [];
      }

      // Extract source from "From [Source]: " format if present
      let factText = item.fact;
      let source = item.source;

      const fromMatch = factText.match(/^From ([^:]+): (.+)$/);
      if (fromMatch) {
        source = fromMatch[1];
        factText = fromMatch[2];
      }

      // Add the fact with source annotation and URL
      const factData = {
        text: factText,
        source: source,
        url: item.url || null
      };
      acc[category].push(factData);
      return acc;
    }, {});

    // Convert to array format expected by schema
    return Object.entries(groupedFacts).map(([category, facts], index) => ({
      id: Date.now() + index,
      articleId: Date.now(),
      category,
      facts: facts
    }));
  }

  private categorizeSourcesForPerspectives(searchResults: any[]): any {
    const categories: { [key: string]: any[] } = {
      news: [],
      government: [],
      academic: [],
      business: [],
      criticism: [],
      support: [],
      expert: [],
      other: []
    };

    searchResults.forEach((result: any) => {
      const url = result.url.toLowerCase();
      const title = (result.title || '').toLowerCase();
      const content = (result.content || '').toLowerCase();
      
      // Categorize based on URL and content
      if (url.includes('news') || url.includes('bbc') || url.includes('cnn') || url.includes('reuters') || url.includes('apnews')) {
        categories.news.push(result);
      } else if (url.includes('gov') || url.includes('government') || url.includes('whitehouse') || url.includes('congress')) {
        categories.government.push(result);
      } else if (url.includes('edu') || url.includes('academic') || url.includes('research') || url.includes('journal')) {
        categories.academic.push(result);
      } else if (url.includes('forbes') || url.includes('bloomberg') || url.includes('wsj') || url.includes('business')) {
        categories.business.push(result);
      } else if (content.includes('criticism') || content.includes('concern') || content.includes('opposition') || content.includes('against')) {
        categories.criticism.push(result);
      } else if (content.includes('support') || content.includes('praise') || content.includes('positive') || content.includes('success')) {
        categories.support.push(result);
      } else if (content.includes('expert') || content.includes('specialist') || content.includes('professor') || content.includes('analyst')) {
        categories.expert.push(result);
      } else {
        categories.other.push(result);
      }
    });

    return categories;
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private createSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);
  }

  private createFallbackReport(query: string, errorMessage: string): ResearchReport {
    return {
      article: {
        id: Date.now(),
        slug: this.createSlug(`Research Report: ${query}`),
        title: `Research Report: ${query}`,
        content: `Unable to generate comprehensive research report due to technical issues: ${errorMessage}. Please try again later.`,
        category: "Research",
        excerpt: "Research report generation failed due to technical issues.",
        heroImageUrl: "",
        publishedAt: new Date().toISOString(),
        readTime: 1,
        sourceCount: 0,
        authorName: "TIMIO Research Team",
        authorTitle: "AI Research Analyst"
      },
      executiveSummary: {
        id: Date.now(),
        articleId: Date.now(),
        points: ["Research report generation failed due to technical issues."]
      },
      timelineItems: [],
      citedSources: [],
      rawFacts: [],
      perspectives: []
    };
  }

  // Parallel web scraping with concurrent requests
  private async parallelWebScraping(searchResults: any[]): Promise<ScrapedContent[]> {
    const urls = searchResults.map(r => r.url).filter(Boolean);
    console.log(`🚀 Starting parallel scraping of ${urls.length} URLs...`);
    
    const scrapingPromises = searchResults.map(async (result, index) => {
      try {
        const url = result.url;
        // Use the search result title as the sourceName, fallback to domain
        const sourceName = result.title || new URL(url).hostname;
        return await webScraperService.scrapeUrl(url, sourceName);
      } catch (error) {
        console.warn(`Failed to scrape ${result.url}:`, error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' } as ScrapingResult;
      }
    });

    const results = await Promise.allSettled(scrapingPromises);
    const successfulScrapes: ScrapedContent[] = [];
    
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.success && result.value.data) {
        successfulScrapes.push(result.value.data);
      }
    }

    console.log(`✅ Parallel scraping completed: ${successfulScrapes.length}/${urls.length} successful`);
    
    // Log quote extraction details
    const totalQuotes = successfulScrapes.reduce((sum, content) => sum + content.quotes.length, 0);
    console.log(`📝 EXTRACTED QUOTES SUMMARY:`);
    console.log(`Total quotes extracted: ${totalQuotes}`);
    successfulScrapes.forEach((content, index) => {
      console.log(`${index + 1}. ${content.source}: ${content.quotes.length} quotes`);
      content.quotes.forEach((quote, qIndex) => {
        console.log(`   Quote ${qIndex + 1}: "${quote.substring(0, 50)}${quote.length > 50 ? '...' : ''}"`);
      });
    });
    
    return successfulScrapes;
  }

  // Parallel image fetching for sources
  private async parallelImageFetching(sources: any[]): Promise<string[]> {
    console.log(`🖼️ Starting parallel image fetching for ${sources.length} sources...`);
    const imagePromises = sources.map(async (source, index) => {
      try {
        const searchTerm = source.title || source.url || `source ${index}`;
        return await pexelsService.searchImageByTopic(searchTerm, index + 10);
      } catch (error) {
        console.warn(`Failed to get image for source ${index}:`, error);
        return 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=300&h=200&fit=crop'; // Fallback
      }
    });

    const images = await Promise.all(imagePromises);
    console.log(`✅ Parallel image fetching completed: ${images.length} images retrieved`);
    return images;
  }

  // Optimized AI report generation with truncated content
  private async generateOptimizedAIReport(
    query: string, 
    searchResults: any[], 
    scrapedContent: ScrapedContent[], 
    validUrls: string[]
  ): Promise<any> {
    // Truncate content for faster processing but preserve quotes
    const truncatedScrapedContent = scrapedContent.map(content => ({
      ...content,
      content: content.content.substring(0, 500), // Limit to 500 chars per source
      quotes: content.quotes // Keep ALL quotes, don't truncate
    }));

    // Create detailed source information for quote attribution
    const sourceQuotesInfo = truncatedScrapedContent.map((content, index) => {
      return `
SOURCE ${index + 1}: ${content.source}
URL: ${content.url}
AVAILABLE QUOTES FROM THIS SOURCE:
${content.quotes.map((quote, qIndex) => `${qIndex + 1}. "${quote}"`).join('\n')}
CONTENT SUMMARY: ${content.content}
`;
    }).join('\n');

    const hasConflictingInfo = await this.checkForConflictingInfo(sourceQuotesInfo);

    const systemPrompt = `SYSTEM ROLE: You are a fast, efficient research assistant. Create a comprehensive research report based ONLY on the provided search results and scraped content.

🚫 CRITICAL INSTRUCTIONS:
- NO SAME-SOURCE CONFLICTS: For the "conflictingClaims" section, sourceA and sourceB MUST originate from different and distinct sources. Do NOT use the same source for both claims under any circumstances. For example, if Source A is from "Wikipedia", Source B cannot also be from "Wikipedia".
- REAL QUOTES ONLY: You MUST ONLY use quotes that are explicitly provided in the "AVAILABLE QUOTES FROM THIS SOURCE" sections below. Never generate, create, or fabricate any quotes. Every quote MUST be copied EXACTLY as provided and attributed to its source.

TASK: Create a detailed research report on: ${query}

SEARCH RESULTS (${searchResults.length} sources):
${searchResults.slice(0, 10).map((result: any, index: number) => 
  `${index + 1}. ${result.title || 'No title'} - ${result.url || 'No URL'}`
).join('\n')}

${sourceQuotesInfo}

STRICT JSON AND QUOTE USAGE RULES:
1. Only use quotes from the "AVAILABLE QUOTES FROM THIS SOURCE" sections above.
2. Copy quotes EXACTLY as they appear—no modifications or paraphrasing.
3. Always attribute quotes to the exact source name and URL provided.
4. Never combine quotes from different sources.
5. For "conflictingClaims", sourceA and sourceB MUST come from different sources.
6. Use varied quotes. Do not use the same quote more than once.

SPEED REQUIREMENTS:
- Generate report efficiently with available data.
- Focus on key insights and conflicts using ONLY real quotes
- Provide factual, well-structured content
- Use concise but comprehensive analysis
- Incorporate multiple and various sources

${this.getOptimizedJSONStructure(validUrls.length, hasConflictingInfo)}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4.1", // Use faster model for speed
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Create an optimized research report about: ${query}. Remember: Use ONLY the exact quotes provided in the source sections above. Do not generate any quotes.` }
      ],
      max_tokens: 2500, // Reduced for speed
      response_format: { type: "json_object" },
      temperature: 0.1
    });

    const reportData = await this.parseAndValidateJSON(response.choices[0].message.content || '{}', query);
    
    // Validate that all quotes are from scraped content
    this.validateQuoteUsage(reportData, scrapedContent);
    
    return reportData;
  }

  // Validate that all quotes in the report are from scraped content
  private validateQuoteUsage(reportData: any, scrapedContent: ScrapedContent[]): void {
    console.log('🔍 VALIDATING QUOTE USAGE...');
    
    // Collect all available quotes from scraped content
    const allAvailableQuotes = scrapedContent.flatMap(content => content.quotes);
    console.log(`Available quotes from scraped content: ${allAvailableQuotes.length}`);
    
    // Check perspectives quotes
    const perspectiveQuotes = reportData.perspectives?.map((p: any) => p.quote).filter(Boolean) || [];
    console.log(`Quotes used in perspectives: ${perspectiveQuotes.length}`);
    
    perspectiveQuotes.forEach((quote: string, index: number) => {
      if (quote !== "No direct quotes available from this source" && quote !== "No direct quotes available") {
        const isValidQuote = allAvailableQuotes.some(availableQuote => 
          quote.trim() === availableQuote.trim() || 
          quote.includes(availableQuote.trim()) ||
          availableQuote.includes(quote.trim())
        );
        
        if (!isValidQuote) {
          console.warn(`⚠️ POTENTIAL GENERATED QUOTE DETECTED in perspective ${index + 1}: "${quote}"`);
        } else {
          console.log(`✅ Valid quote found in perspective ${index + 1}`);
        }
      }
    });
    
    // Check conflicting claims quotes
    const conflictingQuotes = reportData.conflictingClaims?.flatMap((claim: any) => [
      claim.sourceA?.claim,
      claim.sourceB?.claim
    ]).filter(Boolean) || [];
    
    console.log(`Quotes used in conflicting claims: ${conflictingQuotes.length}`);
    
    conflictingQuotes.forEach((quote: string, index: number) => {
      const isValidQuote = allAvailableQuotes.some(availableQuote => 
        quote.trim() === availableQuote.trim() || 
        quote.includes(availableQuote.trim()) ||
        availableQuote.includes(quote.trim())
      );
      
      if (!isValidQuote) {
        console.warn(`⚠️ POTENTIAL GENERATED QUOTE DETECTED in conflicting claim ${index + 1}: "${quote}"`);
      } else {
        console.log(`✅ Valid quote found in conflicting claim ${index + 1}`);
      }
    });
    
    console.log('🔍 Quote validation completed');
  }

  private async checkForConflictingInfo(sourceQuotesInfo: string): Promise<boolean> {
    console.log('🧐 Checking for conflicting information...');
    try {
      const systemPrompt = `Analyze the provided source information and determine if there are any conflicting claims or viewpoints.
Respond with a JSON object containing a single boolean field "hasConflictingInfo".
- If you find opposing or contradictory information, set "hasConflictingInfo" to true.
- If all information is aligned or discusses different aspects of the same topic without contradiction, set "hasConflictingInfo" to false.`;

      const userPrompt = `Here is the source information:
${sourceQuotesInfo}

Does this information contain conflicting claims?`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // Using a capable model for analysis
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_tokens: 100,
        response_format: { type: "json_object" },
        temperature: 0.0
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      const hasConflicts = result.hasConflictingInfo === true;
      
      console.log(`🤖 Conflict check result: ${hasConflicts}`);
      return hasConflicts;

    } catch (error) {
      console.error('Error checking for conflicting info:', error);
      return false; // Default to false in case of an error
    }
  }

  private getOptimizedJSONStructure(sourceCount: number, includeConflictingClaims: boolean): string {
    const conflictingClaimsStructure = includeConflictingClaims ? `
  "conflictingClaims": [
    {
      "topic": "Conflicting issue from sources",
      "sourceA": {
        "claim": "EXACT quote from Source A's AVAILABLE QUOTES",
        "source": "Source A Name (exactly as provided)",
        "url": "https://exact-source-a-url.com"
      },
      "sourceB": {
        "claim": "EXACT quote from Source B's AVAILABLE QUOTES",
        "source": "Source B Name (exactly as provided)", 
        "url": "https://exact-source-b-url.com"
      }
    }
  ],` : '';
    
    return `
REQUIRED JSON STRUCTURE (optimized):
{
  "article": {
    "title": "Clear title based on search results",
    "executiveSummary": "• Key point 1\\n• Key point 2\\n• Key point 3",
    "excerpt": "Brief summary",
    "content": "Concise article content",
    "category": "Research",
    "publishedAt": "${new Date().toISOString()}",
    "readTime": 5,
    "sourceCount": ${sourceCount}
  },
  "rawFacts": [
    {
      "category": "Key Facts",
      "fact": "From [Source Name]: [exact fact from scraped content]",
      "source": "Source Name (exactly as provided)",
      "url": "https://exact-url-from-scraped-content.com"
    }
  ],
  "timelineItems": [
    {
      "date": "YYYY-MM-DD",
      "title": "Event title from source",
      "description": "Event details from scraped content",
      "source": "Source Name (exactly as provided)",
      "url": "https://exact-url-from-scraped-content.com"
    }
  ],
  "perspectives": [
    {
      "viewpoint": "Perspective viewpoint",
      "description": "Analysis based on scraped content",
      "source": "Source Name (exactly as provided)",
      "quote": "EXACT quote from AVAILABLE QUOTES section - DO NOT GENERATE",
      "url": "https://exact-url-from-scraped-content.com",
      "color": "green"
    }
  ],
  ${conflictingClaimsStructure}
  "citedSources": [
    {
      "name": "Source name (exactly as provided)",
      "type": "Article/News/Report",
      "description": "Description based on scraped content",
      "url": "https://exact-url-from-scraped-content.com"
    }
  ]
}

⚠️ QUOTE REMINDER: Every "quote" field MUST be copied exactly from the AVAILABLE QUOTES sections above. If no suitable quote exists, use "No direct quotes available from this source" instead.`;
  }

  private async buildFinalReport(
    reportData: any, 
    query: string, 
    heroImageUrl: string, 
    sourceImages: string[]
  ): Promise<ResearchReport> {
    const slug = this.createSlug(reportData.article.title);

    // Filter out conflicting claims with "No quote" placeholders
    if (reportData.conflictingClaims && Array.isArray(reportData.conflictingClaims)) {
      const originalCount = reportData.conflictingClaims.length;
      const invalidQuotePhrase = "No direct quotes available";

      reportData.conflictingClaims = reportData.conflictingClaims.filter((claim: any) => {
        const claimA = claim.sourceA?.claim || '';
        const claimB = claim.sourceB?.claim || '';
        const isAInvalid = claimA.includes(invalidQuotePhrase);
        const isBInvalid = claimB.includes(invalidQuotePhrase);

        if (isAInvalid || isBInvalid) {
          console.log(`Filtering out conflicting claim topic "${claim.topic}" due to missing quote.`);
          return false;
        }

        // Also filter if the claims are identical
        if (claimA.trim() === claimB.trim()) {
          console.log(`Filtering out conflicting claim topic "${claim.topic}" due to identical quotes.`);
          return false;
        }

        return true;
      });

      const removedCount = originalCount - reportData.conflictingClaims.length;
      if (removedCount > 0) {
        console.log(`Removed ${removedCount} conflicting claims with invalid quotes.`);
      }
    }

    const report: ResearchReport = {
      article: {
        id: Date.now(),
        slug,
        title: reportData.article.title,
        content: reportData.article.content,
        category: reportData.article.category || "Research",
        excerpt: reportData.article.excerpt,
        heroImageUrl: heroImageUrl,
        publishedAt: reportData.article.publishedAt || new Date().toISOString(),
        readTime: reportData.article.readTime || 5,
        sourceCount: reportData.article.sourceCount || reportData.citedSources?.length || 0,
        authorName: "TIMIO Research Team",
        authorTitle: "AI Research Analyst"
      },
      executiveSummary: {
        id: Date.now(),
        articleId: Date.now(),
        points: reportData.article.executiveSummary ? 
          reportData.article.executiveSummary.split(/[•\-\n]/).map((p: string) => p.trim()).filter((p: string) => p.length > 0) : 
          ["No executive summary available."]
      },
      timelineItems: (reportData.timelineItems || []).map((item: any, index: number) => ({
        id: Date.now() + index,
        articleId: Date.now(),
        date: item.date,
        title: item.title,
        description: item.description,
        type: "event",
        sourceLabel: item.source || "Source",
        sourceUrl: item.url
      })),
      citedSources: (reportData.citedSources || []).map((source: any, index: number) => ({
        id: Date.now() + index,
        articleId: Date.now(),
        name: source.name,
        type: source.type,
        description: source.description,
        url: source.url,
        imageUrl: sourceImages[index] || 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=300&h=200&fit=crop'
      })),
      rawFacts: this.groupRawFactsByCategory(reportData.rawFacts || []),
      perspectives: this.formatPerspectives(reportData.perspectives || [], reportData.conflictingClaims || [])
    };

    return report;
  }

  private async performOptimizedSearch(query: string): Promise<any[]> {
    try {
      const baseQuery = query.length > 50 ? query.substring(0, 50) + '...' : query;
      const searchResults = await this.tavilySearch.invoke(baseQuery);
      
      let results = typeof searchResults === 'string' ? JSON.parse(searchResults) : searchResults;
      
      if (results && typeof results === 'object' && !Array.isArray(results)) {
        const arrayProp = Object.keys(results).find(key => Array.isArray(results[key]));
        if (arrayProp) {
          results = results[arrayProp];
        }
      }
      
      return Array.isArray(results) ? results.filter((result: any) => result.url && this.isValidUrl(result.url)) : [];
    } catch (error) {
      console.error('Optimized search error:', error);
      return [];
    }
  }

  // Simple caching system
  private getCachedResult(key: string): ResearchReport | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }
    return null;
  }

  private setCachedResult(key: string, data: ResearchReport): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }
}

export const tavilyResearchAgent = new TavilyResearchAgent();