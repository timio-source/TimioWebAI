import os
import re
import json
import uuid
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional, TypedDict, Annotated
from langchain_tavily import TavilySearch
from langchain_core.messages import BaseMessage, HumanMessage, ToolMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END, START
from langgraph.prebuilt import ToolNode
from dotenv import load_dotenv
import requests
from bs4 import BeautifulSoup
from langchain_core.tools import tool
from urllib.parse import urljoin, urlparse
import time
import random

load_dotenv()

# Global variable for cache coordination with main.py
last_server_refresh = None

# Define a reducer function for merging dictionaries
def merge_reports(dict1: dict, dict2: dict) -> dict:
    return {**dict1, **dict2}

class HotTopicState(TypedDict): 
    messages: Annotated[list, lambda x, y: x + y]
    trending_events: List[Dict[str, Any]]
    hot_topics: Annotated[Optional[dict], merge_reports]
    image_urls: Optional[dict]
    generated_at: str

# Tools - functions that AI agents can call to perform specific tasks

@tool
def get_trending_news() -> List[Dict[str, Any]]:
    """Fetches trending news from TavilySearch."""
    try:
        tavily = TavilySearch(max_results=15)
        # Use more specific queries for important news
        queries = [
            "breaking news politics government policy today",
            "technology AI innovation breakthrough today", 
            "business economy markets financial news today",
            "health medical research breakthrough today",
            "international news global affairs today"
        ]
        
        all_news = []
        for query in queries:
            try:
                results = tavily.invoke(query)
                if isinstance(results, dict):
                    articles = results.get('results', [])
                elif isinstance(results, list):
                    articles = results
                else:
                    articles = []
                
                for article in articles:
                    all_news.append({
                        "title": article.get("title", "Untitled"),
                        "url": article.get("url", ""),
                        "source": article.get("source", ""),
                        "published_at": article.get("published_at", datetime.now().isoformat()),
                        "summary": article.get("content", article.get("description", "")),
                    })
            except Exception as e:
                print(f"Error with query '{query}': {e}")
                continue
                
        return all_news[:12]  # Return top 12 articles
    except Exception as e:
        print(f"Error fetching trending news from Tavily: {e}")
        return []

@tool
def extract_robust_news_image(url: str) -> str:
    """Extract images from news article URLs with enhanced robustness."""
    if not url or not url.startswith('http'):
        return None
    
    try:
        # Add random delay to avoid rate limiting
        time.sleep(random.uniform(1, 3))
        
        # Rotate User-Agent strings to avoid blocks
        user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        ]
        
        headers = {
            'User-Agent': random.choice(user_agents),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'max-age=0',
        }
        
        response = requests.get(url, timeout=8, headers=headers, allow_redirects=True)
        
        # Handle different response codes gracefully
        if response.status_code == 403:
            print(f"Access forbidden for {url}, using fallback")
            return None
        elif response.status_code == 404:
            print(f"URL not found {url}, using fallback")
            return None
        elif response.status_code != 200:
            print(f"HTTP {response.status_code} for {url}, using fallback")
            return None
            
        response.raise_for_status()
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Enhanced image selectors for better extraction
        image_selectors = [
            'meta[property="og:image"]',
            'meta[name="twitter:image"]',
            'meta[name="twitter:image:src"]',
            'meta[property="article:image"]',
            '.hero-image img',
            '.featured-image img',
            '.article-image img',
            '.lead-image img',
            '.story-image img',
            'article img[src*="cdn"]',
            'article img[src*="static"]',
            '.content img[src*="cdn"]',
            '.main-content img'
        ]
        
        for selector in image_selectors:
            if selector.startswith('meta'):
                meta_tag = soup.select_one(selector)
                if meta_tag and meta_tag.get('content'):
                    img_url = meta_tag.get('content')
                    if img_url and img_url.startswith('http') and not any(x in img_url.lower() for x in ['icon', 'logo', 'avatar', 'favicon']):
                        return img_url
            else:
                img_tags = soup.select(selector)
                for img in img_tags[:3]:  # Check first 3 images only
                    src = img.get('src') or img.get('data-src') or img.get('data-lazy-src')
                    if src:
                        # Convert relative URLs to absolute
                        if src.startswith('//'):
                            src = 'https:' + src
                        elif src.startswith('/'):
                            src = urljoin(url, src)
                        elif not src.startswith('http'):
                            src = urljoin(url, src)
                        
                        # Enhanced filtering
                        if (src.startswith('http') and 
                            not any(x in src.lower() for x in ['icon', 'logo', 'avatar', 'pixel.gif', 'tracking', 'analytics', 'favicon', '1x1']) and
                            any(x in src.lower() for x in ['.jpg', '.jpeg', '.png', '.webp'])):
                            return src
                    
    except requests.RequestException as e:
        print(f"Request failed for {url}: {e}")
    except Exception as e:
        print(f"Error extracting images from {url}: {e}")
    
    return None

