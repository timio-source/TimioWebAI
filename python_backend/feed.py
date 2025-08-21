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

load_dotenv()

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
        # Check if API key is available
        tavily_api_key = os.getenv("TAVILY_API_KEY")
        if not tavily_api_key:
            print("--- WARNING: TAVILY_API_KEY not found, using fallback news ---")
            return get_fallback_news()
        
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
                print(f"--- SEARCHING: {query} ---")
                results = tavily.invoke(query)
                print(f"--- RAW RESULTS TYPE: {type(results)} ---")
                print(f"--- RAW RESULTS: {str(results)[:200]}... ---")
                
                if isinstance(results, dict):
                    articles = results.get('results', [])
                elif isinstance(results, list):
                    articles = results
                else:
                    articles = []
                
                print(f"--- FOUND {len(articles)} ARTICLES FOR QUERY: {query} ---")
                
                for article in articles:
                    all_news.append({
                        "title": article.get("title", "Untitled"),
                        "url": article.get("url", ""),
                        "source": article.get("source", ""),
                        "published_at": article.get("published_at", datetime.now().isoformat()),
                        "summary": article.get("content", article.get("description", "")),
                    })
            except Exception as e:
                print(f"--- ERROR WITH QUERY '{query}': {e} ---")
                continue
                
        print(f"--- TOTAL NEWS COLLECTED: {len(all_news)} ---")
        
        # If no news found, use fallback
        if not all_news:
            print("--- NO NEWS FOUND, USING FALLBACK ---")
            return get_fallback_news()
            
        return all_news[:12]  # Return top 12 articles
    except Exception as e:
        print(f"--- CRITICAL ERROR IN get_trending_news: {e} ---")
        return get_fallback_news()

def get_fallback_news() -> List[Dict[str, Any]]:
    """Returns fallback news when API calls fail."""
    return [
        {
            "title": "Global Technology Sector Shows Continued Innovation",
            "url": "https://example.com/tech-innovation",
            "source": "Tech News Daily",
            "published_at": datetime.now().isoformat(),
            "summary": "Recent developments in artificial intelligence and machine learning continue to drive technological advancement across multiple sectors."
        },
        {
            "title": "International Economic Indicators Signal Market Stability",
            "url": "https://example.com/economic-stability",
            "source": "Economic Times",
            "published_at": datetime.now().isoformat(),
            "summary": "Economic data from major global markets indicates steady growth patterns and increased investor confidence."
        },
        {
            "title": "Healthcare Research Advances in Medical Technology",
            "url": "https://example.com/healthcare-advances",
            "source": "Medical Journal",
            "published_at": datetime.now().isoformat(),
            "summary": "New breakthroughs in medical research are showing promising results for treatment of various health conditions."
        },
        {
            "title": "Environmental Policy Developments Focus on Sustainability",
            "url": "https://example.com/environmental-policy",
            "source": "Environment Today",
            "published_at": datetime.now().isoformat(),
            "summary": "Government initiatives worldwide are implementing new policies to address climate change and promote renewable energy."
        },
        {
            "title": "International Relations Shape Global Diplomatic Efforts",
            "url": "https://example.com/international-relations",
            "source": "Global Affairs",
            "published_at": datetime.now().isoformat(),
            "summary": "Diplomatic discussions between major world powers continue to influence international trade and security policies."
        },
        {
            "title": "Educational Technology Transforms Learning Methods",
            "url": "https://example.com/educational-technology",
            "source": "Education Weekly",
            "published_at": datetime.now().isoformat(),
            "summary": "New digital learning platforms and AI-powered educational tools are revolutionizing how students access and process information."
        }
    ]

