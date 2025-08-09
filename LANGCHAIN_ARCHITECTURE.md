# LangChain Research Agent Architecture

## Overview
This document outlines the architecture for implementing a LangChain-based research agent to replace the current OpenAI service approach.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │ Search Bar  │  │ Article     │  │ Research    │            │
│  │             │  │ Display     │  │ Reports     │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Express.js Backend                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │ Routes      │  │ Storage     │  │ Pexels      │            │
│  │ /api/research│  │ Service     │  │ Service     │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                LangChain Research Agent                        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 Agent Orchestrator                      │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │ Research    │  │ Tool        │  │ Memory      │    │   │
│  │  │ Chain       │  │ Manager     │  │ Manager     │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                │                               │
│                                ▼                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Research Tools                       │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │ Web Search  │  │ News API    │  │ Document    │    │   │
│  │  │ Tool        │  │ Tool        │  │ Scraper     │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘    │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │ Fact        │  │ Timeline    │  │ Citation    │    │   │
│  │  │ Checker     │  │ Builder     │  │ Manager     │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                │                               │
│                                ▼                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 Output Processors                       │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │ JSON        │  │ Report      │  │ Citation    │    │   │
│  │  │ Formatter   │  │ Builder     │  │ Extractor   │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘    │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    External Services                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │ OpenAI      │  │ News APIs   │  │ Web Search  │            │
│  │ GPT-4o      │  │ (NewsAPI,   │  │ (DuckDuckGo,│            │
│  │             │  │  EventReg)  │  │  SerpAPI)   │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Agent Orchestrator
```typescript
// server/langchain/agent-orchestrator.ts
export class ResearchAgentOrchestrator {
  private researchChain: ResearchChain;
  private toolManager: ToolManager;
  private memoryManager: MemoryManager;
  
  async generateResearchReport(query: string): Promise<ResearchReport> {
    // Orchestrate the entire research process
  }
}
```

### 2. Research Chain
```typescript
// server/langchain/research-chain.ts
export class ResearchChain {
  private llm: ChatOpenAI;
  private tools: BaseTool[];
  private memory: BufferMemory;
  
  async execute(query: string): Promise<ResearchResult> {
    // Execute multi-step research process
  }
}
```

### 3. Tool Manager
```typescript
// server/langchain/tools/index.ts
export class ToolManager {
  private tools: Map<string, BaseTool>;
  
  // Web Search Tools
  private webSearchTool: WebSearchTool;
  private newsApiTool: NewsApiTool;
  private documentScraperTool: DocumentScraperTool;
  
  // Analysis Tools
  private factCheckerTool: FactCheckerTool;
  private timelineBuilderTool: TimelineBuilderTool;
  private citationManagerTool: CitationManagerTool;
}
```

## Implementation Plan

### Phase 1: Core LangChain Setup
1. Install LangChain dependencies
2. Create basic agent structure
3. Implement web search tools
4. Set up memory management

### Phase 2: Research Tools
1. Web search integration (DuckDuckGo, SerpAPI)
2. News API integration
3. Document scraping tools
4. Fact checking tools

### Phase 3: Chain Implementation
1. Research chain with multi-step reasoning
2. Tool selection and execution
3. Memory and context management
4. Output formatting

### Phase 4: Integration
1. Replace current OpenAI service
2. Update routes to use LangChain agent
3. Maintain existing API interface
4. Add monitoring and logging

## File Structure

```
server/
├── langchain/
│   ├── agent-orchestrator.ts      # Main orchestrator
│   ├── research-chain.ts          # Research execution chain
│   ├── tools/
│   │   ├── index.ts               # Tool manager
│   │   ├── web-search-tool.ts     # Web search functionality
│   │   ├── news-api-tool.ts       # News API integration
│   │   ├── document-scraper.ts    # Document scraping
│   │   ├── fact-checker.ts        # Fact verification
│   │   ├── timeline-builder.ts    # Timeline construction
│   │   └── citation-manager.ts    # Citation handling
│   ├── processors/
│   │   ├── json-formatter.ts      # JSON output formatting
│   │   ├── report-builder.ts      # Report structure building
│   │   └── citation-extractor.ts  # Citation extraction
│   ├── memory/
│   │   └── memory-manager.ts      # Context and memory management
│   └── types/
│       └── research-types.ts      # TypeScript interfaces
├── routes.ts                      # Updated to use LangChain agent
└── storage.ts                     # Unchanged
```

## Research Process Flow

### 1. Initial Query Processing
```typescript
async processQuery(query: string): Promise<ResearchPlan> {
  // Analyze query and create research plan
  // Determine required tools and steps
  // Set up initial context
}
```

### 2. Multi-Step Research Execution
```typescript
async executeResearch(plan: ResearchPlan): Promise<ResearchData> {
  // Step 1: Web search for current information
  // Step 2: News API for recent developments
  // Step 3: Document scraping for detailed sources
  // Step 4: Fact checking and verification
  // Step 5: Timeline construction
  // Step 6: Citation compilation
}
```

### 3. Output Generation
```typescript
async generateReport(data: ResearchData): Promise<ResearchReport> {
  // Format data into required structure
  // Add citations and sources
  // Generate executive summary
  // Create timeline and perspectives
}
```

## Benefits of This Architecture

### 1. Modularity
- Each tool is independent and testable
- Easy to add new research capabilities
- Clear separation of concerns

### 2. Scalability
- Can handle multiple research tasks
- Parallel tool execution
- Efficient memory management

### 3. Reliability
- Built-in error handling and retry logic
- Tool fallback mechanisms
- Comprehensive logging and monitoring

### 4. Flexibility
- Easy to customize research process
- Configurable tool selection
- Adaptable to different query types

### 5. Maintainability
- Clean, organized code structure
- Type-safe implementation
- Comprehensive documentation

## Migration Strategy

### Step 1: Parallel Implementation
- Keep existing OpenAI service
- Implement LangChain agent alongside
- A/B test both approaches

### Step 2: Gradual Migration
- Route percentage of traffic to LangChain
- Monitor performance and quality
- Gradually increase LangChain usage

### Step 3: Full Migration
- Remove OpenAI service
- Optimize LangChain implementation
- Add advanced features

## Configuration

### Environment Variables
```env
# LangChain Configuration
LANGCHAIN_TRACING_V2=true
LANGCHAIN_ENDPOINT=https://api.smith.langchain.com
LANGCHAIN_API_KEY=your_langchain_key

# Tool API Keys
SERPAPI_API_KEY=your_serpapi_key
DUCKDUCKGO_API_KEY=your_duckduckgo_key
NEWS_API_KEY=your_newsapi_key

# OpenAI Configuration
OPENAI_API_KEY=your_openai_key
```

### Agent Configuration
```typescript
const agentConfig = {
  model: "gpt-4o",
  temperature: 0.1,
  maxTokens: 4000,
  tools: ["web_search", "news_api", "document_scraper"],
  memory: "buffer",
  verbose: true
};
```

This architecture provides a robust, scalable, and maintainable foundation for your research agent while maintaining compatibility with your existing system. 