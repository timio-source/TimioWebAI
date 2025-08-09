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

export class RobustResearchAgent {
  private assistant: any;
  private thread: any;

  constructor() {
    this.initializeAssistant();
  }

  private async initializeAssistant() {
    try {
      // Create or retrieve the research assistant
      const assistants = await openai.beta.assistants.list();
      let existingAssistant = assistants.data.find(a => a.name === "Robust Research Agent");

      if (!existingAssistant) {
        this.assistant = await openai.beta.assistants.create({
          name: "Robust Research Agent",
          instructions: `You are a professional research agent that creates comprehensive, accurate research reports based on your training data.

RESEARCH PROCESS:
1. ANALYZE: Use your knowledge to provide accurate information
2. SYNTHESIZE: Create comprehensive research reports
3. CITE: Provide proper citations for all claims
4. FORMAT: Return structured JSON output

CRITICAL RULES:
- Use only factual information from your training data
- Be clear about limitations of your knowledge
- Focus on well-documented, public information
- If information is not available, say so clearly

OUTPUT FORMAT:
You must return ONLY valid JSON with this exact structure:

{
  "article": {
    "title": "Clear, factual title based on available information",
    "executiveSummary": "• Point 1\\n• Point 2\\n• Point 3",
    "content": "Comprehensive article with proper citations",
    "category": "Research",
    "publishedAt": "2025-01-11T00:00:00.000Z",
    "readTime": 8,
    "sourceCount": 3
  },
  "rawFacts": [
    {
      "category": "Key Information",
      "fact": "Factual information based on training data",
      "source": "Public records or official sources",
      "url": null
    }
  ],
  "timelineItems": [
    {
      "date": "2023-01-01",
      "title": "Significant event",
      "description": "Event details based on public information",
      "source": "Public records",
      "url": null
    }
  ],
  "perspectiveGroups": [
    {
      "viewpointHeadline": "Public Opinion",
      "tone": "neutral",
      "articles": [
        {
          "stance": "Summary of public stance",
          "publisher": "Public records",
          "quote": "Representative quote if available",
          "url": null
        }
      ]
    }
  ],
  "citedSources": [
    {
      "name": "Public records",
      "type": "Official Source",
      "description": "Based on publicly available information",
      "url": null
    }
  ]
}

IMPORTANT:
- Focus on factual, well-documented information
- Be transparent about limitations
- Use null for URLs when not available
- Provide comprehensive analysis within your knowledge scope`,
          model: "gpt-4o",
          tools: [
            {
              type: "code_interpreter"
            }
          ]
        });
      } else {
        this.assistant = existingAssistant;
      }

      console.log("Robust Research Agent initialized:", this.assistant.id);
    } catch (error) {
      console.error("Failed to initialize research agent:", error);
      throw error;
    }
  }