@tool
def search_relevant_images(topic_title: str, category: str) -> str:
    """Searches for relevant images using multiple strategies: Brave Search API, Unsplash, and fallbacks."""
    try:
        # Strategy 1: Brave Search API (Primary)
        brave_api_key = os.getenv("BRAVE_API_KEY")
        if brave_api_key:
            try:
                # Enhanced search terms based on category and title
                search_terms = create_enhanced_search_terms(topic_title, category)
                
                # Try multiple search queries for better results
                for search_query in search_terms:
                    print(f"Trying Brave Search with query: {search_query}")
                    
                    url = "https://api.search.brave.com/res/v1/images/search"
                    headers = {
                        "Accept": "application/json",
                        "Accept-Encoding": "gzip",
                        "X-Subscription-Token": brave_api_key
                    }
                    
                    params = {
                        "q": search_query,
                        "count": 10,
                        "safesearch": "strict",
                        "search_lang": "en",
                        "country": "US",
                        "size": "large",
                        "freshness": "pw"  # Past week for recent images
                    }
                    
                    response = requests.get(url, headers=headers, params=params, timeout=10)
                    
                    if response.status_code == 200:
                        data = response.json()
                        images = data.get("results", [])
                        
                        # Filter for high-quality, relevant images
                        for image in images:
                            img_url = image.get("src", "")
                            title = image.get("title", "").lower()
                            
                            # Quality and relevance filters
                            if (img_url and 
                                is_high_quality_image(img_url, title, topic_title, category)):
                                print(f"Found high-quality Brave image: {img_url}")
                                return img_url
                        
                        # If no filtered images, try first result
                        if images and images[0].get("src"):
                            return images[0]["src"]
                            
            except Exception as e:
                print(f"Brave Search failed: {e}")
        
        # Strategy 2: Enhanced Unsplash with specific search terms
        unsplash_url = get_enhanced_unsplash_image(topic_title, category)
        if unsplash_url:
            print(f"Using enhanced Unsplash image: {unsplash_url}")
            return unsplash_url
        
        # Strategy 3: Category-specific fallback
        return get_fallback_image(category)
        
    except Exception as e:
        print(f"Error in search_relevant_images: {e}")
        return get_fallback_image(category)

def get_fallback_image(category: str) -> str:
    """Returns category-appropriate fallback images when search fails."""
    fallback_images = {
        "Politics": "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=800",
        "Technology": "https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=800",
        "Business": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800",
        "Health": "https://images.unsplash.com/photo-1576091160399-112ba8d25d1f?w=800",
        "Environment": "https://images.unsplash.com/photo-1569163139394-de4e4f43e4e5?w=800",
        "International": "https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?w=800",
        "Education": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800",
        "General": "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800"
    }
    
    return fallback_images.get(category, fallback_images["General"])

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

# FIXED Hot Topic Generator Prompt with properly escaped JSON
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

# Event Filter Agent
EVENT_FILTER_PROMPT = """You are a news filter focused on important, impactful stories.
EXCLUDE: Celebrity news, entertainment, sports, gossip
INCLUDE: Politics, technology, economy, health, international affairs, environment, education"""

# Category Classifier Agent  
CATEGORY_PROMPT = """Classify important news into these categories:
- Politics (government, elections, policy)
- Technology (AI, innovation, cybersecurity)
- Business (economy, markets, finance)
- Health (medical research, policy, pandemics)
- Environment (climate, sustainability)
- International (global affairs, conflicts, diplomacy)
- Education (academic research, policy)"""

# Agent Creation Functions
def create_hot_topic_agent(llm, tools):
    prompt = ChatPromptTemplate.from_messages([
        ("system", HOT_TOPIC_PROMPT),
        MessagesPlaceholder(variable_name="messages"),
    ])
    return prompt | llm

def create_event_filter_agent(llm, tools):
    prompt = ChatPromptTemplate.from_messages([
        ("system", EVENT_FILTER_PROMPT),
        MessagesPlaceholder(variable_name="messages"),
    ])
    return prompt | llm.bind_tools(tools)

def create_category_agent(llm, tools):
    prompt = ChatPromptTemplate.from_messages([
        ("system", CATEGORY_PROMPT),
        MessagesPlaceholder(variable_name="messages"),
    ])
    return prompt | llm.bind_tools(tools)

# Node Functions
def trending_news_node(state: HotTopicState):
    """Fetches trending news from various sources."""
    print("--- 📰 FETCHING IMPORTANT NEWS ---")
    events = get_trending_news.invoke({})
    print(f"--- 📰 FETCHED {len(events)} TOTAL NEWS ARTICLES ---")
    return {"trending_events": events, "messages": []}

