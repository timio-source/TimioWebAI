import { 
  users, 
  articles, 
  executiveSummary, 
  timelineItems, 
  citedSources, 
  rawFacts, 
  perspectives,
  type User, 
  type InsertUser,
  type Article,
  type InsertArticle,
  type ExecutiveSummary,
  type InsertExecutiveSummary,
  type TimelineItem,
  type InsertTimelineItem,
  type CitedSource,
  type InsertCitedSource,
  type RawFacts,
  type InsertRawFacts,
  type Perspective,
  type InsertPerspective
} from "@shared/schema";
import { RSSService } from "./rss-service";

interface ArticleData {
  article: Article;
  executiveSummary: ExecutiveSummary;
  timelineItems: TimelineItem[];
  citedSources: CitedSource[];
  rawFacts: RawFacts[];
  perspectives: Perspective[];
}

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getArticleBySlug(slug: string): Promise<ArticleData | undefined>;
  getAllArticles(): Promise<Article[]>;
  storeResearchReport(slug: string, report: ArticleData): Promise<void>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private articles: Map<string, ArticleData>;
  private currentUserId: number;
  private rssService: RSSService;
  private lastFetchTime: number = 0;
  private cacheDuration: number = 5 * 60 * 1000; // 5 minutes cache
  private rssArticles: Article[] = [];

  constructor() {
    this.users = new Map();
    this.articles = new Map();
    this.currentUserId = 1;
    this.rssService = new RSSService('https://www.google.com/alerts/feeds/18329999330306112380/624266987313125830');
    this.initializeData();
  }

  private initializeData() {
    // Initialize with the sample article data
    const sampleArticle: Article = {
      id: 1,
      title: "OpenAI Announces GPT-5 with Revolutionary Reasoning Capabilities",
      slug: "gpt-5-announcement",
      excerpt: "OpenAI has officially announced the development of GPT-5, marking a significant leap forward in artificial intelligence capabilities with unprecedented reasoning abilities.",
      content: `<p class="text-lg text-gray-700 leading-relaxed mb-6">OpenAI has officially announced the development of GPT-5, marking a significant leap forward in artificial intelligence capabilities. The new model demonstrates unprecedented reasoning abilities that could revolutionize how AI systems approach complex problem-solving tasks.</p>

<p class="text-gray-700 leading-relaxed mb-6">According to OpenAI's latest research, GPT-5 shows remarkable improvements in logical reasoning, mathematical problem-solving, and chain-of-thought processing. The model's enhanced capabilities represent a fundamental shift in how AI systems can understand and manipulate abstract concepts.</p>

<p class="text-gray-700 leading-relaxed mb-6">The announcement comes at a time when the AI industry is experiencing rapid growth and increasing competition. GPT-5's advanced reasoning capabilities are expected to set new standards for AI performance across various domains, from scientific research to creative applications.</p>`,
      category: "Technology",
      publishedAt: new Date("2024-12-20T10:00:00Z"),
      readTime: 5,
      sourceCount: 12,
      heroImageUrl: "https://images.unsplash.com/photo-1559136555-9303baea8ebd?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1200&h=600",
      authorName: "Tech News Team",
      authorTitle: "AI Research Correspondents"
    };

    const sampleExecutiveSummary: ExecutiveSummary = {
      id: 1,
      articleId: 1,
      points: [
        "OpenAI announces GPT-5 with enhanced reasoning capabilities",
        "GPT-5 shows 40% improvement in logical reasoning tasks",
        "Enhanced mathematical problem-solving capabilities",
        "Expected commercial release in Q2 2024"
      ]
    };

    const sampleTimelineItems: TimelineItem[] = [
      {
        id: 1,
        articleId: 1,
        date: new Date("2024-12-20T00:00:00Z"),
        title: "GPT-5 Announcement",
        description: "OpenAI announces o3 model with advanced reasoning capabilities",
        type: "announcement",
        sourceLabel: "Source 9",
        sourceUrl: null
      },
      {
        id: 2,
        articleId: 1,
        date: new Date("2025-02-12T00:00:00Z"),
        title: "GPT-4.5 Announcement",
        description: "OpenAI CEO Sam Altman announces GPT-4.5 (\"Orion\") as the last model without full chain-of-thought reasoning",
        type: "announcement",
        sourceLabel: "Source 9",
        sourceUrl: null
      },
      {
        id: 3,
        articleId: 1,
        date: new Date("2025-04-07T00:00:00Z"),
        title: "Release Delay",
        description: "OpenAI delays GPT-5 release due to technical issues and high demand. Confirms work on new models o3 and o4-mini",
        type: "announcement",
        sourceLabel: "Source 9",
        sourceUrl: null
      },
      {
        id: 4,
        articleId: 1,
        date: new Date("2025-06-10T00:00:00Z"),
        title: "O3-Pro Release",
        description: "OpenAI releases o3-pro API, its most expensive AI model to date",
        type: "release",
        sourceLabel: "Source 9",
        sourceUrl: null
      }
    ];

    const sampleCitedSources: CitedSource[] = [
      {
        id: 1,
        articleId: 1,
        name: "AI News Daily",
        type: "Industry Analysis",
        description: "Experts discuss the anticipated features and timeline for OpenAI's next major release, GPT-5.",
        url: "/article/openai-next-model",
        imageUrl: "https://images.unsplash.com/photo-1677442136019-21780ecad995?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=200&h=120"
      },
      {
        id: 2,
        articleId: 1,
        name: "TechCrunch",
        type: "News Analysis",
        description: "Analysis of recent advances in AI reasoning capabilities and their implications.",
        url: "/article/future-ai-reasoning",
        imageUrl: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=200&h=120"
      },
      {
        id: 3,
        articleId: 1,
        name: "The Verge",
        type: "Industry Analysis",
        description: "How GPT-5's advanced reasoning could reshape the AI industry landscape.",
        url: "/article/ai-market-impact",
        imageUrl: "https://images.unsplash.com/photo-1552664730-d307ca884978?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=200&h=120"
      }
    ];

    const sampleRawFacts: RawFacts[] = [
      {
        id: 1,
        articleId: 1,
        category: "Performance Metrics",
        facts: [
          "40% improvement in reasoning tasks",
          "25% better mathematical accuracy",
          "30% enhanced logical consistency"
        ]
      },
      {
        id: 2,
        articleId: 1,
        category: "Technical Specifications",
        facts: [
          "Advanced transformer architecture",
          "Multi-modal reasoning capabilities",
          "Enhanced safety measures"
        ]
      }
    ];

    const samplePerspectives: Perspective[] = [
      {
        id: 1,
        articleId: 1,
        viewpoint: "Industry Experts",
        description: "Praise the advancement in AI reasoning capabilities and potential applications",
        color: "green",
        url: null,
        source: null,
        quote: null,
        conflictSource: null,
        conflictQuote: null
      },
      {
        id: 2,
        articleId: 1,
        viewpoint: "AI Safety Researchers",
        description: "Emphasize the need for robust safety measures and ethical considerations",
        color: "yellow",
        url: null,
        source: null,
        quote: null,
        conflictSource: null,
        conflictQuote: null
      },
      {
        id: 3,
        articleId: 1,
        viewpoint: "Tech Analysts",
        description: "Analyze potential market impact and competitive positioning",
        color: "blue",
        url: null,
        source: null,
        quote: null,
        conflictSource: null,
        conflictQuote: null
      }
    ];

    this.articles.set("gpt-5-announcement", {
      article: sampleArticle,
      executiveSummary: sampleExecutiveSummary,
      timelineItems: sampleTimelineItems,
      citedSources: sampleCitedSources,
      rawFacts: sampleRawFacts,
      perspectives: samplePerspectives
    });

    // Add dummy "One Big Beautiful Bill" report
    const dummyArticle: Article = {
      id: 999,
      title: "Trump's 'One Big Beautiful Bill':Everything You Need to Know.",
      slug: "one-big-beautiful-bill-trump-2025",
      excerpt: "President Trump signed the 'One Big Beautiful Bill' into law on July 4, 2025, featuring permanent tax cuts, massive cuts to Medicaid and SNAP, and work requirements that could leave 12 million without health insurance by 2034.",
      content: `President Trump signed the "One Big Beautiful Bill" into law on July 4, 2025, marking what supporters call "the start of a new golden age for America" and critics denounce as "a direct and heartless assault on the American people."

The comprehensive legislation makes permanent the largest tax cuts in U.S. history while implementing the most significant reductions to Medicaid, SNAP, and the Affordable Care Act since their creation. The Congressional Budget Office estimates that 12 million Americans could lose health insurance by 2034 due to the changes.

The bill passed on strict party lines, with the Senate approving it 51-50 (with Vice President JD Vance casting the tie-breaking vote) and the House passing it 218-214, with only two House Republicans voting against it.

Key provisions include permanent extension of the 2017 Tax Cuts and Jobs Act, elimination of taxes on tips and overtime, expanded work requirements for Medicaid and SNAP, and approximately $930 billion in cuts to healthcare programs over ten years.`,
      category: "Politics",
      publishedAt: new Date("2025-07-05T00:00:00Z"),
      readTime: 8,
      sourceCount: 24,
      heroImageUrl: "/assets/gettyimages-2223448615_wide-7ca202551a6122dfb03f2969e5d59c36d278e323_1751754477125.jpg",
      authorName: "Political Research Team",
      authorTitle: "TIMIO News Analysis"
    };

    const dummyExecutiveSummary: ExecutiveSummary = {
      id: 999,
      articleId: 999,
      points: [
        "President Trump signed the 'One Big Beautiful Bill' into law on July 4, 2025",
        "Bill includes various tax cuts for both individuals and businesses",
        "Large reductions to Medicaid, SNAP, and ACA; millions may lose insurance",
        "Massive funding boost for border enforcement, ICE, and defense",
        "Rolls back clean energy incentives, boosts fossil fuels",
        "Protests and political backlash began immediately after passage"
      ]
    };

    const dummyTimelineItems: TimelineItem[] = [
      {
        id: 999,
        articleId: 999,
        date: new Date("2025-05-22T00:00:00Z"),
        title: "House Initial Passage",
        description: "House passes initial version 215-214",
        type: "legislative",
        sourceLabel: "Congressional Record",
        sourceUrl: "https://www.congress.gov/congressional-record"
      },
      {
        id: 1000,
        articleId: 999,
        date: new Date("2025-06-16T00:00:00Z"),
        title: "Senate Committee Action",
        description: "Senate Finance Committee releases final text and summary",
        type: "legislative",
        sourceLabel: "Senate Finance Committee",
        sourceUrl: "https://www.finance.senate.gov/"
      },
      {
        id: 1001,
        articleId: 999,
        date: new Date("2025-07-01T00:00:00Z"),
        title: "Senate Passage",
        description: "Senate passes revised bill 51-50, VP breaks tie",
        type: "legislative",
        sourceLabel: "Senate Clerk",
        sourceUrl: "https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_117_1.htm"
      },
      {
        id: 1002,
        articleId: 999,
        date: new Date("2025-07-02T00:00:00Z"),
        title: "House Final Passage",
        description: "House passes final bill 218-214",
        type: "legislative",
        sourceLabel: "House Clerk",
        sourceUrl: "https://clerk.house.gov/Votes"
      },
      {
        id: 1003,
        articleId: 999,
        date: new Date("2025-07-04T00:00:00Z"),
        title: "Presidential Signature",
        description: "Trump signs the bill into law on Independence Day",
        type: "signing",
        sourceLabel: "White House",
        sourceUrl: "https://www.whitehouse.gov/briefing-room/presidential-actions/"
      },
      {
        id: 1004,
        articleId: 999,
        date: new Date("2025-07-05T00:00:00Z"),
        title: "Protests Begin",
        description: "Protests and rallies against the law begin in major cities",
        type: "protest",
        sourceLabel: "Associated Press",
        sourceUrl: "https://apnews.com/"
      }
    ];

    const dummyCitedSources: CitedSource[] = [
      {
        id: 999,
        articleId: 999,
        name: "Congressional Budget Office",
        type: "Government Analysis",
        description: "Official cost estimates and coverage projections for healthcare provisions",
        url: "https://www.cbo.gov/cost-estimates",
        imageUrl: "/assets/gettyimages-2223448615_wide-7ca202551a6122dfb03f2969e5d59c36d278e323_1751754477125.jpg"
      },
      {
        id: 1000,
        articleId: 999,
        name: "White House Press Office",
        type: "Official Statement",
        description: "Presidential statements and administration policy announcements",
        url: null,
        imageUrl: "/assets/capitol_building.png"
      },
      {
        id: 1001,
        articleId: 999,
        name: "America First Policy Institute",
        type: "Policy Analysis",
        description: "Conservative policy research and legislative analysis",
        url: null,
        imageUrl: "/assets/big_beautiful_bill_logo.png"
      },
      {
        id: 1002,
        articleId: 999,
        name: "Wall Street Journal",
        type: "News Analysis",
        description: "Business community reactions and economic impact reporting",
        url: null,
        imageUrl: "/assets/placeholder_1751663094502.jpg"
      }
    ];

    const dummyRawFacts: RawFacts[] = [
      {
        id: 999,
        articleId: 999,
        category: "From the Bill Text (H.R.1, 119th Congress)",
        facts: [
          "Permanently extends individual tax rates from the 2017 Tax Cuts and Jobs Act",
          "Raises cap on state and local tax (SALT) deduction to $40,000 for incomes under $500,000 (reverts after 5 years)",
          "Creates temporary tax deductions for tips, overtime, auto loans; expires in 2028",
          "Permanent $200 increase in child tax credit",
          "Imposes 1% tax on remittances, increases tax on investment income from college endowments",
          "Phases out clean energy tax credits from the Inflation Reduction Act",
          "Increases fossil fuel incentives; opens federal land/water for oil and gas drilling",
          "Raises debt ceiling by $5 trillion",
          "Cuts Medicaid and Medicare spending",
          "Expands work requirements for SNAP; shifts some costs to states",
          "$150 billion new defense spending; $150 billion for border enforcement",
          "ICE funding increased from $10 billion to over $100 billion by 2029"
        ]
      },
      {
        id: 1000,
        articleId: 999,
        category: "Congressional Budget Office (CBO)",
        facts: [
          "Estimated the bill will increase the deficit by $2.8 trillion by 2034",
          "10.9 million Americans projected to lose health insurance coverage",
          "Largest cuts to Medicaid in history",
          "Disproportionate impact on low-income and rural Americans",
          "Cuts to Medicaid and CHIP would reduce enrollment by 10.5 million by 2034"
        ]
      }
    ];

    const dummyPerspectives: Perspective[] = [
      {
        id: 999,
        articleId: 999,
        viewpoint: "Who Benefits Most from the Bill?",
        description: "White House vs Critics",
        source: "White House",
        quote: "The largest percentage tax reduction goes to low-income and working-class Americans, putting over $10,000 a year back in the pockets of typical hardworking families.",
        color: "red",
        url: "https://whitehouse.gov",
        conflictSource: "Al Jazeera, Rolling Stone, KFF",
        conflictQuote: "Critics and independent analysts argue the bill's tax cuts disproportionately benefit the wealthy, and that the middle class and poor see far smaller gains, especially when factoring in cuts to Medicaid and social programs."
      },
      {
        id: 1000,
        articleId: 999,
        viewpoint: "Impact on Medicaid and Health Coverage",
        description: "Administration vs Independent Analysis",
        source: "White House",
        quote: "There will be no cuts to Medicaid and the bill protects and strengthens Medicaid for those who rely on it.",
        color: "blue",
        url: "https://whitehouse.gov",
        conflictSource: "H.R.1 bill text, KFF, Rolling Stone",
        conflictQuote: "The bill text and independent estimates show a 12% cut to Medicaid, with the Congressional Budget Office projecting over 10 million Americans will lose health insurance."
      },
      {
        id: 1001,
        articleId: 999,
        viewpoint: "Economic Impact and Deficit",
        description: "Treasury vs Budget Analysts",
        source: "Treasury Department, White House",
        quote: "The bill delivers historic levels of mandatory savings and reduces deficits by over $2 trillion by increasing economic growth and cutting waste, fraud, and abuse.",
        color: "green",
        url: "https://treasury.gov",
        conflictSource: "Al Jazeera, CBO via KFF",
        conflictQuote: "Multiple analyses, including the CBO, estimate the bill will increase the deficit by $2.8 to $3 trillion over the next decade."
      },
      {
        id: 1002,
        articleId: 999,
        viewpoint: "Immigration Enforcement Funding",
        description: "ICE vs Human Rights Groups",
        source: "ICE, White House",
        quote: "Unprecedented funding for border enforcement is essential for national security and protecting American communities.",
        color: "orange",
        url: "https://ice.gov",
        conflictSource: "CBS News, Governor Wes Moore",
        conflictQuote: "Critics warn the funding enables mass deportations and could lead to inhumane conditions at detention facilities."
      }
    ];

    this.articles.set("one-big-beautiful-bill-trump-2025", {
      article: dummyArticle,
      executiveSummary: dummyExecutiveSummary,
      timelineItems: dummyTimelineItems,
      citedSources: dummyCitedSources,
      rawFacts: dummyRawFacts,
      perspectives: dummyPerspectives
    });

    // Add more sample articles for the feed
    const article2: Article = {
      id: 2,
      title: "Meta's LLaMA 3 Achieves Breakthrough in Multimodal AI",
      slug: "meta-llama-3-multimodal",
      excerpt: "Meta's latest LLaMA 3 model demonstrates significant improvements in understanding and generating content across text, images, and audio modalities.",
      content: `<p>Meta's LLaMA 3 represents a major advancement in multimodal AI capabilities, offering unprecedented performance across various content types.</p>`,
      category: "Technology",
      publishedAt: new Date("2024-12-18T14:30:00Z"),
      readTime: 7,
      sourceCount: 15,
      heroImageUrl: "https://images.unsplash.com/photo-1677442136019-21780ecad995?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1200&h=600",
      authorName: "AI Research Team",
      authorTitle: "Meta AI Correspondents"
    };

    const article3: Article = {
      id: 3,
      title: "Google's Gemini Ultra Sets New Benchmarks in Code Generation",
      slug: "google-gemini-ultra-coding",
      excerpt: "Google's Gemini Ultra model achieves state-of-the-art performance on coding benchmarks, surpassing previous models in complex programming tasks.",
      content: `<p>Google's Gemini Ultra has established new standards for AI-assisted code generation with remarkable accuracy and efficiency.</p>`,
      category: "Technology",
      publishedAt: new Date("2024-12-17T09:15:00Z"),
      readTime: 6,
      sourceCount: 8,
      heroImageUrl: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1200&h=600",
      authorName: "Tech Analysis Team",
      authorTitle: "Google AI Reporters"
    };

    const article4: Article = {
      id: 4,
      title: "Anthropic's Claude 3.5 Introduces Advanced Safety Features",
      slug: "anthropic-claude-safety",
      excerpt: "Anthropic unveils Claude 3.5 with enhanced safety mechanisms and improved alignment capabilities for enterprise applications.",
      content: `<p>Anthropic's Claude 3.5 focuses on responsible AI development with robust safety features and alignment improvements.</p>`,
      category: "AI Safety",
      publishedAt: new Date("2024-12-16T11:45:00Z"),
      readTime: 4,
      sourceCount: 6,
      heroImageUrl: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1200&h=600",
      authorName: "Safety Research Team",
      authorTitle: "AI Ethics Correspondents"
    };

    const article5: Article = {
      id: 5,
      title: "Microsoft Copilot Integration Transforms Enterprise Workflows",
      slug: "microsoft-copilot-enterprise",
      excerpt: "Microsoft's Copilot AI integration across Office 365 and Azure services is revolutionizing how enterprises approach productivity and automation.",
      content: `<p>Microsoft Copilot's enterprise integration is transforming business workflows with intelligent automation and productivity enhancements.</p>`,
      category: "Enterprise",
      publishedAt: new Date("2024-12-15T16:20:00Z"),
      readTime: 5,
      sourceCount: 10,
      heroImageUrl: "https://images.unsplash.com/photo-1552664730-d307ca884978?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1200&h=600",
      authorName: "Enterprise AI Team",
      authorTitle: "Microsoft Correspondents"
    };

    const article6: Article = {
      id: 6,
      title: "Startup Raises $50M for Revolutionary AI Hardware Architecture",
      slug: "ai-hardware-startup-funding",
      excerpt: "A Silicon Valley startup secures major funding to develop next-generation AI chips designed specifically for transformer architectures.",
      content: `<p>The startup's innovative approach to AI hardware promises significant improvements in performance and energy efficiency for large language models.</p>`,
      category: "Funding",
      publishedAt: new Date("2024-12-14T13:10:00Z"),
      readTime: 3,
      sourceCount: 5,
      heroImageUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af2176?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1200&h=600",
      authorName: "Venture Capital Team",
      authorTitle: "Startup Correspondents"
    };

    // Add placeholder data for other articles (we'll only implement the main article fully)
    [article2, article3, article4, article5, article6].forEach((article, index) => {
      this.articles.set(article.slug, {
        article,
        executiveSummary: { id: article.id, articleId: article.id, points: ["Article summary coming soon"] },
        timelineItems: [
          {
            id: index * 10 + 1,
            articleId: article.id,
            date: new Date(Date.now() - 48 * 60 * 60 * 1000), // 2 days ago
            title: "Development Announced",
            description: "Initial announcement and industry reactions",
            type: "",
            sourceLabel: "TechCrunch",
            sourceUrl: null
          },
          {
            id: index * 10 + 2,
            articleId: article.id,
            date: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
            title: "Technical Details Released",
            description: "More information becomes available",
            type: "",
            sourceLabel: "The Verge",
            sourceUrl: null
          },
          {
            id: index * 10 + 3,
            articleId: article.id,
            date: new Date(Date.now() - 8 * 60 * 60 * 1000), // 8 hours ago
            title: "Market Impact",
            description: "Industry analysts weigh in on implications",
            type: "",
            sourceLabel: "Wall Street Journal",
            sourceUrl: null
          }
        ],
        citedSources: [
          {
            id: index * 10 + 1,
            articleId: article.id,
            name: "Tech Insider",
            type: "Industry Analysis",
            description: "Technical journalism and industry insights",
            url: "https://example.com/background-" + article.slug,
            imageUrl: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=300&h=200&fit=crop"
          },
          {
            id: index * 10 + 2,
            articleId: article.id,
            name: "Industry Weekly",
            type: "Business Analysis",
            description: "Industry leadership perspectives and market impact analysis",
            url: "https://example.com/opinion-" + article.slug,
            imageUrl: "https://images.unsplash.com/photo-1556761175-4b46a572b786?w=300&h=200&fit=crop"
          },
          {
            id: index * 10 + 3,
            articleId: article.id,
            name: "Technical Review",
            type: "Technical Analysis",
            description: "Detailed technical breakdown and analysis of the development",
            url: "https://example.com/analysis-" + article.slug,
            imageUrl: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=300&h=200&fit=crop"
          }
        ],
        rawFacts: [],
        perspectives: []
      });
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getArticleBySlug(slug: string): Promise<ArticleData | undefined> {
    console.log(`Looking for article with slug: ${slug}`);
    console.log(`Available articles in storage:`, Array.from(this.articles.keys()));
    
    // First check if it's one of our detailed static articles
    const staticArticle = this.articles.get(slug);
    if (staticArticle) {
      console.log(`Found static article: ${slug}`);
      return staticArticle;
    }

    // If not found in static articles, check RSS articles
    await this.getAllArticles(); // This will refresh RSS if needed
    const rssArticle = this.rssArticles.find(article => article.slug === slug);
    
    if (rssArticle) {
      // Create minimal article data structure for RSS articles
      return {
        article: rssArticle,
        executiveSummary: {
          id: rssArticle.id,
          articleId: rssArticle.id,
          points: [
            "This article is sourced from Google Alerts RSS feed",
            "Full analysis and summary available at the original source",
            "Visit the source link for complete details"
          ]
        },
        timelineItems: [
          {
            id: 1,
            articleId: rssArticle.id,
            date: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
            title: "Initial Report",
            description: "Story first reported by major news outlets",
            type: "",
            sourceLabel: "Reuters",
            sourceUrl: null
          },
          {
            id: 2,
            articleId: rssArticle.id,
            date: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
            title: "Expert Analysis",
            description: "Industry experts provide initial commentary",
            type: "",
            sourceLabel: "Bloomberg",
            sourceUrl: null
          },
          {
            id: 3,
            articleId: rssArticle.id,
            date: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6 hours ago
            title: "Market Response",
            description: "Financial markets react to the development",
            type: "",
            sourceLabel: "CNN",
            sourceUrl: null
          },
          {
            id: 4,
            articleId: rssArticle.id,
            date: new Date(),
            title: "Current Status",
            description: "Latest updates and ongoing developments",
            type: "",
            sourceLabel: "Associated Press",
            sourceUrl: null
          }
        ],
        citedSources: [
          {
            id: 1,
            articleId: rssArticle.id,
            name: "Industry Journal",
            type: "Industry Analysis",
            description: "Background research and industry context",
            url: "https://example.com/background",
            imageUrl: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=300&h=200&fit=crop"
          },
          {
            id: 2,
            articleId: rssArticle.id,
            name: "Tech Weekly",
            type: "Analysis",
            description: "Expert perspectives on implications and future impact",
            url: "https://example.com/analysis",
            imageUrl: "https://images.unsplash.com/photo-1556761175-4b46a572b786?w=300&h=200&fit=crop"
          },
          {
            id: 3,
            articleId: rssArticle.id,
            name: "Expert Views",
            type: "Expert Opinion",
            description: "Detailed analysis of long-term consequences and predictions",
            url: "https://example.com/expert-opinion",
            imageUrl: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=300&h=200&fit=crop"
          }
        ],
        rawFacts: [],
        perspectives: []
      };
    }

    return undefined;
  }

  async getAllArticles(): Promise<Article[]> {
    // Check if we need to refresh the RSS feed
    const now = Date.now();
    if (now - this.lastFetchTime > this.cacheDuration || this.rssArticles.length === 0) {
      try {
        console.log('Fetching fresh RSS data...');
        this.rssArticles = await this.rssService.fetchArticles();
        this.lastFetchTime = now;
        console.log(`Fetched ${this.rssArticles.length} articles from RSS feed`);
      } catch (error) {
        console.error('Failed to fetch RSS articles:', error);
        // If RSS fails, return the static articles as fallback
        return Array.from(this.articles.values()).map(articleData => articleData.article);
      }
    }
    
    return this.rssArticles;
  }

  async storeResearchReport(slug: string, report: ArticleData): Promise<void> {
    console.log(`Storing research report with slug: ${slug}`);

    if (this.articles.has(slug)) {
      console.log(`Overwriting existing article with slug: ${slug}`);
    }

    // Simplified representation of the report data for logging
    const reportData = {
      title: report.article.title,
      hasExecutiveSummary: !!report.executiveSummary,
      timelineItemsCount: report.timelineItems.length,
      citedSourcesCount: report.citedSources.length,
    };
    console.log(`Report data: ${JSON.stringify(reportData)}`);
    this.articles.set(slug, report);
    console.log(`Stored research report: ${slug}`);
    console.log(`Total articles in storage: ${this.articles.size}`);
    console.log(`All stored slugs:`, Array.from(this.articles.keys()));
  }
}

export const storage = new MemStorage();