@tool
def generate_enhanced_contextual_image(category: str, headline: str) -> str:
    """Generate enhanced contextual images for news topics with better category mapping."""
    
    # More specific category-based image mapping
    category_images = {
        "politics": "https://source.unsplash.com/1200x800/?government,politics,capitol,voting",
        "technology": "https://source.unsplash.com/1200x800/?technology,ai,computer,innovation,digital",
        "business": "https://source.unsplash.com/1200x800/?business,finance,market,economy,office",
        "health": "https://source.unsplash.com/1200x800/?medical,health,hospital,research,science",
        "environment": "https://source.unsplash.com/1200x800/?environment,nature,climate,renewable,green",
        "international": "https://source.unsplash.com/1200x800/?world,global,international,diplomacy,flags",
        "education": "https://source.unsplash.com/1200x800/?education,university,research,books,learning",
        "general": "https://source.unsplash.com/1200x800/?news,newspaper,media,journalism"
    }
    
    category_key = category.lower()
    
    # Try category-specific first, then general
    if category_key in category_images:
        return category_images[category_key]
    else:
        return category_images["general"]

def is_newsworthy(event: Dict[str, Any]) -> bool:
    """Determines if an event is newsworthy and important."""
    title = event.get("title", "").lower()
    summary = event.get("summary", "").lower()
    
    # Filter out celebrity and entertainment news
    celebrity_keywords = [
        "celebrity", "actor", "actress", "singer", "musician", "artist", "band", 
        "movie", "film", "hollywood", "entertainment", "award", "oscar", "grammy",
        "kardashian", "beyonce", "taylor swift", "kanye", "bieber", "drake",
        "netflix", "disney", "streaming", "tv show", "series", "premiere"
    ]
    
    sports_keywords = [
        "football", "basketball", "baseball", "soccer", "tennis", "golf",
        "nfl", "nba", "mlb", "fifa", "olympics", "championship", "tournament",
        "player", "team", "coach", "game", "match", "score", "playoff"
    ]
    
    # Check if it contains celebrity or sports content
    text_content = f"{title} {summary}"
    if any(keyword in text_content for keyword in celebrity_keywords + sports_keywords):
        return False
    
    # Prioritize important news categories
    important_keywords = [
        "government", "policy", "election", "president", "congress", "senate",
        "technology", "ai", "artificial intelligence", "breakthrough", "innovation",
        "economy", "market", "inflation", "recession", "gdp", "federal reserve",
        "health", "medical", "vaccine", "pandemic", "research", "disease",
        "climate", "environment", "global warming", "carbon", "renewable",
        "international", "war", "conflict", "diplomacy", "trade", "sanctions",
        "education", "university", "research", "study", "scientific"
    ]
    
    return any(keyword in text_content for keyword in important_keywords)