def event_filter_node(state: HotTopicState):
    """Filters events for importance and relevance."""
    print("--- 🔍 FILTERING FOR IMPORTANT NEWS ---")
    filtered_events = filter_relevant_events.invoke({"events": state['trending_events']})
    print(f"--- 🔍 FILTERED TO {len(filtered_events)} IMPORTANT ARTICLES ---")
    return {"trending_events": filtered_events, "messages": []}

def hot_topic_generator_node(state: HotTopicState):
    """Generates hot topic headlines and descriptions."""
    print("--- ✍️ GENERATING IMPORTANT HOT TOPICS ---")
    
    # Check if we have events to work with
    if not state.get('trending_events'):
        print("--- ⚠️ NO EVENTS TO PROCESS, GENERATING FALLBACK TOPICS ---")
        fallback_topics = {
            "topics": [
                {
                    "headline": "Global Technology Innovation Continues Rapid Advancement",
                    "description": "Technology sector shows sustained growth with new developments in AI and digital infrastructure. These advances are reshaping how businesses and consumers interact with digital services.",
                    "category": "Technology",
                    "source_url": "https://example.com/tech-innovation"
                },
                {
                    "headline": "International Economic Cooperation Strengthens Trade Relations",
                    "description": "Economic partnerships between major trading nations are showing positive results. New trade agreements are creating opportunities for sustainable economic growth.",
                    "category": "Business",
                    "source_url": "https://example.com/economic-cooperation"
                },
                {
                    "headline": "Healthcare Research Advances Promise Better Treatment Options",
                    "description": "Medical research institutions are making significant progress in treatment methodologies. These developments offer hope for improved patient outcomes across multiple health conditions.",
                    "category": "Health",
                    "source_url": "https://example.com/healthcare-research"
                },
                {
                    "headline": "Environmental Policy Initiatives Focus on Sustainable Development",
                    "description": "Government environmental programs are implementing comprehensive sustainability measures. These policies aim to balance economic growth with environmental protection.",
                    "category": "Environment",
                    "source_url": "https://example.com/environmental-policy"
                },
                {
                    "headline": "Educational Technology Transforms Modern Learning Methods",
                    "description": "Digital learning platforms are revolutionizing educational delivery systems. Students and educators are benefiting from more accessible and personalized learning experiences.",
                    "category": "Education",
                    "source_url": "https://example.com/educational-technology"
                },
                {
                    "headline": "Global Diplomatic Efforts Strengthen International Relations",
                    "description": "International diplomatic initiatives are fostering better cooperation between nations. These efforts focus on addressing shared challenges and promoting peaceful solutions.",
                    "category": "International",
                    "source_url": "https://example.com/diplomatic-efforts"
                }
            ]
        }
        return {"hot_topics": fallback_topics, "messages": []}
    
    # Create agent
    llm = ChatOpenAI(model="gpt-4o", temperature=0.7)
    tools = [get_trending_news, filter_relevant_events, categorize_event]
    agent = create_hot_topic_agent(llm, tools)
    
    # Prepare message with events
    events_text = "\n\n".join([
        f"Title: {event['title']}\nSummary: {event['summary']}\nSource: {event['source']}"
        for event in state['trending_events']
    ])
    print(f"--- EVENTS BEING SENT TO AGENT: {len(state['trending_events'])} events ---")
    
    message = HumanMessage(content=f"Generate 6-8 diverse HOT TOPICS focusing on IMPORTANT NEWS from these events:\n\n{events_text}")
    
    try:
        result = agent.invoke({"messages": [message]})
        
        # Parse the result to extract hot topics
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
            
        print(f"--- ✅ GENERATED {len(topics_data.get('topics', []))} HOT TOPICS ---")
        return {"hot_topics": topics_data, "messages": [result]}
        
    except (json.JSONDecodeError, AttributeError) as e:
        error_message = f"Error parsing hot topics: {e}"
        print(f"--- ❌ ERROR PARSING HOT TOPICS: {error_message} ---")
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
        return {"hot_topics": fallback_topics, "messages": [result] if 'result' in locals() else []}