  async generateResearchReport(query: string, heroImageUrl?: string): Promise<ResearchReport> {
    try {
      console.log('\n=== ROBUST RESEARCH AGENT: GENERATING REPORT ===');
      console.log('Query:', query);

      // Ensure assistant is initialized
      if (!this.assistant) {
        await this.initializeAssistant();
      }

      // Create a new thread for this research task
      this.thread = await openai.beta.threads.create();

      // Add the research query to the thread
      await openai.beta.threads.messages.create(this.thread.id, {
        role: "user",
        content: `Research and create a comprehensive report about: ${query}

IMPORTANT REQUIREMENTS:
1. Use your training data to provide accurate information
2. Focus on well-documented, public facts
3. Be transparent about any limitations
4. Create a timeline of relevant events
5. Identify different perspectives on the topic
6. Return ONLY valid JSON in the specified format - no natural language

CRITICAL: You must respond with ONLY the JSON object, no additional text or explanations.`
      });

      // Run the assistant
      const run = await openai.beta.threads.runs.create(this.thread.id, {
        assistant_id: this.assistant.id
      });

      console.log("Research run started:", run.id);

      // Wait for completion with timeout
      let runStatus = await openai.beta.threads.runs.retrieve(run.id, { thread_id: this.thread.id });
      let attempts = 0;
      const maxAttempts = 30; // 60 seconds max
      
      while ((runStatus.status === "in_progress" || runStatus.status === "queued") && attempts < maxAttempts) {
        console.log("Research status:", runStatus.status, `(attempt ${attempts + 1}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        runStatus = await openai.beta.threads.runs.retrieve(run.id, { thread_id: this.thread.id });
        attempts++;
      }

      if (runStatus.status === "failed") {
        throw new Error(`Research run failed: ${runStatus.last_error?.message}`);
      }

      if (attempts >= maxAttempts) {
        throw new Error("Research run timed out");
      }

      console.log("Research completed:", runStatus.status);

      // Get the messages from the thread
      const messages = await openai.beta.threads.messages.list(this.thread.id);
      const lastMessage = messages.data[0]; // Most recent message

      if (!lastMessage || !lastMessage.content || lastMessage.content.length === 0) {
        throw new Error("No response received from research agent");
      }

      // Extract the response content
      const responseContent = lastMessage.content[0];
      
      if (responseContent.type !== "text") {
        throw new Error("Unexpected response type from research agent");
      }

      const content = responseContent.text.value;
      console.log("Agent response length:", content.length);

      // Process the response
      return await this.processAgentResponse(content, query, heroImageUrl);

    } catch (error) {
      console.error("Robust Research Agent Error:", error);
      throw new Error('Failed to generate research report');
    }
  }

  private async processAgentResponse(content: string, query: string, heroImageUrl?: string): Promise<ResearchReport> {
    console.log('Processing agent response...');
    
    let reportData: any;
    
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonString = jsonMatch[0];
        console.log('Extracted JSON string length:', jsonString.length);
        
        // Clean the JSON string
        const cleanedJson = this.cleanJsonString(jsonString);
        reportData = JSON.parse(cleanedJson);
        console.log('Successfully parsed JSON from agent response');
      } else {
        throw new Error('No JSON found in agent response');
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.error('Raw content:', content.substring(0, 500));
      
      // Create error response
      reportData = {
        article: {
          title: `Research Report: ${query}`,
          excerpt: "Unable to generate report due to technical issues.",
          content: "ERROR: Failed to parse agent response.",
          category: "Research",
          publishedAt: new Date().toISOString(),
          readTime: 1,
          sourceCount: 0,
          executiveSummary: "Unable to generate executive summary due to technical issues."
        },
        rawFacts: [],
        timelineItems: [],
        perspectiveGroups: [],
        citedSources: []
      };
    }

    return await this.buildResearchReport(reportData, query, heroImageUrl);
  }

  private cleanJsonString(jsonString: string): string {
    // Remove markdown code blocks
    let cleaned = jsonString
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    // Fix common JSON issues
    cleaned = cleaned
      .replace(/[\u2018\u2019]/g, "'")  // Smart quotes
      .replace(/[\u201C\u201D]/g, '"')  // Smart quotes
      .replace(/[\u2013\u2014]/g, '-')  // Em dashes
      .replace(/[\u2026]/g, '...')      // Ellipsis
      .replace(/\n/g, '\\n')            // Newlines
      .replace(/\r/g, '\\r')            // Carriage returns
      .replace(/\t/g, '\\t');           // Tabs

    // Remove trailing commas
    cleaned = cleaned
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/,(\s*})/g, '}');

    return cleaned;
  }

  private async buildResearchReport(reportData: any, query: string, heroImageUrl?: string): Promise<ResearchReport> {
    // Check for error response
    if (reportData.error) {
      console.error('Agent reported research failure:', reportData.message);
      reportData = {
        article: {
          title: `Research Report: ${query}`,
          excerpt: "Research failed. No report generated.",
          content: "ERROR: Research failed. No report generated.",
          category: "Research",
          publishedAt: new Date().toISOString(),
          readTime: 1,
          sourceCount: 0,
          executiveSummary: "Research failed. No executive summary available."
        },
        rawFacts: [],
        timelineItems: [],
        perspectiveGroups: [],
        citedSources: []
      };
    }

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

export const robustResearchAgent = new RobustResearchAgent(); 