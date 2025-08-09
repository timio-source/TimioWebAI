import OpenAI from "openai";
import type { Article, TimelineItem, CitedSource, RawFacts, Perspective, ExecutiveSummary } from "@shared/schema";
import { pexelsService } from "./pexels-service";
import { RSSService } from "./rss-service";
import { jsonFormatterService } from "./json-formatter-service";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ResearchReport {
  article: Article;
  executiveSummary: ExecutiveSummary;
  timelineItems: TimelineItem[];
  citedSources: CitedSource[];
  rawFacts: RawFacts[];
  perspectives: Perspective[];
}

export class OpenAIResearchService {

  // Search for real news articles from specific sources
  private async searchRealNewsArticles(query: string, sources: string[]): Promise<{ [sourceName: string]: string }> {
    const { newsSearchService } = await import('./news-search-service.js');
    const urlMap: { [sourceName: string]: string } = {};

    try {
      // Search for real articles related to the query
      const articles = await newsSearchService.searchNews(query, 10);

      // Match articles to our cited sources
      sources.forEach(sourceName => {
        const matchedArticle = articles.find((article: any) => 
          article.source.toLowerCase().includes(sourceName.toLowerCase()) ||
          sourceName.toLowerCase().includes(article.source.toLowerCase())
        );

        if (matchedArticle && matchedArticle.url) {
          urlMap[sourceName] = matchedArticle.url;
        }
      });

      console.log(`Found real article URLs for ${Object.keys(urlMap).length} sources`);
      return urlMap;
    } catch (error) {
      console.error('Error searching for real news articles:', error);
      return {};
    }
  }

  // Extract and collect all cited sources from the report
  async collectCitedSources(reportData: any): Promise<CitedSource[]> {
    try {
      // If OpenAI directly provided citedSources, use those
      if (reportData.citedSources && Array.isArray(reportData.citedSources) && reportData.citedSources.length > 0) {
        const citedSourcesWithImages = await Promise.all(
          reportData.citedSources.map(async (source: any, index: number) => {
            const imageUrl = await pexelsService.searchImageByTopic(source.name, index + 10);

            return {
              id: Date.now() + index,
              articleId: Date.now(),
              name: source.name,
              type: source.type,
              description: source.description,
              url: source.url,
              imageUrl: imageUrl
            };
          })
        );

        console.log(`Generated ${citedSourcesWithImages.length} cited sources with URLs from OpenAI`);
        return citedSourcesWithImages;
      }
      // Comprehensive source extraction from all sections
      const sourceMap = new Map<string, {name: string, type: string, description: string, url?: string}>();

      // Extract sources from raw facts
      if (reportData.rawFacts) {
        console.log('Processing raw facts for cited sources...');

        reportData.rawFacts.forEach((factGroup: any) => {
          console.log(`Processing fact group: ${factGroup.category}`);
          if (factGroup.facts && Array.isArray(factGroup.facts)) {
            factGroup.facts.forEach((fact: any, index: number) => {
              if (fact.source && !sourceMap.has(fact.source)) {
                sourceMap.set(fact.source, {
                  name: fact.source,
                  type: "Primary Source",
                  description: `Source cited for: "${fact.text?.substring(0, 50)}..."`,
                  url: fact.url
                });
              }
            });
          }
        });
      }

      // Extract sources from perspective groups
      if (reportData.perspectiveGroups) {
        console.log('Processing perspective groups for cited sources...');
        reportData.perspectiveGroups.forEach((group: any) => {
          group.articles?.forEach((article: any) => {
            if (article.publisher && !sourceMap.has(article.publisher)) {
              sourceMap.set(article.publisher, {
                name: article.publisher,
                type: "News Analysis",
                description: `${group.viewpointHeadline}: "${article.stance}"`,
                url: article.url
              });
            }
          });
        });
      }
      // Fallback for old perspectives structure
      else if (reportData.perspectives) {
        console.log('Processing perspectives for cited sources...');
        reportData.perspectives.forEach((perspective: any) => {
          if (perspective.source && !sourceMap.has(perspective.source)) {
            sourceMap.set(perspective.source, {
              name: perspective.source,
              type: "News Analysis",
              description: `Source for perspective: "${perspective.viewpoint}"`,
              url: perspective.url
            });
          }
        });
      }

      // Extract sources from timeline items
      if (reportData.timelineItems) {
        console.log('Processing timeline items for cited sources...');
        reportData.timelineItems.forEach((item: any) => {
          if (item.source && !sourceMap.has(item.source)) {
            sourceMap.set(item.source, {
              name: item.source,
              type: "Timeline Reference",
              description: `Source for: "${item.title}"`,
              url: item.url
            });
          }
        });
      }

      // Convert map to array and add images
      const citedSourcesArray = Array.from(sourceMap.values());
      console.log(`Source map contains ${citedSourcesArray.length} sources:`, citedSourcesArray.map(s => s.name));

      // Remove duplicates by URL
      const uniqueSourcesMap = new Map<string, any>();
      citedSourcesArray.forEach(source => {
        const key = source.url || source.name;
        if (!uniqueSourcesMap.has(key)) {
          uniqueSourcesMap.set(key, source);
        }
      });

      const uniqueSourcesArray = Array.from(uniqueSourcesMap.values());
      console.log(`After deduplication: ${uniqueSourcesArray.length} unique sources`);

      // Generate unique Pexels images for each source
      const citedSourcesWithImages = await Promise.all(
        uniqueSourcesArray.map(async (source, index) => {
          const imageUrl = await pexelsService.searchImageByTopic(source.name, index + 10);

          return {
            id: Date.now() + index,
            articleId: Date.now(),
            name: source.name,
            type: source.type,
            description: source.description,
            url: source.url,
            imageUrl: imageUrl
          };
        })
      );

      console.log(`Generated ${citedSourcesWithImages.length} cited sources with unique images`);
      return citedSourcesWithImages;
    } catch (error) {
      console.error('Error collecting cited sources:', error);
      return [];
    }
  }