def create_enhanced_search_terms(topic_title: str, category: str) -> list:
    """Creates multiple search terms for better image results."""
    # Extract key terms from title
    title_keywords = extract_meaningful_keywords(topic_title)
    
    # Category-specific terms
    category_terms = {
        "Politics": ["government", "politics", "congress", "election", "policy", "capitol", "washington"],
        "Technology": ["technology", "innovation", "digital", "computer", "ai", "tech", "future"],
        "Business": ["business", "finance", "economy", "market", "corporate", "money", "trade"],
        "Health": ["health", "medical", "hospital", "research", "healthcare", "medicine", "doctor"],
        "Environment": ["environment", "nature", "climate", "green", "sustainability", "earth", "renewable"],
        "International": ["world", "global", "international", "diplomacy", "flags", "united nations"],
        "Education": ["education", "school", "university", "research", "academic", "learning", "study"],
        "General": ["news", "current events", "breaking news", "journalism", "media"]
    }
    
    terms = category_terms.get(category, category_terms["General"])
    
    # Create multiple search queries
    search_terms = []
    
    # Primary: Category + key keywords
    if title_keywords:
        search_terms.append(f"{terms[0]} {' '.join(title_keywords[:2])}")
    
    # Secondary: Just category terms
    search_terms.append(f"{terms[0]} {terms[1]}")
    
    # Tertiary: News-related terms
    search_terms.append(f"news {category.lower()}")
    
    return search_terms

def extract_meaningful_keywords(title: str) -> list:
    """Extracts meaningful keywords from title, excluding stop words."""
    stop_words = {
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
        'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did',
        'will', 'would', 'should', 'could', 'can', 'may', 'might', 'this', 'that', 'these', 'those'
    }
    
    # Extract words that are likely to be meaningful for image search
    words = re.findall(r'\w+', title.lower())
    keywords = [
        word for word in words 
        if len(word) > 3 and word not in stop_words
    ]
    
    return keywords[:4]  # Return top 4 meaningful keywords

def is_high_quality_image(img_url: str, img_title: str, topic_title: str, category: str) -> bool:
    """Determines if an image is high quality and relevant."""
    # URL quality checks
    low_quality_indicators = [
        'thumbnail', 'thumb', 'avatar', 'icon', 'logo', 'badge', 'button',
        'banner', 'ad', 'advertisement', 'profile', 'small', 'tiny'
    ]
    
    # Check for low quality indicators in URL
    url_lower = img_url.lower()
    if any(indicator in url_lower for indicator in low_quality_indicators):
        return False
    
    # Require proper image extensions
    if not any(ext in url_lower for ext in ['.jpg', '.jpeg', '.png', '.webp']):
        return False
    
    # Size indicators in URL (prefer larger images)
    size_indicators = ['800', '1200', '1600', 'large', 'big', 'full']
    has_size_indicator = any(size in url_lower for size in size_indicators)
    
    # Relevance check using title keywords
    topic_keywords = extract_meaningful_keywords(topic_title)
    title_lower = img_title.lower()
    
    # Check if image title contains relevant keywords
    relevance_score = sum(1 for keyword in topic_keywords if keyword in title_lower)
    
    # Category relevance
    category_keywords = {
        "Politics": ["political", "government", "congress", "election", "policy"],
        "Technology": ["tech", "digital", "computer", "innovation"],
        "Business": ["business", "corporate", "financial", "economic"],
        "Health": ["medical", "health", "hospital", "healthcare"],
        "Environment": ["environmental", "nature", "climate", "green"],
        "International": ["international", "global", "world"],
        "Education": ["education", "academic", "university", "research"]
    }
    
    category_relevance = any(
        keyword in title_lower 
        for keyword in category_keywords.get(category, [])
    )
    
    # Return True if image meets quality and relevance criteria
    return (has_size_indicator or relevance_score > 0 or category_relevance)