@tool
def filter_relevant_events(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Filters events for relevance and importance."""
    relevant_events = []
   
    for event in events:
        if is_newsworthy(event):
            relevant_events.append(event)
    
    return relevant_events[:8]

@tool
def categorize_event(event: Dict[str, Any]) -> str:
    """Categorizes an event into important categories."""
    title = event.get("title", "").lower()
    summary = event.get("summary", "").lower()
    text = f"{title} {summary}"
    
    if any(word in text for word in ["trump", "biden", "congress", "election", "policy", "senate", "house", "democrat", "republican", "president", "government", "supreme court"]):
        return "Politics"
    elif any(word in text for word in ["ai", "technology", "software", "digital", "tech", "artificial intelligence", "machine learning", "algorithm", "innovation", "cybersecurity", "blockchain"]):
        return "Technology"
    elif any(word in text for word in ["economy", "market", "business", "trade", "economic", "stock", "finance", "investment", "inflation", "recession", "fed", "gdp"]):
        return "Business"
    elif any(word in text for word in ["health", "medical", "covid", "vaccine", "diagnosis", "hospital", "doctor", "patient", "treatment", "disease", "medicine", "pharmaceutical", "research"]):
        return "Health"
    elif any(word in text for word in ["climate", "environment", "carbon", "emissions", "global warming", "renewable", "solar", "wind", "pollution", "sustainability"]):
        return "Environment"
    elif any(word in text for word in ["war", "military", "defense", "weapon", "conflict", "peace", "diplomacy", "international", "foreign", "russia", "china", "ukraine", "nato"]):
        return "International"
    elif any(word in text for word in ["education", "school", "university", "student", "teacher", "college", "degree", "academic", "research", "study", "science"]):
        return "Education"
    else:
        return "General"

# Improved Hot Topic Generator Prompt
HOT_TOPIC_PROMPT = """You are an elite news curator for important global events. Your mission is to create compelling headlines for NEWS THAT MATTERS.

STRICT FILTERING RULES:
- NO celebrity gossip, entertainment news, or pop culture
- NO sports scores, games, or athlete personal stories  
- NO movie releases, TV shows, or streaming content
- FOCUS ONLY on news that impacts society, economy, politics, technology, health, or global affairs

PRIORITY TOPICS:
1. Government policy and political developments
2. Technological breakthroughs and AI advances
3. Economic indicators and market impacts
4. Medical research and health policy
5. International relations and global conflicts
6. Environmental and climate developments
7. Educational and scientific discoveries

Generate 6-8 diverse topics that would be featured on the front page of a serious newspaper.

You MUST generate ONLY valid JSON output with NO commentary or explanations.

FORMAT:
```json
[
  {{
    "headline": "Compelling, serious news headline",
    "description": "Two sentence description explaining the significance and impact.",
    "category": "Politics/Technology/Business/Health/Environment/International/Education/General",
    "source_url": "URL of the original news source"
  }}
]
```

Generate exactly 6-8 important news topics from the provided events."""

# Agent Creation Functions
def create_hot_topic_agent(llm, tools):
    prompt = ChatPromptTemplate.from_messages([
        ("system", HOT_TOPIC_PROMPT),
        MessagesPlaceholder(variable_name="messages"),
    ])
    return prompt | llm

# Node Functions
def trending_news_node(state: HotTopicState):
    """Fetches trending news from various sources."""
    print("--- FETCHING IMPORTANT NEWS ---")
    events = get_trending_news.invoke({})
    print(f"--- FETCHED {len(events)} TOTAL NEWS ARTICLES ---")
    return {"trending_events": events, "messages": []}

def event_filter_node(state: HotTopicState):
    """Filters events for importance and relevance."""
    print("--- FILTERING FOR IMPORTANT NEWS ---")
    filtered_events = filter_relevant_events.invoke({"events": state['trending_events']})
    print(f"--- FILTERED TO {len(filtered_events)} IMPORTANT ARTICLES ---")
    return {"trending_events": filtered_events, "messages": []}

def hot_topic_generator_node(state: HotTopicState):
    """Generates hot topic headlines and descriptions."""
    print("--- GENERATING IMPORTANT HOT TOPICS ---")
    
    # Create agent
    llm = ChatOpenAI(model="gpt-4o", temperature=0.7)
    tools = [get_trending_news, filter_relevant_events, categorize_event]
    agent = create_hot_topic_agent(llm, tools)
    
    # Prepare message with events
    events_text = "\n\n".join([
        f"Title: {event['title']}\nSummary: {event['summary']}\nSource: {event['source']}\nURL: {event.get('url', '')}"
        for event in state['trending_events']
    ])
    print(f"--- EVENTS BEING SENT TO AGENT: {len(state['trending_events'])} events ---")
    
    message = HumanMessage(content=f"Generate 6-8 diverse HOT TOPICS focusing on IMPORTANT NEWS from these events:\n\n{events_text}")
    result = agent.invoke({"messages": [message]})
    
    # Parse the result to extract hot topics
    try:
        if hasattr(result, 'content'):
            data_str = result.content
        else:
            data_str = str(result)
            
        print(f"--- RAW RESPONSE FOR HOT TOPICS ---")
        print(data_str[:500] + "..." if len(data_str) > 500 else data_str)
        print(f"--- END RAW RESPONSE ---")
            
        # Clean the string if it's wrapped in markdown
        if data_str.strip().startswith("```"):
            match = re.search(r'```(json)?\s*\n(.*?)\n\s*```', data_str, re.DOTALL)
            if match:
                data_str = match.group(2)
        
        # Clean up the JSON string
        data_str = data_str.strip()
        if not data_str.startswith('['):
            if data_str.startswith('{'):
                data_str = '[' + data_str + ']'
        
        hot_topics = json.loads(data_str)
        
        # Ensure it's in the right format
        if isinstance(hot_topics, list):
            topics_data = {"topics": hot_topics}
        else:
            topics_data = hot_topics
            
        print(f"--- GENERATED {len(topics_data.get('topics', []))} HOT TOPICS ---")
        return {"hot_topics": topics_data, "messages": [result]}
    except (json.JSONDecodeError, AttributeError) as e:
        error_message = f"Error parsing hot topics: {e}"
        print(f"--- ERROR PARSING HOT TOPICS: {error_message} ---")
        # Return a fallback structure with important news
        fallback_topics = {
            "topics": [
                {
                    "headline": "Global Economic Indicators Show Mixed Signals",
                    "description": "Recent economic data reveals varying trends across major markets. Analysts are closely monitoring inflation rates and employment figures.",
                    "category": "Business",
                    "source_url": "https://example.com"
                },
                {
                    "headline": "Technological Breakthrough in AI Research",
                    "description": "Scientists have made significant advances in artificial intelligence capabilities. This development could impact multiple industries.",
                    "category": "Technology", 
                    "source_url": "https://example.com"
                }
            ]
        }
        return {"hot_topics": fallback_topics, "messages": [result]}

def image_fetcher_node(state: HotTopicState):
    """Fetches contextual images for hot topics with enhanced robustness."""
    print("--- FETCHING CONTEXTUAL IMAGES ---")
    
    image_urls = {}
    
    if state.get('hot_topics') and 'topics' in state['hot_topics']:
        for i, topic in enumerate(state['hot_topics']['topics']):
            category = topic.get('category', 'General')
            headline = topic.get('headline', '')
            source_url = topic.get('source_url', '')
            
            image_found = False
            
            # Strategy 1: Try to extract image from the source URL
            if source_url and source_url.startswith('http'):
                try:
                    extracted_image = extract_robust_news_image.invoke({"url": source_url})
                    if extracted_image and extracted_image.startswith('http'):
                        image_urls[f"topic_{i}"] = extracted_image
                        print(f"--- EXTRACTED IMAGE FOR TOPIC {i} FROM SOURCE ---")
                        image_found = True
                except Exception as e:
                    print(f"--- ERROR EXTRACTING IMAGE FOR TOPIC {i}: {e} ---")
            
            # Strategy 2: Use Microlink as fallback
            if not image_found and source_url and source_url.startswith('http'):
                try:
                    microlink_url = f"https://api.microlink.io/?url={source_url}&meta=false&embed=image.url"
                    # Test the microlink URL
                    response = requests.head(microlink_url, timeout=5)
                    if response.status_code == 200:
                        image_urls[f"topic_{i}"] = microlink_url
                        print(f"--- USED MICROLINK IMAGE FOR TOPIC {i} ---")
                        image_found = True
                except Exception as e:
                    print(f"--- MICROLINK FAILED FOR TOPIC {i}: {e} ---")
            
            # Strategy 3: Generate contextual image based on category
            if not image_found:
                try:
                    contextual_image = generate_enhanced_contextual_image.invoke({
                        "category": category,
                        "headline": headline
                    })
                    image_urls[f"topic_{i}"] = contextual_image
                    print(f"--- GENERATED CONTEXTUAL IMAGE FOR TOPIC {i} ---")
                except Exception as e:
                    print(f"--- ERROR GENERATING CONTEXTUAL IMAGE FOR TOPIC {i}: {e} ---")
                    # Final fallback
                    image_urls[f"topic_{i}"] = "https://source.unsplash.com/1200x800/?news,newspaper"
    
    print(f"--- TOTAL IMAGES FETCHED: {len(image_urls)} ---")
    return {"image_urls": image_urls, "messages": []}

def aggregator_node(state: HotTopicState):
    """Combines all data into final hot topics."""
    print("--- AGGREGATING HOT TOPICS ---")
    
    final_topics = []
    if state.get('hot_topics') and 'topics' in state['hot_topics']:
        for i, topic in enumerate(state['hot_topics']['topics']):
            # Get image URL with enhanced fallback
            image_url = state.get('image_urls', {}).get(f"topic_{i}")
            if not image_url:
                # Final fallback based on category
                category = topic.get('category', 'General').lower()
                image_url = generate_enhanced_contextual_image.invoke({
                    "category": category,
                    "headline": topic.get('headline', '')
                })
            
            topic_with_image = {
                **topic,
                "id": str(uuid.uuid4()),
                "image_url": image_url,
                "generated_at": state.get('generated_at', datetime.now().isoformat())
            }
            final_topics.append(topic_with_image)
    
    print(f"--- FINAL AGGREGATED TOPICS: {len(final_topics)} ---")
    return {"hot_topics": {"topics": final_topics}, "messages": []}

# Graph Construction
def create_hot_topics_workflow():
    """Creates and returns the hot topics workflow graph."""
    llm = ChatOpenAI(model="gpt-4o", temperature=0.3)
    
    workflow = StateGraph(HotTopicState)
    
    workflow.add_node("trending_news", trending_news_node)
    workflow.add_node("event_filter", event_filter_node)
    workflow.add_node("hot_topic_generator", hot_topic_generator_node)
    workflow.add_node("image_fetcher", image_fetcher_node)
    workflow.add_node("aggregator", aggregator_node)
    
    workflow.add_edge(START, "trending_news")
    workflow.add_edge("trending_news", "event_filter")
    workflow.add_edge("event_filter", "hot_topic_generator")
    workflow.add_edge("hot_topic_generator", "image_fetcher")
    workflow.add_edge("image_fetcher", "aggregator")
    workflow.add_edge("aggregator", END)
    
    return workflow.compile()

# Hot Topics Manager
class HotTopicsManager:
    def __init__(self):
        print("--- INITIALIZING HOT TOPICS MANAGER ---")
        try:
            self.workflow = create_hot_topics_workflow()
            self.cache = {}
            self.last_generated = None
            print("--- HOT TOPICS MANAGER INITIALIZED ---")
        except Exception as e:
            print(f"--- ERROR INITIALIZING MANAGER: {e} ---")
            self.workflow = None
            self.cache = {}
            self.last_generated = None
    
    def generate_daily_topics(self):
        """Runs the workflow to generate important hot topics."""
        print("--- GENERATING IMPORTANT DAILY HOT TOPICS ---")
        
        if not self.workflow:
            print("--- WORKFLOW NOT INITIALIZED ---")
            return {"topics": []}
        
        try:
            initial_state = {
                "messages": [],
                "trending_events": [],
                "hot_topics": {},
                "image_urls": {},
                "generated_at": datetime.now().isoformat()
            }
            
            final_state = self.workflow.invoke(initial_state)
            
            self.cache = final_state.get('hot_topics', {})
            self.last_generated = datetime.now()
            
            topics_count = len(self.cache.get('topics', []))
            print(f"--- GENERATED {topics_count} IMPORTANT HOT TOPICS ---")
            return self.cache
        except Exception as e:
            print(f"--- ERROR GENERATING TOPICS: {e} ---")
            return {"topics": []}
    
    def get_cached_topics(self):
        """Returns cached hot topics or generates new ones."""
        # Force generation if cache is empty or old
        if (self.last_generated is None or 
            datetime.now() - self.last_generated > timedelta(hours=4) or  # More frequent generation
            not self.cache or
            len(self.cache.get('topics', [])) == 0):
            return self.generate_daily_topics()
        
        return self.cache

# Initialize the manager
print("--- STARTING HOT TOPICS INITIALIZATION ---")
hot_topics_manager = HotTopicsManager()

# FastAPI Application
app = FastAPI(
    title="Important News Hot Topics API",
    description="AI-powered important news topics generator with enhanced image extraction",
    version="2.1.0"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:8080",
        "https://timio-web-ai.vercel.app",
        "https://timio-web-ai-klcl.vercel.app",
        "https://timio-web-ai-three.vercel.app",
        "*"
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"],
    allow_headers=["*"],
)

# Health check endpoint
@app.get("/")
def read_root():
    """Health check endpoint."""
    return {
        "message": "Important News Hot Topics API is running",
        "version": "2.1.0",
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "focus": "Important news only - no celebrity, sports, or entertainment",
        "image_strategy": "Enhanced contextual extraction with robust fallbacks"
    }

@app.get("/health")
def health_check():
    """Detailed health check."""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "cache_status": "active" if hot_topics_manager.cache else "empty",
        "last_generated": hot_topics_manager.last_generated.isoformat() if hot_topics_manager.last_generated else None,
        "topics_count": len(hot_topics_manager.cache.get('topics', [])),
        "workflow_status": "initialized" if hot_topics_manager.workflow else "failed",
        "image_strategy": "News source extraction + Microlink + Enhanced Unsplash fallback"
    }

@app.get("/api/feed")
def get_feed():
    """Returns important hot topics as a list of articles for the frontend."""
    global last_server_refresh
    
    print("--- /API/FEED ENDPOINT HIT ---")
    
    # Check if it's time for universal refresh
    current_time = datetime.now()
    current_hour = current_time.hour
    current_minute = current_time.minute
    
    # Set refresh time (e.g., 2:00 AM every day)
    REFRESH_HOUR = 2
    REFRESH_MINUTE = 0
    
    # Check if it's refresh time
    should_refresh = False
    if (current_hour == REFRESH_HOUR and 
        current_minute < 5 and  # 5-minute window
        (last_server_refresh is None or 
         current_time.date() > last_server_refresh.date())):
        
        should_refresh = True
        last_server_refresh = current_time
        print(f"Server refresh triggered at {current_time}")
        
        # Clear the cache to force fresh data
        hot_topics_manager.cache = {}
        hot_topics_manager.last_generated = None
        print("Cache cleared for fresh generation")
    
    try:
        topics_data = hot_topics_manager.get_cached_topics()
        topics = topics_data.get('topics', [])
        articles = []
        
        for topic in topics:
            # Create slug from headline
            slug = re.sub(r'[^a-zA-Z0-9\s-]', '', topic.get("headline", "")).lower().replace(" ", "-").replace("--", "-").strip("-")
            
            article = {
                "id": topic.get("id", str(uuid.uuid4())),
                "title": topic.get("headline", "Important News Update"),
                "slug": slug,
                "excerpt": topic.get("description", "Important news development."),
                "category": topic.get("category", "General"),
                "publishedAt": topic.get("generated_at", datetime.now().isoformat()),
                "readTime": 3,
                "sourceCount": 1,
                "heroImageUrl": topic.get("image_url", "https://source.unsplash.com/1200x800/?news,newspaper"),
                "authorName": "AI News Curator",
                "authorTitle": "Important News Generator"
            }
            articles.append(article)
        
        print(f"--- RETURNING {len(articles)} IMPORTANT NEWS ARTICLES ---")
        return articles
        
    except Exception as e:
        print(f"--- ERROR IN /API/FEED: {e} ---")
        # Return fallback articles
        return [{
            "id": str(uuid.uuid4()),
            "title": "Breaking News Available",
            "slug": "breaking-news-available",
            "excerpt": "Important news stories are being processed.",
            "category": "General",
            "publishedAt": datetime.now().isoformat(),
            "readTime": 2,
            "sourceCount": 1,
            "heroImageUrl": "https://source.unsplash.com/1200x800/?news,breaking",
            "authorName": "AI News Curator",
            "authorTitle": "News Generator"
        }]

@app.post("/api/research")
def trigger_research_generic(request: dict):
    """Generic research endpoint for any query."""
    try:
        query = request.get("query", "")
        
        if not query:
            raise HTTPException(status_code=400, detail="Query is required")
        
        slug = re.sub(r'[^a-zA-Z0-9\s]', '', query).lower().replace(" ", "-")[:50]
        
        return {
            "message": "Research triggered successfully",
            "research_query": query,
            "slug": slug,
            "status": "success"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"--- ERROR IN GENERIC RESEARCH: {e} ---")
        raise HTTPException(status_code=500, detail="Research failed")

@app.post("/api/hot-topic/{topic_id}/research")
def trigger_research(topic_id: str):
    """Triggers research generation for a specific hot topic."""
    try:
        topics = hot_topics_manager.get_cached_topics()
        topic = None
        
        if topics and 'topics' in topics:
            for t in topics['topics']:
                if t.get('id') == topic_id:
                    topic = t
                    break
        
        if not topic:
            raise HTTPException(status_code=404, detail="Hot topic not found")
        
        research_query = topic['headline']
        
        return {
            "topic": topic,
            "research_query": research_query,
            "message": "Research triggered for this hot topic",
            "status": "success"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"--- ERROR IN RESEARCH TRIGGER: {e} ---")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/api/article/{slug}")
def get_article(slug: str):
    """Get a specific research article by slug."""
    # This endpoint should be handled by main.py
    # Return a redirect or proxy request to main.py
    raise HTTPException(status_code=404, detail="Article endpoint handled by main research service")

@app.get("/api/server-time")
def get_server_time():
    """Get current server time."""
    global last_server_refresh
    
    current_time = datetime.now()
    current_hour = current_time.hour
    current_minute = current_time.minute
    
    # Set refresh time (e.g., 2:00 AM every day)
    REFRESH_HOUR = 2
    REFRESH_MINUTE = 0
    
    # Check if it's refresh time
    should_refresh = False
    if (current_hour == REFRESH_HOUR and 
        current_minute < 5 and  # 5-minute window
        (last_server_refresh is None or 
         current_time.date() > last_server_refresh.date())):
        
        should_refresh = True
        last_server_refresh = current_time
        print(f"Server refresh triggered at {current_time}")
        
        # Clear the cache to force fresh data
        hot_topics_manager.cache = {}
        hot_topics_manager.last_generated = None
    
    return {
        "timestamp": current_time.isoformat(),
        "shouldRefresh": should_refresh,
        "nextRefresh": f"{REFRESH_HOUR:02d}:{REFRESH_MINUTE:02d}",
        "currentHour": current_hour,
        "currentMinute": current_minute
    }

@app.post("/api/generate-topics")
def generate_topics():
    """Manually trigger topic generation."""
    print("--- MANUAL TOPIC GENERATION REQUESTED ---")
    try:
        topics = hot_topics_manager.generate_daily_topics()
        return {
            "message": "Important topics generated successfully",
            "topics_count": len(topics.get('topics', [])),
            "generated_at": datetime.now().isoformat(),
            "topics": topics
        }
    except Exception as e:
        print(f"--- ERROR GENERATING TOPICS: {e} ---")
        return {
            "error": str(e), 
            "topics_count": 0,
            "message": "Failed to generate topics"
        }

@app.post("/api/force-generate-topics")
def force_generate_topics():
    """Force generate new topics (bypass cache)."""
    print("--- FORCE TOPIC GENERATION REQUESTED ---")
    try:
        hot_topics_manager.cache = {}
        hot_topics_manager.last_generated = None
        
        topics = hot_topics_manager.generate_daily_topics()
        return {
            "message": "Important topics forcefully generated",
            "topics_count": len(topics.get('topics', [])),
            "topics": topics,
            "generated_at": datetime.now().isoformat()
        }
    except Exception as e:
        print(f"--- ERROR FORCE GENERATING TOPICS: {e} ---")
        return {
            "error": str(e), 
            "topics_count": 0,
            "message": "Failed to force generate topics"
        }

@app.get("/api/debug/topics")
def debug_topics():
    """Debug endpoint to see topics status."""
    return {
        "cache_exists": bool(hot_topics_manager.cache),
        "cache_topics_count": len(hot_topics_manager.cache.get('topics', [])),
        "last_generated": hot_topics_manager.last_generated.isoformat() if hot_topics_manager.last_generated else None,
        "cache_content": hot_topics_manager.cache,
        "manager_status": "initialized" if hot_topics_manager.workflow else "failed",
        "workflow_exists": hot_topics_manager.workflow is not None,
        "image_strategy": "Enhanced news source extraction + Microlink + Unsplash fallback"
    }

@app.get("/api/topics-info")
def get_topics_info():
    """Get information about cached topics."""
    return {
        "cache_status": "active" if hot_topics_manager.cache else "empty",
        "topics_count": len(hot_topics_manager.cache.get('topics', [])),
        "last_generated": hot_topics_manager.last_generated.isoformat() if hot_topics_manager.last_generated else None,
        "next_generation": (hot_topics_manager.last_generated + timedelta(hours=4)).isoformat() if hot_topics_manager.last_generated else None,
        "focus": "Important news: Politics, Technology, Business, Health, International, Environment, Education",
        "image_strategy": "Enhanced contextual extraction from actual news sources with robust fallbacks"
    }

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting Enhanced Important News Hot Topics API Server...")
    print("📊 Available endpoints:")
    print("  GET  /                    - Health check")
    print("  GET  /health             - Detailed health check")
    print("  GET  /api/feed           - Get important news feed")
    print("  POST /api/generate-topics - Manually generate topics")
    print("  POST /api/force-generate-topics - Force generate new topics")
    print("  GET  /api/debug/topics   - Debug topics status")
    print("  GET  /api/topics-info    - Get topics cache info")
    print("  POST /api/research       - Trigger research")
    print("  GET  /api/server-time    - Get server time and refresh status")
    print("🎯 FOCUS: Important news only - Politics, Technology, Business, Health, International")
    print("🖼️ IMAGES: Enhanced contextual extraction with robust fallbacks and rate limiting")
    print("⚡ IMPROVEMENTS: Better error handling, global variable fix, enhanced image extraction")
    
    uvicorn.run(app, host="0.0.0.0", port=8000)