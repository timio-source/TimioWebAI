import { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { langChainResearchAgent } from "./langchain/research-agent";
import { pexelsService } from "./pexels-service";

export async function registerRoutesWithLangChain(app: Express): Promise<Server> {
  // Serve static files from the built React app
  app.use(express.static("dist/public"));

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Get article by slug
  app.get("/api/article/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      const article = await storage.getArticleBySlug(slug);
      
      if (!article) {
        return res.status(404).json({ message: "Article not found" });
      }
      
      res.json(article);
    } catch (error) {
      console.error("Error fetching article:", error);
      res.status(500).json({ message: "Failed to fetch article" });
    }
  });

  // Get all articles (feed)
  app.get("/api/articles", async (req, res) => {
    try {
      const articles = await storage.getAllArticles();
      res.json(articles);
    } catch (error) {
      console.error("Error fetching articles:", error);
      res.status(500).json({ message: "Failed to fetch articles" });
    }
  });

  // Generate research report using LangChain Agent
  app.post("/api/research", async (req, res) => {
    try {
      const { query } = req.body;
      
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ message: "Query is required" });
      }

      console.log(`LangChain Agent: Generating research report for: ${query}`);
      
      // Fetch relevant image from Pexels based on the query (index 0 for main article)
      const heroImageUrl = await pexelsService.searchImageByTopic(query, 0);
      console.log(`Fetched hero image from Pexels: ${heroImageUrl}`);
      
      // Use LangChain research agent instead of OpenAI service
      const researchReport = await langChainResearchAgent.generateResearchReport(query, heroImageUrl);
      
      // Store the generated report in our storage
      await storage.storeResearchReport(researchReport.article.slug, researchReport);
      
      res.json({ slug: researchReport.article.slug });
    } catch (error) {
      console.error("Error generating research report with LangChain:", error);
      res.status(500).json({ message: "Failed to generate research report" });
    }
  });

  // A/B Testing Route - Choose between LangChain and OpenAI
  app.post("/api/research/ab-test", async (req, res) => {
    try {
      const { query, useLangChain = Math.random() > 0.5 } = req.body;
      
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ message: "Query is required" });
      }

      console.log(`A/B Test: Using ${useLangChain ? 'LangChain' : 'OpenAI'} for query: ${query}`);
      
      const heroImageUrl = await pexelsService.searchImageByTopic(query, 0);
      
      let researchReport;
      let method;
      
      if (useLangChain) {
        method = 'langchain';
        researchReport = await langChainResearchAgent.generateResearchReport(query, heroImageUrl);
      } else {
        method = 'openai';
        // Import and use the original OpenAI service
        const { openAIResearchService } = await import('./openai-service');
        researchReport = await openAIResearchService.generateResearchReport(query, heroImageUrl);
      }
      
      await storage.storeResearchReport(researchReport.article.slug, researchReport);
      
      res.json({ 
        slug: researchReport.article.slug, 
        method,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error in A/B test research:", error);
      res.status(500).json({ message: "Failed to generate research report" });
    }
  });

  // LangChain Agent Status
  app.get("/api/langchain/status", (req, res) => {
    res.json({ 
      status: "active", 
      agent: "LangChain Research Agent",
      capabilities: [
        "Web Search",
        "News Search", 
        "Fact Checking",
        "Timeline Building",
        "Citation Extraction"
      ],
      timestamp: new Date().toISOString()
    });
  });

  // Fallback route for React Router
  app.get("*", (req, res) => {
    res.sendFile("dist/public/index.html");
  });

  const httpServer = createServer(app);
  return httpServer;
} 