def get_enhanced_unsplash_image(topic_title: str, category: str) -> str:
    """Gets enhanced Unsplash images with dynamic search terms."""
    # Extract keywords for dynamic search
    keywords = extract_meaningful_keywords(topic_title)
    
    # Category-specific Unsplash collections and search terms
    category_searches = {
        "Politics": ["government", "politics", "capitol", "democracy"],
        "Technology": ["technology", "innovation", "digital", "future"],
        "Business": ["business", "finance", "corporate", "economy"],
        "Health": ["medical", "healthcare", "research", "science"],
        "Environment": ["nature", "environment", "climate", "sustainability"],
        "International": ["world", "global", "international", "earth"],
        "Education": ["education", "university", "research", "academic"],
        "General": ["news", "media", "communication", "information"]
    }
    
    search_terms = category_searches.get(category, category_searches["General"])
    
    # Try dynamic search first with title keywords
    if keywords:
        primary_search = "+".join(keywords[:2] + search_terms[:1])
        return f"https://source.unsplash.com/1200x800/?{primary_search}"
    
    # Fallback to category-specific search
    fallback_search = "+".join(search_terms[:2])
    return f"https://source.unsplash.com/1200x800/?{fallback_search}"

def get_fallback_image(category: str) -> str:
    """Returns high-quality, category-appropriate fallback images."""
    fallback_images = {
        "Politics": "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=1200&h=800&fit=crop&auto=format&q=80",
        "Technology": "https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=1200&h=800&fit=crop&auto=format&q=80",
        "Business": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1200&h=800&fit=crop&auto=format&q=80",
        "Health": "https://images.unsplash.com/photo-1576091160399-112ba8d25d1f?w=1200&h=800&fit=crop&auto=format&q=80",
        "Environment": "https://images.unsplash.com/photo-1569163139394-de4e4f43e4e5?w=1200&h=800&fit=crop&auto=format&q=80",
        "International": "https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?w=1200&h=800&fit=crop&auto=format&q=80",
        "Education": "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=1200&h=800&fit=crop&auto=format&q=80",
        "General": "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=1200&h=800&fit=crop&auto=format&q=80"
    }
    
    return fallback_images.get(category, fallback_images["General"])

def image_fetcher_node(state: HotTopicState):
    """Enhanced image fetcher with multiple fallback strategies."""
    print("--- 🖼️ FETCHING RELEVANT IMAGES WITH ENHANCED STRATEGY ---")
    
    image_urls = {}
    
    if state.get('hot_topics') and 'topics' in state['hot_topics']:
        for i, topic in enumerate(state['hot_topics']['topics']):
            headline = topic.get('headline', '')
            category = topic.get('category', 'General')
            
            print(f"--- Searching enhanced image for topic {i+1}: {headline} (Category: {category}) ---")
            
            try:
                # Use enhanced image search
                image_url = search_relevant_images.invoke({
                    "topic_title": headline,
                    "category": category
                })
                
                # Validate the image URL
                if image_url and image_url.startswith('http'):
                    image_urls[f"topic_{i}"] = image_url
                    print(f"--- ✅ Enhanced image found for topic {i+1}: {image_url} ---")
                else:
                    # Fallback if search failed
                    fallback_url = get_fallback_image(category)
                    image_urls[f"topic_{i}"] = fallback_url
                    print(f"--- 🔄 Using fallback image for topic {i+1}: {fallback_url} ---")
                
            except Exception as e:
                print(f"--- ❌ Error fetching image for topic {i+1}: {e} ---")
                # Use fallback image
                fallback_url = get_fallback_image(category)
                image_urls[f"topic_{i}"] = fallback_url
                print(f"--- 🔄 Using error fallback for topic {i+1}: {fallback_url} ---")
    
    print(f"--- 🖼️ FETCHED {len(image_urls)} ENHANCED IMAGES ---")
    return {"image_urls": image_urls, "messages": []}



