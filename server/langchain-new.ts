import { ChatOpenAI } from "@langchain/openai";
import { WebBrowser } from "langchain/tools/webbrowser";
import { AgentExecutor, createOpenAIFunctionsAgent } from "langchain/agents";
import { ChatPromptTemplate, SystemMessagePromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { RetrievalQAChain } from "langchain/chains";
import { StructuredOutputParser } from "@langchain/core/output_parsers";
import { z } from "zod";
import type { Article, TimelineItem, CitedSource, RawFacts, Perspective, ExecutiveSummary } from "@shared/schema";
import { pexelsService } from "./pexels-service";

export interface ResearchReport {
  article: ArticleAPI;
  executiveSummary: ExecutiveSummary;
  timelineItems: TimelineItem[];
  citedSources: CitedSource[];
  rawFacts: RawFacts[];
  perspectives: Perspective[];
}

// Use this type for API/UI, not DB
export interface ArticleAPI {
  id: number;
  slug: string;
  title: string;
  content: string;
  category: string;
  excerpt: string;
  heroImageUrl: string;
  publishedAt: string; // ISO string for API/UI; convert to Date only at DB save
  readTime: number;
  sourceCount: number;
  authorName: string;
  authorTitle: string;
}

// Define structured output schema
const ResearchReportSchema = z.object({
  article: z.object({
    title: z.string().describe("Clear, factual title based on research"),
    executiveSummary: z.string().describe("Executive summary with bullet points separated by newlines"),
    content: z.string().describe("Comprehensive article with all research findings"),
    category: z.string().default("Research"),
    publishedAt: z.string().describe("ISO date string"),
    readTime: z.number().default(8),
    sourceCount: z.number().describe("Number of sources used")
  }),
  rawFacts: z.array(z.object({
    category: z.string().describe("Category of facts (e.g., 'Primary Sources', 'Key Developments')"),
    fact: z.string().describe("Factual information from source"),
    source: z.string().describe("Source name"),
    url: z.string().url().optional().describe("Source URL")
  })).describe("Array of factual information from sources"),
  timelineItems: z.array(z.object({
    date: z.string().describe("Date in YYYY-MM-DD format"),
    title: z.string().describe("Event title"),
    description: z.string().describe("Event details"),
    source: z.string().describe("Source name"),
    url: z.string().url().optional().describe("Source URL")
  })).describe("Chronological timeline of events"),
  perspectiveGroups: z.array(z.object({
    viewpointHeadline: z.string().describe("Headline for this viewpoint group"),
    tone: z.enum(["supportive", "critical", "neutral"]).describe("Tone of the perspective"),
    articles: z.array(z.object({
      stance: z.string().describe("Summary of stance"),
      publisher: z.string().describe("Publisher name"),
      quote: z.string().describe("Exact quote from article"),
      url: z.string().url().optional().describe("Article URL")
    })).describe("Articles representing this viewpoint")
  })).describe("Different perspectives on the topic"),
  citedSources: z.array(z.object({
    name: z.string().describe("Source organization name"),
    type: z.string().describe("Type of source (e.g., 'Primary Source', 'News Analysis')"),
    description: z.string().describe("Description of the source"),
    url: z.string().url().describe("Source URL")
  })).describe("All sources cited in the report")
});

export class LangChainNewResearchAgent {
  private model: ChatOpenAI;
  private webBrowser: WebBrowser;
  private agent!: AgentExecutor;
  private vectorStore: MemoryVectorStore | null = null;
  private outputParser: StructuredOutputParser<typeof ResearchReportSchema>;
  private embeddings: OpenAIEmbeddings;

  constructor() {
    // Initialize the model with gpt-4o for structured outputs
    this.model = new ChatOpenAI({
      modelName: "gpt-4o",
      temperature: 0.1,
      maxTokens: 4000,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });
    this.embeddings = new OpenAIEmbeddings({ openAIApiKey: process.env.OPENAI_API_KEY });
    // Initialize web browser tool for scraping
    this.webBrowser = new WebBrowser({ model: this.model, embeddings: this.embeddings });
    // Initialize structured output parser
    this.outputParser = StructuredOutputParser.fromZodSchema(ResearchReportSchema);
    this.initializeAgent();
  }

  private async initializeAgent() {
    try {
      // Get the format instructions for structured output
      const formatInstructions = this.outputParser.getFormatInstructions();

      // Use ChatPromptTemplate for the agent
      const systemPrompt = `
You are a professional research analyst with expertise in gathering and analyzing information from multiple sources. Your task is to create comprehensive research reports based on web-scraped data.

RESEARCH TASK: {query}

INSTRUCTIONS:
1. Use the web browser tool to search for and scrape relevant information about the topic
2. Visit multiple credible sources to gather comprehensive data
3. Extract key facts, quotes, and information from the scraped content
4. Organize the information into a structured research report
5. Ensure all sources are properly cited with URLs

{format_instructions}

IMPORTANT REQUIREMENTS:
- Use only real, factual information from scraped sources
- Include real URLs from the sources you visit
- Provide factual, non-partisan analysis
- Use bullet points (•) for executive summary, separated by newlines
- Ensure all sources are properly cited
- Return ONLY the structured JSON output, no additional text

Current query: {query}`;

      const prompt = ChatPromptTemplate.fromMessages([
        SystemMessagePromptTemplate.fromTemplate(systemPrompt)
      ]);

      // Create the agent with web browser tool
      const agent = await createOpenAIFunctionsAgent({
        llm: this.model,
        tools: [this.webBrowser],
        prompt,
      });

      this.agent = new AgentExecutor({
        agent,
        tools: [this.webBrowser],
        verbose: true,
        maxIterations: 8,
        returnIntermediateSteps: true,
      });

      console.log("✓ LangChain New Research Agent initialized successfully with structured outputs");
    } catch (error: unknown) {
      console.error("Failed to initialize LangChain New Research Agent:", error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  // Enhanced web scraping method
  private async scrapeWebContent(query: string): Promise<string[]> {
    const scrapedContent: string[] = [];
    
    try {
      // Search queries to find relevant content
      const searchQueries = [
        `${query} news latest`,
        `${query} developments 2024`,
        `${query} analysis facts`,
        `${query} timeline events`,
        `${query} sources official`
      ];

      for (const searchQuery of searchQueries.slice(0, 4)) { // Limit to 4 searches
        try {
          console.log(`Scraping content for: ${searchQuery}`);
          
          // Use the web browser tool to search and scrape
          const result = await this.webBrowser.invoke({
            input: `Search for and extract key information about: ${searchQuery}. Focus on recent news, facts, and analysis. Return the most relevant content.`
          });
          
          if (result && typeof result === 'string' && result.length > 100) {
            scrapedContent.push(result);
            console.log(`✓ Scraped content length: ${result.length} characters`);
          }
        } catch (error: unknown) {
          console.warn(`Failed to scrape for query "${searchQuery}":`, error instanceof Error ? error.message : String(error));
        }
      }

      console.log(`Total scraped content pieces: ${scrapedContent.length}`);
      return scrapedContent;
    } catch (error: unknown) {
      console.error("Error in web scraping:", error instanceof Error ? error.message : String(error));
      return [];
    }
  }

  // Process scraped content with vector store for better analysis
  private async processScrapedContent(scrapedContent: string[], query: string): Promise<string> {
    try {
      if (scrapedContent.length === 0) {
        throw new Error("No content was scraped");
      }

      // Create documents from scraped content
      const documents = scrapedContent.map((content, index) => ({
        pageContent: content,
        metadata: { source: `scraped_content_${index}`, query }
      }));

      // Split documents into chunks
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });

      const splitDocs = await textSplitter.splitDocuments(documents);

      // Create vector store
      const embeddings = new OpenAIEmbeddings({
        openAIApiKey: process.env.OPENAI_API_KEY,
      });

      this.vectorStore = await MemoryVectorStore.fromDocuments(splitDocs, embeddings);

      // Create retrieval chain
      const chain = RetrievalQAChain.fromLLM(
        this.model,
        this.vectorStore.asRetriever({ k: 6 })
      );

      // Query the chain for comprehensive analysis
      const analysisPrompt = `
Based on the scraped content about "${query}", analyze and extract the following information:

1. Key facts and developments
2. Timeline of events
3. Different perspectives and viewpoints
4. Credible sources and citations
5. Executive summary points

Provide a detailed analysis that covers all the important information found in the scraped content.
Focus on factual, verifiable information from the sources.
`;

      const result = await chain.invoke({
        query: analysisPrompt
      });

      return result.text || "No analysis generated";
    } catch (error: unknown) {
      console.error("Error processing scraped content:", error instanceof Error ? error.message : String(error));
      return scrapedContent.join("\n\n");
    }
  }

  async generateResearchReport(query: string, heroImageUrl?: string): Promise<ResearchReport> {
    const startTime = Date.now();
    
    try {
      console.log('\n=== LANGCHAIN NEW RESEARCH AGENT: GENERATING REPORT ===');
      console.log('Query:', query);

      // Step 1: Scrape web content
      console.log('Step 1: Scraping web content...');
      const scrapedContent = await this.scrapeWebContent(query);
      
      if (scrapedContent.length === 0) {
        throw new Error("Failed to scrape any content from the web");
      }

      // Step 2: Process scraped content
      console.log('Step 2: Processing scraped content...');
      const processedContent = await this.processScrapedContent(scrapedContent, query);

      // Step 3: Generate structured report using the agent
      console.log('Step 3: Generating structured report...');
      const agentResult = await this.agent.invoke({
        query: `Based on the following scraped content about "${query}", create a comprehensive research report in the required structured format:\n\n${processedContent.substring(0, 3000)}`
      });

      // Step 4: Parse the structured response
      console.log('Step 4: Parsing structured response...');
      const reportData = await this.parseStructuredResponse(agentResult.output);

      // Step 5: Format the final report
      console.log('Step 5: Formatting final report...');
      const report = await this.formatResearchReport(reportData, query, heroImageUrl);

      const endTime = Date.now();
      console.log(`✓ Research report generated in ${endTime - startTime}ms`);
      
      return report;
    } catch (error: unknown) {
      console.error('LangChain New Research Agent Error:', error instanceof Error ? error.message : String(error));
      
      // Return fallback report
      return this.createFallbackReport(query, error instanceof Error ? error.message : String(error));
    }
  }

  private async parseStructuredResponse(output: string): Promise<any> {
    try {
      console.log('Parsing structured response...');
      console.log('Response length:', output.length);
      // Try to parse with structured output parser first
      try {
        const parsed = await this.outputParser.parse(output);
        console.log('✓ Successfully parsed with structured output parser');
        return parsed;
      } catch (parseError: unknown) {
        console.log('Structured parser failed, trying JSON extraction...');
        let jsonContent = output;
        if (jsonContent.includes('```json')) {
          jsonContent = jsonContent.replace(/```json\n?/, '').replace(/\n?```$/, '');
        }
        const jsonStart = jsonContent.indexOf('{');
        const jsonEnd = jsonContent.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
          jsonContent = jsonContent.substring(jsonStart, jsonEnd + 1);
        }
        const parsed = JSON.parse(jsonContent);
        if (!parsed.article || !parsed.article.title) {
          throw new Error("Invalid report structure: missing article title");
        }
        console.log('✓ Successfully parsed with JSON extraction');
        return parsed;
      }
    } catch (error: unknown) {
      console.error('Error parsing structured response:', error instanceof Error ? error.message : String(error));
      console.log('Raw output:', output.substring(0, 500) + '...');
      throw new Error(`Failed to parse structured response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async formatResearchReport(reportData: any, query: string, heroImageUrl?: string): Promise<ResearchReport> {
    // Create slug from title
    const slug = this.createSlug(reportData.article.title);
    // Get hero image
    const heroImageFromPexels = heroImageUrl || await pexelsService.searchImageByTopic(reportData.article.title, 0);
    // Format the response
    const report: ResearchReport = {
      article: {
        id: Date.now(),
        slug,
        title: reportData.article.title,
        content: reportData.article.content,
        category: reportData.article.category || "Research",
        excerpt: reportData.article.excerpt || reportData.article.title,
        heroImageUrl: heroImageFromPexels,
        publishedAt: typeof reportData.article.publishedAt === 'string' ? reportData.article.publishedAt : new Date().toISOString(), // force string
        readTime: reportData.article.readTime || 8,
        sourceCount: reportData.article.sourceCount || reportData.citedSources?.length || 0,
        authorName: "TIMIO Research Team",
        authorTitle: "AI Research Analyst"
      },
      executiveSummary: {
        id: Date.now(),
        articleId: Date.now(),
        points: this.parseExecutiveSummary(reportData.article.executiveSummary)
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
      citedSources: await this.formatCitedSources(reportData.citedSources || []),
      rawFacts: this.groupRawFactsByCategory(reportData.rawFacts || []),
      perspectives: this.extractPerspectivesFromGroups(reportData.perspectiveGroups || [])
    };
    return report;
  }

  private parseExecutiveSummary(summary: string): string[] {
    if (!summary) return ["No executive summary available."];
    
    // Split by bullet points or newlines
    const points = summary
      .split(/[•\-\n]/)
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 0);
    
    return points.length > 0 ? points : [summary];
  }

  private async formatCitedSources(sources: any[]): Promise<CitedSource[]> {
    return Promise.all(
      sources.map(async (source: any, index: number) => ({
        id: Date.now() + index,
        articleId: Date.now(),
        name: source.name,
        type: source.type,
        description: source.description,
        url: source.url,
        imageUrl: await pexelsService.searchImageByTopic(source.name, index + 10)
      }))
    );
  }

  private groupRawFactsByCategory(rawFactsArray: any[]): any[] {
    const groupedFacts = rawFactsArray.reduce((acc: any, item: any) => {
      const category = item.category || 'General';
      if (!acc[category]) {
        acc[category] = [];
      }

      acc[category].push({
        text: item.fact,
        source: item.source,
        url: item.url || null
      });
      return acc;
    }, {});

    return Object.entries(groupedFacts).map(([category, facts], index) => ({
      id: Date.now() + index,
      articleId: Date.now(),
      category,
      facts: facts
    }));
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

  private createFallbackReport(query: string, errorMessage: string): ResearchReport {
    return {
      article: {
        id: Date.now(),
        slug: this.createSlug(`Research Report: ${query}`),
        title: `Research Report: ${query}`,
        content: `Unable to generate comprehensive research report due to technical issues: ${errorMessage}`,
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

  private createSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);
  }
}

export const langChainNewResearchAgent = new LangChainNewResearchAgent(); 