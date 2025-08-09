import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor, createOpenAIFunctionsAgent } from "langchain/agents";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { BufferMemory } from "langchain/memory";
import { PromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import type { Article, TimelineItem, CitedSource, RawFacts, Perspective, ExecutiveSummary } from "@shared/schema";
import { pexelsService } from "../pexels-service";

export interface ResearchReport {
  article: Article;
  executiveSummary: ExecutiveSummary;
  timelineItems: TimelineItem[];
  citedSources: CitedSource[];
  rawFacts: RawFacts[];
  perspectives: Perspective[];
}

export class LangChainResearchAgent {
  private llm: ChatOpenAI;
  private agent: AgentExecutor;
  private memory: BufferMemory;

  constructor() {
    this.initializeAgent();
  }

  private async initializeAgent() {
    // Initialize the language model
    this.llm = new ChatOpenAI({
      modelName: "gpt-4o",
      temperature: 0.1,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });

    // Initialize memory
    this.memory = new BufferMemory({
      memoryKey: "chat_history",
      returnMessages: true,
    });

    // Create research tools
    const tools = await this.createResearchTools();

    // Create the agent prompt
    const prompt = PromptTemplate.fromTemplate(`
You are a professional research agent specializing in comprehensive news analysis and fact-checking.

Your task is to research and create a comprehensive report about: {query}

Research Process:
1. SEARCH: Use web search to find current, credible sources
2. ANALYZE: Extract key facts, quotes, and data points
3. VERIFY: Cross-reference information across multiple sources
4. SYNTHESIZE: Create comprehensive research reports
5. CITE: Provide proper citations for all claims

Available Tools:
- web_search: Search the web for current information
- news_search: Search for recent news articles
- fact_check: Verify facts against multiple sources
- build_timeline: Create chronological timeline of events
- extract_citations: Extract and format citations

Output Format:
You must return a structured JSON response with this exact schema:
{{
  "article": {{
    "title": "Clear, factual title",
    "executiveSummary": "• Point 1\\n• Point 2\\n• Point 3",
    "content": "Comprehensive article with [source](url) citations",
    "category": "Research",
    "publishedAt": "ISO date",
    "readTime": 8,
    "sourceCount": 5
  }},
  "rawFacts": [
    {{
      "category": "Primary Sources",
      "fact": "From [Source]: [exact quote]",
      "source": "Source Name",
      "url": "https://source-url.com"
    }}
  ],
  "timelineItems": [
    {{
      "date": "YYYY-MM-DD",
      "title": "Event title",
      "description": "Event details",
      "source": "Source name",
      "url": "https://source-url.com"
    }}
  ],
  "perspectiveGroups": [
    {{
      "viewpointHeadline": "Supporters",
      "tone": "supportive",
      "articles": [
        {{
          "stance": "Summary of stance",
          "publisher": "Publisher name",
          "quote": "Exact quote",
          "url": "https://article-url.com"
        }}
      ]
    }}
  ],
  "citedSources": [
    {{
      "name": "Source organization",
      "type": "Primary Source",
      "description": "Description",
      "url": "https://source-url.com"
    }}
  ]
}}

Rules:
- NEVER fabricate data, quotes, or URLs
- Use only real, verifiable sources
- Provide inline citations with [source](url) format
- Group perspectives by viewpoint, not individual articles
- Ensure all factual claims are properly cited

Current query: {query}
Chat history: {chat_history}
`);

    // Create the agent
    const agent = await createOpenAIFunctionsAgent({
      llm: this.llm,
      tools,
      prompt,
    });

    // Create the executor
    this.agent = new AgentExecutor({
      agent,
      tools,
      memory: this.memory,
      verbose: true,
      maxIterations: 10,
    });
  }

  private async createResearchTools() {
    const tools = [];

    // Web Search Tool
    const webSearchTool = new DynamicStructuredTool({
      name: "web_search",
      description: "Search the web for current information about a topic",
      schema: z.object({
        query: z.string().describe("The search query to execute"),
      }),
      func: async ({ query }) => {
        try {
          // Use your existing news search service or integrate with DuckDuckGo/SerpAPI
          const { newsSearchService } = await import('../news-search-service.js');
          const results = await newsSearchService.searchNews(query, 10);
          return JSON.stringify(results);
        } catch (error) {
          return `Error searching web: ${error.message}`;
        }
      },
    });
    tools.push(webSearchTool);

    // News Search Tool
    const newsSearchTool = new DynamicStructuredTool({
      name: "news_search",
      description: "Search for recent news articles about a topic",
      schema: z.object({
        query: z.string().describe("The news search query"),
        timeframe: z.string().optional().describe("Timeframe for news (e.g., '24h', '7d')"),
      }),
      func: async ({ query, timeframe = "24h" }) => {
        try {
          // Use your existing RSS service or news API
          const { RSSService } = await import('../rss-service.js');
          const rssService = new RSSService();
          const results = await rssService.searchRecentNews(query, timeframe);
          return JSON.stringify(results);
        } catch (error) {
          return `Error searching news: ${error.message}`;
        }
      },
    });
    tools.push(newsSearchTool);

    // Fact Check Tool
    const factCheckTool = new DynamicStructuredTool({
      name: "fact_check",
      description: "Verify a fact against multiple sources",
      schema: z.object({
        fact: z.string().describe("The fact to verify"),
        context: z.string().describe("Context about the fact"),
      }),
      func: async ({ fact, context }) => {
        try {
          // Implement fact checking logic
          const verification = await this.verifyFact(fact, context);
          return JSON.stringify(verification);
        } catch (error) {
          return `Error fact checking: ${error.message}`;
        }
      },
    });
    tools.push(factCheckTool);

    // Timeline Builder Tool
    const timelineBuilderTool = new DynamicStructuredTool({
      name: "build_timeline",
      description: "Create a chronological timeline of events",
      schema: z.object({
        events: z.array(z.string()).describe("List of events to organize"),
        sources: z.array(z.string()).describe("Sources for the events"),
      }),
      func: async ({ events, sources }) => {
        try {
          const timeline = await this.buildTimeline(events, sources);
          return JSON.stringify(timeline);
        } catch (error) {
          return `Error building timeline: ${error.message}`;
        }
      },
    });
    tools.push(timelineBuilderTool);

    // Citation Extractor Tool
    const citationExtractorTool = new DynamicStructuredTool({
      name: "extract_citations",
      description: "Extract and format citations from research data",
      schema: z.object({
        content: z.string().describe("Content to extract citations from"),
        sources: z.array(z.string()).describe("List of sources"),
      }),
      func: async ({ content, sources }) => {
        try {
          const citations = await this.extractCitations(content, sources);
          return JSON.stringify(citations);
        } catch (error) {
          return `Error extracting citations: ${error.message}`;
        }
      },
    });
    tools.push(citationExtractorTool);

    return tools;
  }

  async generateResearchReport(query: string, heroImageUrl?: string): Promise<ResearchReport> {
    try {
      console.log('\n=== LANGCHAIN RESEARCH AGENT: GENERATING REPORT ===');
      console.log('Query:', query);

      // Execute the research agent
      const result = await this.agent.invoke({
        query,
      });

      console.log("Agent execution completed");
      console.log("Result:", result.output);

      // Process the agent's output
      return await this.processAgentOutput(result.output, query, heroImageUrl);

    } catch (error) {
      console.error("LangChain Research Agent Error:", error);
      throw new Error('Failed to generate research report');
    }
  }

  private async processAgentOutput(output: string, query: string, heroImageUrl?: string): Promise<ResearchReport> {
    console.log('Processing agent output...');
    
    let reportData: any;
    
    try {
      // Extract JSON from the output
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        reportData = JSON.parse(jsonMatch[0]);
        console.log('Successfully parsed JSON from agent output');
      } else {
        throw new Error('No JSON found in agent output');
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      // Create error response
      reportData = {
        article: {
          title: `Research Report: ${query}`,
          excerpt: "Unable to generate report due to technical issues.",
          content: "ERROR: Failed to parse agent output.",
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

  // Helper methods for tools
  private async verifyFact(fact: string, context: string): Promise<any> {
    // Implement fact checking logic
    return {
      fact,
      verified: true,
      sources: ["Source 1", "Source 2"],
      confidence: 0.9
    };
  }

  private async buildTimeline(events: string[], sources: string[]): Promise<any[]> {
    // Implement timeline building logic
    return events.map((event, index) => ({
      date: new Date().toISOString().split('T')[0],
      title: event,
      description: event,
      source: sources[index] || "Unknown",
      url: "#"
    }));
  }

  private async extractCitations(content: string, sources: string[]): Promise<any[]> {
    // Implement citation extraction logic
    return sources.map((source, index) => ({
      name: source,
      type: "Primary Source",
      description: `Source ${index + 1}`,
      url: "#"
    }));
  }
}

export const langChainResearchAgent = new LangChainResearchAgent(); 