def aggregator_node(state: HotTopicState):
    """Combines all data into final hot topics."""
    print("--- 📊 AGGREGATING HOT TOPICS ---")
    
    final_topics = []
    if state.get('hot_topics') and 'topics' in state['hot_topics']:
        for i, topic in enumerate(state['hot_topics']['topics']):
            topic_with_image = {
                **topic,
                "id": str(uuid.uuid4()),
                "image_url": state.get('image_urls', {}).get(f"topic_{i}", get_fallback_image(topic.get('category', 'General'))),
                "generated_at": state.get('generated_at', datetime.now().isoformat())
            }
            final_topics.append(topic_with_image)
    
    print(f"--- 📊 FINAL AGGREGATED TOPICS: {len(final_topics)} ---")
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
        print("--- 🚀 INITIALIZING HOT TOPICS MANAGER ---")
        try:
            self.workflow = create_hot_topics_workflow()
            self.cache = {}
            self.last_generated = None
            print("--- ✅ HOT TOPICS MANAGER INITIALIZED ---")
        except Exception as e:
            print(f"--- ❌ ERROR INITIALIZING MANAGER: {e} ---")
            self.workflow = None
            self.cache = {}
            self.last_generated = None
    
    def generate_daily_topics(self):
        """Runs the workflow to generate important hot topics."""
        print("--- 🚀 GENERATING IMPORTANT DAILY HOT TOPICS ---")
        
        if not self.workflow:
            print("--- ❌ WORKFLOW NOT INITIALIZED ---")
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
            print(f"--- ✅ GENERATED {topics_count} IMPORTANT HOT TOPICS ---")
            return self.cache
        except Exception as e:
            print(f"--- ❌ ERROR GENERATING TOPICS: {e} ---")
            return {"topics": []}
    
    def get_cached_topics(self):
        """Returns cached hot topics or generates new ones."""
        # Force generation if cache is empty or old
        if (self.last_generated is None or 
            datetime.now() - self.last_generated > timedelta(hours=6) or
            not self.cache or
            len(self.cache.get('topics', [])) == 0):
            return self.generate_daily_topics()
        
        return self.cache

# Initialize the manager
print("--- 🚀 STARTING HOT TOPICS INITIALIZATION ---")
hot_topics_manager = HotTopicsManager()

# FastAPI Application
app = FastAPI(
    title="Important News Hot Topics API",
    description="AI-powered important news topics generator focusing on politics, technology, business, health, and international affairs",
    version="2.0.0"
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
        "version": "2.0.0",
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "focus": "Important news only - no celebrity, sports, or entertainment",
        "image_source": "Brave Search API for relevant images",
        "fallback_enabled": True
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
        "brave_api_configured": bool(os.getenv("BRAVE_API_KEY")),
        "tavily_api_configured": bool(os.getenv("TAVILY_API_KEY"))
    }

# Additional endpoint to test image search
@app.get("/api/test-image-search")
def test_image_search(topic: str = "technology innovation", category: str = "Technology"):
    """Test the enhanced image search functionality."""
    try:
        image_url = search_relevant_images.invoke({
            "topic_title": topic,
            "category": category
        })
        
        return {
            "success": True,
            "topic": topic,
            "category": category,
            "image_url": image_url,
            "search_strategy": "enhanced_multi_fallback",
            "brave_api_configured": bool(os.getenv("BRAVE_API_KEY"))
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "topic": topic,
            "category": category,
            "fallback_image": get_fallback_image(category)
        }

@app.get("/api/feed")
def get_feed():
    """Returns important hot topics as a list of articles for the frontend."""
    print("--- 📢 /API/FEED ENDPOINT HIT ---")
    
    try:
        topics_data = hot_topics_manager.get_cached_topics()
        topics = topics_data.get('topics', [])
        articles = []
        
        for topic in topics:
            article = {
                "id": topic.get("id", str(uuid.uuid4())),
                "title": topic.get("headline", "Important News Update"),
                "slug": topic.get("headline", "important-news").lower().replace(" ", "-").replace("/", "-").replace(":", "").replace("?", "").replace("!", ""),
                "excerpt": topic.get("description", "Important news development."),
                "category": topic.get("category", "General"),
                "publishedAt": topic.get("generated_at", datetime.now().isoformat()),
                "readTime": 3,
                "sourceCount": 1,
                "heroImageUrl": topic.get("image_url", get_fallback_image(topic.get("category", "General"))),
                "authorName": "AI News Curator",
                "authorTitle": "Important News Generator"
            }
            articles.append(article)
        
        print(f"--- ✅ RETURNING {len(articles)} IMPORTANT NEWS ARTICLES ---")
        return articles
        
    except Exception as e:
        print(f"--- ❌ ERROR IN /API/FEED: {e} ---")
        return []

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
        print(f"--- ❌ ERROR IN GENERIC RESEARCH: {e} ---")
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
        print(f"--- ❌ ERROR IN RESEARCH TRIGGER: {e} ---")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/api/article/{slug}")