  async generateResearchReport(query: string, heroImageUrl?: string): Promise<ResearchReport> {
    const startTime = Date.now();
    try {
      console.log('\n=== GENERATING RESEARCH REPORT ===');
      console.log('Query:', query);
      console.log('Generating comprehensive report with cited sources...');

    

            const systemPrompt = `SYSTEM ROLE: You are a real-time, non-partisan research assistant with live web browsing capability. You NEVER fabricate data, quotes, articles, or URLs. You will ONLY write content based on real articles and real public sources accessed live through your browsing ability.

      TASK: Create a real-time research report on the broader news story behind: ${query}

      ✅ REQUIRED FIRST STEP: Use your browsing capability to search "${query}". Do not proceed until you've located at least 3 credible live sources that can be quoted or linked.

      ⛔ If you cannot access live data or URLs, STOP. Return this exact error structure:
      {
        "error": true,
        "message": "ERROR: Live browsing failed. No report generated."
      }

      You must return ONLY valid JSON with this exact structure:

      {
        "article": {
          "title": "Clear, factual title based on search results",
          "executiveSummary": "• Short summary of what happened in bullet points\n• Plain English, easy to understand\n•Each bullet point on a sepperate line,
          "content": "Comprehensive article with all research findings",
          "category": "Research",
          "publishedAt": "${new Date().toISOString()}",
          "readTime": 8,
          "sourceCount": [actual number of unique sources used]
        },
        "rawFacts": [
          {
            "category": "Primary Sources",
            "fact": "From [Source Name]: [exact quote or fact as found]",
            "source": "White House Press Release",
            "url": "https://exact-url-from-search.com"
          }
        ],
        "timelineItems": [
          {
            "date": "YYYY-MM-DD",
            "title": "Event title",
            "description": "Event details - bullet point format",
            "source": "Source name",
            "url": "https://real-url-from-search.com"
          }
        ],
        "perspectiveGroups": [
          {
            "viewpointHeadline": "Pro-Policy Supporters",
            "tone": "supportive",
            "articles": [
              {
                "stance": "1-line summary of stance",
                "publisher": "Publisher name",
                "quote": "Short exact quote from article",
                "url": "https://real-article-url.com"
              }
            ]
          },
          {
            "viewpointHeadline": "Critics and Opposition",
            "tone": "critical",
            "articles": [
              {
                "stance": "1-line summary of stance",
                "publisher": "Publisher name",
                "quote": "Short exact quote from article",
                "url": "https://real-article-url.com"
              }
            ]
          }
        ],
        "conflictingClaims": [
          {
            "topic": "Number of casualties",
            "conflict": "[Source A URL] claims 50 vs [Source B URL] claims 75",
            "sourceA": {
              "claim": "50 casualties reported",
              "url": "https://source-a-url.com"
            },
            "sourceB": {
              "claim": "75 casualties reported",
              "url": "https://source-b-url.com"
            }
          }
        ],
        "citedSources": [
          {
            "name": "Source organization name",
            "type": "Primary Source",
            "description": "Government document on...",
            "url": "https://real-url.com"
          }
        ]
      }

      FORMATTING RULES:
      - Raw facts MUST start with "From [Source]: " format
      - Use only PRIMARY SOURCES: government docs, direct quotes, press releases, official bills
      - No secondhand citations (no Wikipedia, no summaries)
      - If quoting legislation, include name of bill and section
      - Group perspectives by viewpoint, not individual articles
      - 🚫 NEVER invent article titles, outlets, quotes, or URLs
      - If you cannot find real sources for a section, use empty array []`;

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
                  content: `Research and create a comprehensive report about: ${query}`
                }
              ],
              max_tokens: 4000
            });

      // Extract response
      const { message } = response.choices[0];
      console.log('Raw response length:', message.content?.length);

      // Parse JSON response
      let cleanContent = message.content || '{}';

      // Remove markdown code blocks if present
      if (cleanContent.includes('```json')) {
        cleanContent = cleanContent.replace(/```json\n?/, '').replace(/\n?```$/, '');
      }

      // Extract JSON from the response
      const jsonStart = cleanContent.indexOf('{');
      const jsonEnd = cleanContent.lastIndexOf('}');

      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        cleanContent = cleanContent.substring(jsonStart, jsonEnd + 1);
      }

      // Apply direct fix for the specific newline issue
      console.log('=== ATTEMPTING DIRECT JSON REPAIR ===');
      console.log('Before repair, first 50 chars:', cleanContent.substring(0, 50));
      
      // Handle the specific case where JSON starts with "{\n"
      if (cleanContent.startsWith('{\n')) {
        cleanContent = cleanContent.replace(/^{\n/, '{');
        console.log('✓ Fixed opening brace newline issue');
      }
      
      // Apply comprehensive newline fixes
      cleanContent = this.fixJsonNewlines(cleanContent);
      console.log('After repair, first 50 chars:', cleanContent.substring(0, 50));
      
      // Test if the repaired content can be parsed
      try {
        JSON.parse(cleanContent);
        console.log('✓ Direct repair produced valid JSON');
      } catch (testError) {
        console.log('✗ Direct repair failed, trying JSON formatter service');
        console.log('Parse error:', testError instanceof Error ? testError.message : 'Unknown error');
        console.log('Error at position:', testError instanceof Error ? testError.message.match(/position (\d+)/)?.[1] : 'Unknown');
        
        try {
          cleanContent = await jsonFormatterService.formatToValidJSON(cleanContent);
          console.log('✓ JSON formatter service successful');
        } catch (formatterError) {
          console.log('✗ JSON formatter service failed, using aggressive repair');
          cleanContent = this.aggressiveJsonRepair(cleanContent);
        }
      }

      let reportData;
      try {
        reportData = JSON.parse(cleanContent);
        console.log('Parsed report data successfully');

        // Check for error response
        if (reportData.error) {
          console.error('AI reported browsing failure:', reportData.message);
          reportData = {
            article: {
              title: `Research Report: ${query}`,
              excerpt: "Live browsing failed. No report generated.",
              content: "ERROR: Live browsing failed. No report generated.",
              category: "Research",
              publishedAt: new Date().toISOString(),
              readTime: 1,
              sourceCount: 0,
              executiveSummary: "Live browsing failed. No executive summary available."
            },
            rawFacts: [],
            timelineItems: [],
            perspectiveGroups: [],
            conflictingClaims: [],
            citedSources: []
          };
        } else {
          console.log('Number of cited sources:', reportData.citedSources?.length || 0);
          console.log('Number of raw facts:', reportData.rawFacts?.length || 0);
          console.log('Number of perspective groups:', reportData.perspectiveGroups?.length || 0);
        }
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        console.error('Error message:', parseError instanceof Error ? parseError.message : 'Unknown error');
        console.error('Error at position:', parseError instanceof Error ? parseError.message.match(/position (\d+)/)?.[1] : 'Unknown');
        
        // Show the problematic area
        if (parseError instanceof Error && parseError.message.includes('position')) {
          const pos = parseInt(parseError.message.match(/position (\d+)/)?.[1] || '0');
          const start = Math.max(0, pos - 50);
          const end = Math.min(cleanContent.length, pos + 50);
          console.error('Context around error:', cleanContent.substring(start, end));
        }

        // Try to fix JSON issues
        let fixedContent = cleanContent;

        // Try multiple repair strategies
        try {
          // Strategy 1: Fix control characters
          fixedContent = this.fixControlCharacters(fixedContent);
          
          // Strategy 2: Fix common JSON issues
          fixedContent = this.repairMalformedJson(fixedContent);
          
          reportData = JSON.parse(fixedContent);
          console.log('Successfully parsed after JSON repair');
        } catch (e) {
          console.error('Failed after all repair attempts:', e);
          
          // Try extracting just the basic structure
          try {
            const basicStructure = this.extractBasicStructure(cleanContent);
            reportData = JSON.parse(basicStructure);
            console.log('Successfully parsed basic structure');
          } catch (e2) {
            console.error('Failed to extract basic structure:', e2);
          }
        }

        // If still failing, create error response
        if (!reportData) {
          reportData = {
            article: {
              title: `Research Report: ${query}`,
              excerpt: "Unable to generate report due to technical issues.",
              content: "ERROR: Live browsing failed. No report generated.",
              category: "Research",
              publishedAt: new Date().toISOString(),
              readTime: 1,
              sourceCount: 0,
              executiveSummary: "Unable to generate executive summary due to technical issues."
            },
            rawFacts: [],
            timelineItems: [],
            perspectiveGroups: [],
            conflictingClaims: [],
            citedSources: []
          };
        }
      }

      // Process conflicting claims if present
      const conflictingClaimsText = reportData.conflictingClaims?.map((conflict: any) => 
        `\n\n**Conflicting Claims - ${conflict.topic}:**\n${conflict.conflict}\n\n${conflict.sourceA.claim} ([${conflict.sourceA.url}](${conflict.sourceA.url}))\nvs.\n${conflict.sourceB.claim} ([${conflict.sourceB.url}](${conflict.sourceB.url}))`
      ).join('') || '';

      // Add conflicting claims to article content if present
      if (conflictingClaimsText) {
        reportData.article.content += conflictingClaimsText;
      }

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
        citedSources: reportData.citedSources ? await Promise.all(
          reportData.citedSources.map(async (source: any, index: number) => ({
            id: Date.now() + index,
            articleId: Date.now(),
            name: source.name,
            type: source.type,
            description: source.description,
            url: source.url,
            imageUrl: await pexelsService.searchImageByTopic(source.name, index + 10)
          }))
        ) : await this.collectCitedSources({ ...reportData, query }),
        rawFacts: this.groupRawFactsByCategory(reportData.rawFacts || []),
        perspectives: this.extractPerspectivesFromGroups(reportData.perspectiveGroups || reportData.perspectives || [])
      };

      return report;
    } catch (error) {
      console.error('OpenAI Research Service Error:', error);
      throw new Error('Failed to generate research report');
    }
  }

  private extractPerspectivesFromGroups(perspectiveGroups: any[]): any[] {
    const perspectives: any[] = [];
    let index = 0;

    // Handle new perspectiveGroups structure
    if (perspectiveGroups.length > 0 && perspectiveGroups[0].viewpointHeadline) {
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
    } 
    // Fallback for old perspectives structure
    else if (perspectiveGroups.length > 0 && perspectiveGroups[0].viewpoint) {
      return perspectiveGroups.map((perspective: any, i: number) => ({
        id: Date.now() + i,
        articleId: Date.now(),
        viewpoint: perspective.viewpoint,
        description: perspective.description,
        source: perspective.source,
        quote: perspective.quote,
        color: perspective.color || "blue",
        url: perspective.url
      }));
    }

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

  private fixControlCharacters(content: string): string {
    // Remove control characters that break JSON parsing
    return content
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove control characters
      .replace(/\\n/g, ' ') // Replace escaped newlines with spaces
      .replace(/\\r/g, '') // Remove escaped carriage returns
      .replace(/\\t/g, ' ') // Replace escaped tabs with spaces
      .replace(/\\/g, '\\\\') // Escape remaining backslashes
      .replace(/"/g, '\\"') // Escape quotes
      .replace(/\\\\"/g, '\\"'); // Fix over-escaped quotes
  }

  private repairMalformedJson(content: string): string {
    let repaired = content;
    
    // Fix common JSON issues
    repaired = repaired
      .replace(/,\s*}/g, '}')  // Remove trailing commas in objects
      .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
      .replace(/([{,]\s*)"([^"]+)":\s*"([^"]*)"([^,}\]]*)/g, '$1"$2":"$3"')  // Fix unescaped quotes in strings
      .replace(/\\n/g, '\\\\n')  // Fix newlines
      .replace(/\\r/g, '\\\\r')  // Fix carriage returns
      .replace(/\\t/g, '\\\\t');  // Fix tabs
    
    return repaired;
  }

  private extractBasicStructure(content: string): string {
    // Extract just the basic JSON structure with minimal content
    const basicStructure = {
      article: {
        title: "Research Report",
        executiveSummary: "Unable to parse full report due to technical issues.",
        content: "Partial data retrieved.",
        category: "Research",
        publishedAt: new Date().toISOString(),
        readTime: 1,
        sourceCount: 0
      },
      rawFacts: [],
      timelineItems: [],
      perspectiveGroups: [],
      conflictingClaims: [],
      citedSources: []
    };
    
    return JSON.stringify(basicStructure);
  }

  // Comprehensive JSON response cleaning
  private cleanJsonResponse(content: string): string {
    let cleaned = content.trim();
    
    // Fix smart quotes and special characters first
    cleaned = cleaned
      .replace(/"/g, '"')
      .replace(/"/g, '"')
      .replace(/'/g, "'")
      .replace(/'/g, "'")
      .replace(/…/g, '...')
      .replace(/–/g, '-')
      .replace(/—/g, '-')
      // Remove control characters
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
    
    // Fix malformed JSON structure patterns
    cleaned = cleaned
      // Fix stray commas at the beginning
      .replace(/^\s*,/, '')
      .replace(/{\s*,/g, '{')
      .replace(/\[\s*,/g, '[')
      // Fix duplicate commas
      .replace(/,\s*,/g, ',')
      // Fix trailing commas
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']')
      // Fix missing commas between objects/arrays
      .replace(/}\s*{/g, '},{')
      .replace(/]\s*\[/g, '],[')
      .replace(/"\s*"([^:])/g, '","$1')
      // Fix property names and values
      .replace(/([^,{\[])\s*"/g, '$1,"')
      .replace(/([^,{\[])\s*\{/g, '$1,{')
      .replace(/([^,{\[])\s*\[/g, '$1,[')
      // Fix broken string concatenations
      .replace(/(["}])\s*"([^:])/g, '$1,"$2')
      .replace(/(["}])\s*\{/g, '$1,{')
      .replace(/(["}])\s*\[/g, '$1,[')
      .replace(/([}\]])\s*"([^:])/g, '$1,"$2')
      .replace(/([}\]])\s*\{/g, '$1,{')
      .replace(/([}\]])\s*\[/g, '$1,[');
    
    // Escape special characters properly
    cleaned = cleaned
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
    
    return cleaned;
  }

  // Aggressive JSON repair for severe malformation
  private aggressiveJsonRepair(content: string): string {
    // Remove all problematic characters first
    let repaired = content
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      .replace(/[…]/g, '...')
      .replace(/[–—]/g, '-')
      // Remove all stray commas
      .replace(/,+/g, ',')
      .replace(/^,|,$/g, '')
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/([{\[])\s*,/g, '$1')
      // Fix property syntax
      .replace(/([{,]\s*),/g, '$1')
      .replace(/,(\s*[,}\]])/g, '$1');
    
    // Reconstruct basic structure
    if (repaired.startsWith('{ ,')) {
      repaired = repaired.replace(/^{ ,/, '{');
    }
    
    return repaired;
  }

  // Reconstruct JSON from fragments
  private reconstructFromFragments(content: string): string {
    // Extract key-value pairs using regex
    const pairs = [];
    const keyValuePattern = /"([^"]+)"\s*:\s*("[^"]*"|[^,}]+)/g;
    let match;
    
    while ((match = keyValuePattern.exec(content)) !== null) {
      pairs.push(`"${match[1]}": ${match[2]}`);
    }
    
    if (pairs.length === 0) {
      throw new Error('No valid key-value pairs found');
    }
    
    return `{ ${pairs.join(', ')} }`;
  }

  // Direct JSON newline fixes
  private fixJsonNewlines(content: string): string {
    // Step 1: Remove all newlines that are not within string values
    let fixed = '';
    let inString = false;
    let escaped = false;
    
    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      
      if (escaped) {
        fixed += char;
        escaped = false;
        continue;
      }
      
      if (char === '\\' && inString) {
        escaped = true;
        fixed += char;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        fixed += char;
        continue;
      }
      
      if (char === '\n' && !inString) {
        // Skip newlines outside of strings
        continue;
      }
      
      if (char === '\n' && inString) {
        // Escape newlines inside strings
        fixed += '\\n';
        continue;
      }
      
      fixed += char;
    }
    
    // Step 2: Apply additional fixes
    return fixed
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      .replace(/\r/g, '')
      .replace(/\t/g, '\\t')
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']')
      .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');
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

export const openAIResearchService = new OpenAIResearchService();