import OpenAI from "openai";
import type { Article, TimelineItem, CitedSource, RawFacts, Perspective, ExecutiveSummary } from "@shared/schema";
import { pexelsService } from "./pexels-service";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ResearchReport {
  article: Article;
  executiveSummary: ExecutiveSummary;
  timelineItems: TimelineItem[];
  citedSources: CitedSource[];
  rawFacts: RawFacts[];
  perspectives: Perspective[];
}

export class SimpleWebSearchAgent {
  
  async generateResearchReport(query: string, heroImageUrl?: string): Promise<ResearchReport> {
    try {
      console.log('\n=== SIMPLE WEB SEARCH AGENT: GENERATING REPORT ===');
      console.log('Query:', query);

      const systemPrompt = `You are a professional research agent that creates comprehensive, accurate research reports using web search.

RESEARCH PROCESS:
1. SEARCH: Use web search to find current, credible sources
2. VERIFY: Cross-reference information across multiple sources
3. ANALYZE: Extract key facts, quotes, and data points
4. SYNTHESIZE: Create comprehensive research reports
5. CITE: Provide proper citations for all claims

CRITICAL RULES:
- NEVER fabricate data, quotes, or URLs
- Use only real, verifiable sources from web search
- Always provide working URLs for citations
- If you cannot find real sources, say so clearly
- Verify facts against multiple sources when possible

You must return ONLY valid JSON with this exact structure:

{
  "article": {
    "title": "Clear, factual title based on search results",
    "executiveSummary": "• Point 1\\n• Point 2\\n• Point 3",
    "content": "Comprehensive article with [source](url) citations",
    "category": "Research",
    "publishedAt": "2025-01-11T00:00:00.000Z",
    "readTime": 8,
    "sourceCount": 5
  },
  "rawFacts": [
    {
      "category": "Primary Sources",
      "fact": "From [Source Name]: [exact quote]",
      "source": "Source Name",
      "url": "https://real-working-url.com"
    }
  ],
  "timelineItems": [
    {
      "date": "2025-01-11",
      "title": "Event title",
      "description": "Event details",
      "source": "Source name",
      "url": "https://real-working-url.com"
    }
  ],
  "perspectiveGroups": [
    {
      "viewpointHeadline": "Supporters",
      "tone": "supportive",
      "articles": [
        {
          "stance": "Summary of stance",
          "publisher": "Publisher name",
          "quote": "Exact quote",
          "url": "https://real-working-url.com"
        }
      ]
    }
  ],
  "citedSources": [
    {
      "name": "Source organization",
      "type": "Primary Source",
      "description": "Description",
      "url": "https://real-working-url.com"
    }
  ]
}

URL VALIDATION:
- Only include URLs that actually work
- Test URLs before including them
- If a URL doesn't work, find an alternative source
- Never include placeholder URLs like "https://example.com"`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-search-preview",
        web_search_options: {
          user_location: {
            type: "approximate",
            approximate: {
              country: "US",
              city: "Dallas",
              region: "Texas",
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
            }
          }
        },
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: `Research and create a comprehensive report about: ${query}

IMPORTANT REQUIREMENTS:
1. Use web search to find current, credible sources
2. Verify all URLs work before including them
3. Cross-reference information across multiple sources
4. Provide exact quotes with proper attribution
5. Create a timeline of relevant events
6. Identify different perspectives on the topic
7. Return ONLY valid JSON in the specified format

CRITICAL: Return ONLY the JSON object, no additional text or explanations.`
          }
        ],
        max_tokens: 4000
      });

      const { message } = response.choices[0];
      console.log('Response length:', message.content?.length);

      // Process the response
      return await this.processResponse(message.content || '', query, heroImageUrl);
    } catch (error) {
      console.error("Simple Web Search Agent Error:", error);
      throw new Error(`Failed to generate research report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async processResponse(content: string, query: string, heroImageUrl?: string): Promise<ResearchReport> {
    try {
      console.log("Processing response...");
      
      // Extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const jsonString = jsonMatch[0];
      console.log("Extracted JSON length:", jsonString.length);

      // Parse the JSON
      let reportData;
      try {
        reportData = JSON.parse(jsonString);
      } catch (parseError) {
        console.error("JSON parse error:", parseError);
        // Try to clean and repair the JSON
        const cleanedJson = this.cleanJsonString(jsonString);
        reportData = JSON.parse(cleanedJson);
      }

      console.log("Successfully parsed report data");
      return await this.buildResearchReport(reportData, query, heroImageUrl);
    } catch (error) {
      console.error("Error processing response:", error);
      console.log("Raw content:", content);
      
      // Return a fallback report
      return this.createFallbackReport(query, heroImageUrl);
    }
  }

  private cleanJsonString(jsonString: string): string {
    // Remove markdown code blocks if present
    let cleaned = jsonString.replace(/```json\n?/, '').replace(/\n?```$/, '');
    
    // Fix common JSON issues
    cleaned = cleaned
      .replace(/,\s*}/g, '}')  // Remove trailing commas in objects
      .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
      .replace(/\\n/g, '\\\\n')  // Fix newlines
      .replace(/\\r/g, '\\\\r')  // Fix carriage returns
      .replace(/\\t/g, '\\\\t');  // Fix tabs
    
    return cleaned;
  }

  private async buildResearchReport(reportData: any, query: string, heroImageUrl?: string): Promise<ResearchReport> {
    // Validate and clean URLs
    reportData = await this.validateAndCleanUrls(reportData);

    // Create slug from title
    const slug = this.createSlug(reportData.article.title);

    // Get hero image
    const heroImageFromPexels = heroImageUrl || await pexelsService.searchImageByTopic(reportData.article.title, 0);

    // Convert executive summary to points array format
    const executiveSummaryPoints = reportData.article.executiveSummary
      ? reportData.article.executiveSummary.split('\n').filter((point: string) => point.trim().length > 0)
      : ["No executive summary available."];

    // Format the response
    const report: ResearchReport = {
      article: {
        id: Date.now(),
        slug,
        title: reportData.article.title,
        content: reportData.article.content,
        category: reportData.article.category || "Research",
        excerpt: reportData.article.excerpt,
        heroImageUrl: heroImageFromPexels,
        publishedAt: reportData.article.publishedAt || new Date().toISOString(),
        readTime: reportData.article.readTime || 8,
        sourceCount: reportData.article.sourceCount || reportData.citedSources?.length || 0,
        authorName: "TIMIO Research Team",
        authorTitle: "AI Research Analyst"
      },
      executiveSummary: {
        id: Date.now(),
        articleId: Date.now(),
        points: executiveSummaryPoints
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
      citedSources: await this.processCitedSources(reportData.citedSources || []),
      rawFacts: this.groupRawFactsByCategory(reportData.rawFacts || []),
      perspectives: this.extractPerspectivesFromGroups(reportData.perspectiveGroups || [])
    };

    return report;
  }

  private createFallbackReport(query: string, heroImageUrl?: string): ResearchReport {
    const slug = this.createSlug(`Research Report: ${query}`);
    const heroImageFromPexels = heroImageUrl || "https://images.pexels.com/photos/7618405/pexels-photo-7618405.jpeg";

    return {
      article: {
        id: Date.now(),
        slug,
        title: `Research Report: ${query}`,
        content: `Unable to generate comprehensive research report for "${query}" due to technical issues. Please try again later.`,
        category: "Research",
        excerpt: "Research report generation failed",
        heroImageUrl: heroImageFromPexels,
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

  private async validateAndCleanUrls(reportData: any): Promise<any> {
    // Validate URLs in raw facts
    if (reportData.rawFacts) {
      for (const factGroup of reportData.rawFacts) {
        if (factGroup.facts) {
          for (const fact of factGroup.facts) {
            if (fact.url && !this.isValidUrl(fact.url)) {
              fact.url = null;
              console.log(`Removed invalid URL from fact: ${fact.url}`);
            }
          }
        }
      }
    }

    // Validate URLs in timeline items
    if (reportData.timelineItems) {
      for (const item of reportData.timelineItems) {
        if (item.url && !this.isValidUrl(item.url)) {
          item.url = null;
          console.log(`Removed invalid URL from timeline item: ${item.url}`);
        }
      }
    }

    // Validate URLs in perspective groups
    if (reportData.perspectiveGroups) {
      for (const group of reportData.perspectiveGroups) {
        if (group.articles) {
          for (const article of group.articles) {
            if (article.url && !this.isValidUrl(article.url)) {
              article.url = null;
              console.log(`Removed invalid URL from perspective article: ${article.url}`);
            }
          }
        }
      }
    }

    // Validate URLs in cited sources
    if (reportData.citedSources) {
      for (const source of reportData.citedSources) {
        if (source.url && !this.isValidUrl(source.url)) {
          source.url = null;
          console.log(`Removed invalid URL from cited source: ${source.url}`);
        }
      }
    }

    return reportData;
  }

  private isValidUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private async processCitedSources(sources: any[]): Promise<CitedSource[]> {
    // Add images to all sources
    const sourcesWithImages = await Promise.all(
      sources.map(async (source, index) => ({
        id: Date.now() + index,
        articleId: Date.now(),
        name: source.name,
        type: source.type,
        description: source.description,
        url: source.url,
        imageUrl: await pexelsService.searchImageByTopic(source.name, index + 10)
      }))
    );
    
    return sourcesWithImages;
  }

  private extractPerspectivesFromGroups(perspectiveGroups: any[]): any[] {
    const perspectives: any[] = [];
    let index = 0;

    perspectiveGroups.forEach(group => {
      const groupColor = group.tone === 'supportive' ? 'green' : 
                        group.tone === 'critical' ? 'red' : 
                        group.tone === 'neutral' ? 'blue' : 'purple';

      group.articles?.forEach((article: any) => {
        perspectives.push({
          id: Date.now() + index++,
          articleId: Date.now(),
          viewpoint: group.viewpointHeadline,
          description: article.stance,
          source: article.publisher,
          quote: article.quote,
          color: groupColor,
          url: article.url
        });
      });
    });

    return perspectives;
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

  private createSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);
  }
}

export const simpleWebSearchAgent = new SimpleWebSearchAgent(); 