def get_article(slug: str):
    """Get a specific research article by slug."""
    raise HTTPException(status_code=404, detail="Article endpoint not implemented yet")

@app.get("/api/server-time")
def get_server_time():
    """Get current server time."""
    return {
        "server_time": datetime.now().isoformat(),
        "timezone": "UTC"
    }

@app.post("/api/generate-topics")
def generate_topics():
    """Manually trigger topic generation."""
    print("--- 📢 MANUAL TOPIC GENERATION REQUESTED ---")
    try:
        topics = hot_topics_manager.generate_daily_topics()
        return {
            "message": "Important topics generated successfully",
            "topics_count": len(topics.get('topics', [])),
            "generated_at": datetime.now().isoformat(),
            "topics": topics
        }
    except Exception as e:
        print(f"--- ❌ ERROR GENERATING TOPICS: {e} ---")
        return {
            "error": str(e), 
            "topics_count": 0,
            "message": "Failed to generate topics"
        }

@app.post("/api/force-generate-topics")
def force_generate_topics():
    """Force generate new topics (bypass cache)."""
    print("--- 📢 FORCE TOPIC GENERATION REQUESTED ---")
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
        print(f"--- ❌ ERROR FORCE GENERATING TOPICS: {e} ---")
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
        "brave_api_configured": bool(os.getenv("BRAVE_API_KEY")),
        "tavily_api_configured": bool(os.getenv("TAVILY_API_KEY"))
    }

@app.get("/api/topics-info")
def get_topics_info():
    """Get information about cached topics."""
    return {
        "cache_status": "active" if hot_topics_manager.cache else "empty",
        "topics_count": len(hot_topics_manager.cache.get('topics', [])),
        "last_generated": hot_topics_manager.last_generated.isoformat() if hot_topics_manager.last_generated else None,
        "next_generation": (hot_topics_manager.last_generated + timedelta(hours=6)).isoformat() if hot_topics_manager.last_generated else None,
        "focus": "Important news: Politics, Technology, Business, Health, International, Environment, Education",
        "image_source": "Brave Search API for contextually relevant images",
        "fallback_enabled": True
    }

@app.get("/api/test-apis")
def test_apis():
    """Test endpoint to check API configurations."""
    results = {
        "tavily_configured": bool(os.getenv("TAVILY_API_KEY")),
        "brave_configured": bool(os.getenv("BRAVE_API_KEY")),
        "openai_configured": bool(os.getenv("OPENAI_API_KEY"))
    }
    
    # Test Tavily API
    if results["tavily_configured"]:
        try:
            test_news = get_trending_news.invoke({})
            results["tavily_working"] = len(test_news) > 0
            results["tavily_news_count"] = len(test_news)
        except Exception as e:
            results["tavily_working"] = False
            results["tavily_error"] = str(e)
    
    # Test Brave API
    if results["brave_configured"]:
        try:
            test_image = search_relevant_images.invoke({"topic_title": "technology news", "category": "Technology"})
            results["brave_working"] = bool(test_image and test_image.startswith("http"))
            results["brave_test_image"] = test_image
        except Exception as e:
            results["brave_working"] = False
            results["brave_error"] = str(e)
    
    return results

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting Important News Hot Topics API Server...")
    print("📊 Available endpoints:")
    print("  GET  /                    - Health check")
    print("  GET  /health             - Detailed health check")
    print("  GET  /api/feed           - Get important news feed")
    print("  POST /api/generate-topics - Manually generate topics")
    print("  POST /api/force-generate-topics - Force generate new topics")
    print("  GET  /api/debug/topics   - Debug topics status")
    print("  GET  /api/topics-info    - Get topics cache info")
    print("  GET  /api/test-apis      - Test API configurations")
    print("  POST /api/research       - Trigger research")
    print("🎯 FOCUS: Important news only - Politics, Technology, Business, Health, International")
    print("🖼️ IMAGES: Brave Search API for contextually relevant images")
    print("🔄 FALLBACKS: Enabled for both news and images")
    
    uvicorn.run(app, host="0.0.0.0", port=8000)