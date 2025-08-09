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

export class ResearchAgent {
  private assistant: any;
  private thread: any;

  constructor() {
    this.initializeAssistant();
  }

  private async initializeAssistant() {
    try {
      // Create or retrieve the research assistant
      const assistants = await openai.beta.assistants.list();
      let existingAssistant = assistants.data.find(a => a.name === "Research Agent");

      if (!existingAssistant) {
        this.assistant = await openai.beta.assistants.create({
          name: "Research Agent",
          instructions: `You are a professional research agent specializing in comprehensive news analysis and fact-checking.

Your capabilities:
- Web search for real-time information
- Code execution for data analysis
- File reading for reference materials
- Multi-step reasoning and analysis

Research Process:
1. SEARCH: Use web search to find current, credible sources
2. ANALYZE: Extract key facts, quotes, and data points
3. VERIFY: Cross-reference information across multiple sources
4. SYNTHESIZE: Create comprehensive research reports
5. CITE: Provide proper citations for all claims

Output Format:
Always return structured JSON with this exact schema:
{
  "article": {
    "title": "Clear, factual title",
    "executiveSummary": "• Point 1\n• Point 2\n• Point 3",
    "content": "Comprehensive article with [source](url) citations",
    "category": "Research",
    "publishedAt": "ISO date",
    "readTime": 8,
    "sourceCount": 5
  },
  "rawFacts": [
    {
      "category": "Primary Sources",
      "fact": "From [Source]: [exact quote]",
      "source": "Source Name",
      "url": "https://source-url.com"
    }
  ],
  "timelineItems": [
    {
      "date": "YYYY-MM-DD",
      "title": "Event title",
      "description": "Event details",
      "source": "Source name",
      "url": "https://source-url.com"
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
          "url": "https://article-url.com"
        }
      ]
    }
  ],
  "citedSources": [
    {
      "name": "Source organization",
      "type": "Primary Source",
      "description": "Description",
      "url": "https://source-url.com"
    }
  ]
}

Rules:
- NEVER fabricate data, quotes, or URLs
- Use only real, verifiable sources
- Provide inline citations with [source](url) format
- Group perspectives by viewpoint, not individual articles
- Ensure all factual claims are properly cited`,
          model: "gpt-4o",
          tools: [
            {
              type: "web_search"
            },
            {
              type: "code_interpreter"
            },
            {
              type: "retrieval"
            }
          ]
        });
      } else {
        this.assistant = existingAssistant;
      }

      console.log("Research Agent initialized:", this.assistant.id);
    } catch (error) {
      console.error("Failed to initialize research agent:", error);
      throw error;
    }
  }

  async generateResearchReport(query: string, heroImageUrl?: string): Promise<ResearchReport> {
    try {
      console.log('\n=== RESEARCH AGENT: GENERATING REPORT ===');
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

Please follow this process:
1. Search for current, credible sources about this topic
2. Extract key facts, quotes, and data points
3. Identify different perspectives and viewpoints
4. Create a timeline of relevant events
5. Compile all sources with proper citations
6. Return the complete research report in the specified JSON format

Focus on accuracy, comprehensiveness, and proper source attribution.`
      });

      // Run the assistant
      const run = await openai.beta.threads.runs.create(this.thread.id, {
        assistant_id: this.assistant.id
      });

      console.log("Research run started:", run.id);

      // Wait for completion
      let runStatus = await openai.beta.threads.runs.retrieve(this.thread.id, run.id);
      
      while (runStatus.status === "in_progress" || runStatus.status === "queued") {
        console.log("Research status:", runStatus.status);
        await new Promise(resolve => setTimeout(resolve, 2000));
        runStatus = await openai.beta.threads.runs.retrieve(this.thread.id, run.id);
      }

      if (runStatus.status === "failed") {
        throw new Error(`Research run failed: ${runStatus.last_error?.message}`);
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
      console.error("Research Agent Error:", error);
      throw new Error('Failed to generate research report');
    }
  }

  private async processAgentResponse(content: string, query: string, heroImageUrl?: string): Promise<ResearchReport> {
    console.log('Processing agent response...');
    
    let reportData: any;
    
    try {
      // Extract JSON from the response content
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        reportData = JSON.parse(jsonMatch[0]);
        console.log('Successfully parsed JSON from agent response');
      } else {
        throw new Error('No JSON found in agent response');
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
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
}

export const researchAgent = new ResearchAgent(); 