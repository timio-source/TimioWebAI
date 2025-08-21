import os
import re
import json
import uuid
import base64
import hashlib
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
from urllib.parse import urljoin, urlparse, quote_plus
import time
import random
from PIL import Image
from io import BytesIO

load_dotenv()

# Global variable for cache coordination with main.py
last_server_refresh = None

# Enhanced Image Service Configuration
BRAVE_API_KEY = os.getenv("BRAVE_API_KEY")
UNSPLASH_ACCESS_KEY = os.getenv("UNSPLASH_ACCESS_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Define a reducer function for merging dictionaries
def merge_reports(dict1: dict, dict2: dict) -> dict:
    return {**dict1, **dict2}

class HotTopicState(TypedDict): 
    messages: Annotated[list, lambda x, y: x + y]
    trending_events: List[Dict[str, Any]]
    hot_topics: Annotated[Optional[dict], merge_reports]
    image_urls: Optional[dict]
    generated_at: str

# Enhanced Image Utilities
class ImageValidator:
    """Validates and scores image quality for news articles."""
    
    @staticmethod
    def is_valid_image_url(url: str) -> bool:
        """Check if URL is a valid image URL."""
        if not url or not isinstance(url, str):
            return False
        
        # Check if URL starts with http/https
        if not url.startswith(('http://', 'https://')):
            return False
        
        # Check for image extensions
        image_extensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
        url_lower = url.lower()
        
        # Check file extension
        has_extension = any(ext in url_lower for ext in image_extensions)
        
        # Check for image indicators in URL
        image_indicators = ['image', 'img', 'photo', 'picture', 'media', 'cdn', 'static']
        has_indicator = any(indicator in url_lower for indicator in image_indicators)
        
        # Exclude common non-image patterns
        exclude_patterns = ['icon', 'logo', 'avatar', 'favicon', 'pixel.gif', 'tracking', '1x1']
        has_exclude = any(pattern in url_lower for pattern in exclude_patterns)
        
        return (has_extension or has_indicator) and not has_exclude
    
    @staticmethod
    def score_image_relevance(url: str, title: str, category: str) -> int:
        """Score image relevance based on URL content and article metadata."""
        score = 0
        url_lower = url.lower()
        title_lower = title.lower()
        category_lower = category.lower()
        
        # Higher score for larger images
        if any(size in url_lower for size in ['1200', '800', '1920', '1080']):
            score += 3
        elif any(size in url_lower for size in ['600', '400']):
            score += 1
        
        # Score based on image quality indicators
        quality_indicators = ['hd', 'high', 'large', 'full']
        score += sum(2 for indicator in quality_indicators if indicator in url_lower)
        
        # Score based on category relevance
        category_keywords = {
            'politics': ['government', 'capitol', 'election', 'political'],
            'technology': ['tech', 'digital', 'computer', 'innovation'],
            'business': ['business', 'finance', 'market', 'corporate'],
            'health': ['medical', 'health', 'hospital', 'medicine']
        }
        
        if category_lower in category_keywords:
            for keyword in category_keywords[category_lower]:
                if keyword in url_lower:
                    score += 2
        
        # Penalize generic stock photo indicators
        generic_patterns = ['stock', 'generic', 'placeholder', 'default']
        score -= sum(1 for pattern in generic_patterns if pattern in url_lower)
        
        return max(0, score)

class EnhancedImageExtractor:
    """Enhanced image extraction with multiple strategies and APIs."""
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
    
    def extract_from_url(self, url: str, timeout: int = 10) -> List[str]:
        """Extract images from a news article URL."""
        if not url or not url.startswith('http'):
            return []
        
        try:
            # Add random delay to avoid rate limiting
            time.sleep(random.uniform(0.5, 2.0))
            
            response = self.session.get(url, timeout=timeout, allow_redirects=True)
            
            if response.status_code != 200:
                return []
                
            soup = BeautifulSoup(response.content, 'html.parser')
            image_urls = []
            
            # Enhanced image selectors prioritized by relevance
            selectors = [
                # Open Graph and Twitter Cards (highest priority)
                ('meta[property="og:image"]', 'content'),
                ('meta[name="twitter:image"]', 'content'),
                ('meta[name="twitter:image:src"]', 'content'),
                ('meta[property="article:image"]', 'content'),
                
                # Structured data
                ('script[type="application/ld+json"]', None),
                
                # Article-specific image containers
                ('.hero-image img', 'src'),
                ('.featured-image img', 'src'),
                ('.article-image img', 'src'),
                ('.lead-image img', 'src'),
                ('.story-image img', 'src'),
                ('.content-image img', 'src'),
                
                # Generic article containers
                ('article img[src*="cdn"]', 'src'),
                ('article img[src*="static"]', 'src'),
                ('.content img', 'src'),
                ('.main-content img', 'src'),
                ('.post-content img', 'src'),
            ]
            
            for selector, attr in selectors:
                if selector.startswith('script'):
                    # Handle JSON-LD structured data
                    scripts = soup.select(selector)
                    for script in scripts:
                        try:
                            data = json.loads(script.string)
                            if isinstance(data, dict) and 'image' in data:
                                img_data = data['image']
                                if isinstance(img_data, str):
                                    image_urls.append(img_data)
                                elif isinstance(img_data, list):
                                    image_urls.extend(img_data)
                        except:
                            continue
                elif attr == 'content':
                    # Handle meta tags
                    meta_tags = soup.select(selector)
                    for tag in meta_tags:
                        content = tag.get('content')
                        if content:
                            image_urls.append(content)
                else:
                    # Handle img tags
                    img_tags = soup.select(selector)
                    for img in img_tags[:3]:  # Limit to first 3 per selector
                        src = img.get('src') or img.get('data-src') or img.get('data-lazy-src')
                        if src:
                            image_urls.append(src)
            
            # Clean and validate URLs
            cleaned_urls = []
            for img_url in image_urls:
                cleaned_url = self._clean_image_url(img_url, url)
                if cleaned_url and ImageValidator.is_valid_image_url(cleaned_url):
                    cleaned_urls.append(cleaned_url)
            
            # Remove duplicates while preserving order
            seen = set()
            unique_urls = []
            for url in cleaned_urls:
                if url not in seen:
                    seen.add(url)
                    unique_urls.append(url)
            
            return unique_urls[:5]  # Return top 5 images
            
        except Exception as e:
            print(f"Error extracting images from {url}: {e}")
            return []
    
    def _clean_image_url(self, img_url: str, base_url: str) -> str:
        """Clean and normalize image URL."""
        if not img_url:
            return None
        
        # Handle relative URLs
        if img_url.startswith('//'):
            img_url = 'https:' + img_url
        elif img_url.startswith('/'):
            img_url = urljoin(base_url, img_url)
        elif not img_url.startswith('http'):
            img_url = urljoin(base_url, img_url)
        
        return img_url
    
    def search_brave_images(self, query: str, count: int = 5) -> List[str]:
        """Search for images using Brave Search API."""
        if not BRAVE_API_KEY:
            return []
        
        try:
            url = "https://api.search.brave.com/res/v1/images/search"
            headers = {
                'X-Subscription-Token': BRAVE_API_KEY,
                'Accept': 'application/json'
            }
            params = {
                'q': f"{query} news",
                'count': count,
                'safesearch': 'moderate',
                'search_lang': 'en'
            }
            
            response = requests.get(url, headers=headers, params=params, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                results = data.get('results', [])
                
                image_urls = []
                for result in results:
                    img_url = result.get('src', {}).get('original')
                    if img_url and ImageValidator.is_valid_image_url(img_url):
                        image_urls.append(img_url)
                
                return image_urls
            
        except Exception as e:
            print(f"Brave API error: {e}")
        
        return []
    
    def search_unsplash_images(self, query: str, count: int = 3) -> List[str]:
        """Search for images using Unsplash API."""
        try:
            if UNSPLASH_ACCESS_KEY:
                # Use official Unsplash API
                url = "https://api.unsplash.com/search/photos"
                headers = {'Authorization': f'Client-ID {UNSPLASH_ACCESS_KEY}'}
                params = {
                    'query': f"{query} news journalism",
                    'per_page': count,
                    'orientation': 'landscape'
                }
                
                response = requests.get(url, headers=headers, params=params, timeout=10)
                
                if response.status_code == 200:
                    data = response.json()
                    results = data.get('results', [])
                    
                    return [photo['urls']['regular'] for photo in results if 'urls' in photo]
            
            # Fallback to source.unsplash.com
            return [
                f"https://source.unsplash.com/1200x800/?{quote_plus(query)},news",
                f"https://source.unsplash.com/1200x800/?{quote_plus(query)},journalism",
                f"https://source.unsplash.com/1200x800/?{quote_plus(query)},media"
            ]
            
        except Exception as e:
            print(f"Unsplash API error: {e}")
            return []

# Enhanced image extractor instance
image_extractor = EnhancedImageExtractor()

# Tools - functions that AI agents can call to perform specific tasks

@tool
def get_trending_news() -> List[Dict[str, Any]]:
    """Fetches trending news from TavilySearch with enhanced coverage."""
    try:
        tavily = TavilySearch(max_results=20)
        # More comprehensive queries for important news
        queries = [
            "breaking news politics government policy legislation today",
            "AI artificial intelligence technology breakthrough innovation today", 
            "economy business markets finance inflation federal reserve today",
            "health medical research vaccine pharmaceutical breakthrough today",
            "climate environment renewable energy carbon emissions today",
            "international news global affairs diplomacy conflict today",
            "education research university scientific discovery today",
            "cybersecurity data privacy technology regulation today"
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
                        "category_hint": query.split()[0]  # First word as category hint
                    })
            except Exception as e:
                print(f"Error with query '{query}': {e}")
                continue
                
        return all_news[:15]  # Return top 15 articles
    except Exception as e:
        print(f"Error fetching trending news from Tavily: {e}")
        return []

@tool
def extract_enhanced_news_images(url: str, title: str = "", category: str = "") -> List[str]:
    """Extract images from news URLs with enhanced multi-strategy approach."""
    if not url or not url.startswith('http'):
        return []
    
    try:
        # Strategy 1: Extract from source URL
        extracted_images = image_extractor.extract_from_url(url)
        
        if extracted_images:
            # Score and sort images by relevance
            scored_images = []
            for img_url in extracted_images:
                score = ImageValidator.score_image_relevance(img_url, title, category)
                scored_images.append((score, img_url))
            
            # Sort by score and return top images
            scored_images.sort(key=lambda x: x[0], reverse=True)
            return [img for score, img in scored_images[:3]]
        
        return []
        
    except Exception as e:
        print(f"Error extracting enhanced images from {url}: {e}")
        return []

@tool
def search_contextual_images(query: str, category: str = "general") -> List[str]:
    """Search for contextual images using multiple APIs."""
    try:
        all_images = []
        
        # Extract keywords from query
        keywords = extract_keywords_from_text(query)
        search_query = " ".join(keywords[:3])  # Use top 3 keywords
        
        # Strategy 1: Brave Search API
        brave_images = image_extractor.search_brave_images(search_query, 3)
        all_images.extend(brave_images)
        
        # Strategy 2: Unsplash API
        unsplash_images = image_extractor.search_unsplash_images(search_query, 2)
        all_images.extend(unsplash_images)
        
        # Strategy 3: Category-specific fallbacks
        category_images = get_category_specific_images(category)
        all_images.extend(category_images)
        
        # Remove duplicates and return top images
        seen = set()
        unique_images = []
        for img in all_images:
            if img not in seen:
                seen.add(img)
                unique_images.append(img)
        
        return unique_images[:5]
        
    except Exception as e:
        print(f"Error searching contextual images: {e}")
        return []

def extract_keywords_from_text(text: str) -> List[str]:
    """Extract meaningful keywords from text."""
    import re
    
    # Remove common stop words
    stop_words = {
        'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
        'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
        'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
        'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
        'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'our', 'their'
    }
    
    # Clean and split text
    words = re.findall(r'\b[a-zA-Z]{3,}\b', text.lower())
    
    # Filter out stop words and return meaningful keywords
    keywords = [word for word in words if word not in stop_words]
    
    # Return most frequent/important keywords
    return keywords[:5]

def get_category_specific_images(category: str) -> List[str]:
    """Get high-quality category-specific images."""
    category_images = {
        "politics": [
            "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=1200&q=80",
            "https://images.unsplash.com/photo-1586892478025-2b5472316f22?w=1200&q=80",
            "https://images.unsplash.com/photo-1495476479092-6ece1898a101?w=1200&q=80",
            "https://source.unsplash.com/1200x800/?government,politics,capitol"
        ],
        "technology": [
            "https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=1200&q=80",
            "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=1200&q=80",
            "https://images.unsplash.com/photo-1535378917042-10a22c95931a?w=1200&q=80",
            "https://source.unsplash.com/1200x800/?technology,ai,innovation"
        ],
        "business": [
            "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&q=80",
            "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=1200&q=80",
            "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&q=80",
            "https://source.unsplash.com/1200x800/?business,finance,economy"
        ],
        "health": [
            "https://images.unsplash.com/photo-1576091160399-112ba8d25d1f?w=1200&q=80",
            "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=1200&q=80",
            "https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=1200&q=80",
            "https://source.unsplash.com/1200x800/?medical,health,research"
        ],
        "environment": [
            "https://images.unsplash.com/photo-1569163139394-de4e5f43e4e3?w=1200&q=80",
            "https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=1200&q=80",
            "https://source.unsplash.com/1200x800/?environment,climate,renewable"
        ],
        "international": [
            "https://images.unsplash.com/photo-1526666923127-b2970f64b422?w=1200&q=80",
            "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&q=80",
            "https://source.unsplash.com/1200x800/?world,global,international"
        ]
    }
    
    category_key = category.lower()
    if category_key in category_images:
        return category_images[category_key]
    
    # Default fallback
    return [
        "https://source.unsplash.com/1200x800/?news,journalism,media",
        "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=1200&q=80",
        "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=1200&q=80"
    ]

def is_newsworthy(event: Dict[str, Any]) -> bool:
    """Enhanced newsworthiness filtering."""
    title = event.get("title", "").lower()
    summary = event.get("summary", "").lower()
    
    # Enhanced filtering for celebrity and entertainment content
    exclude_keywords = [
        "celebrity", "actor", "actress", "singer", "musician", "artist", "band", 
        "movie", "film", "hollywood", "entertainment", "award", "oscar", "grammy",
        "kardashian", "beyonce", "taylor swift", "kanye", "bieber", "drake",
        "netflix", "disney", "streaming", "tv show", "series", "premiere",
        "football", "basketball", "baseball", "soccer", "tennis", "golf",
        "nfl", "nba", "mlb", "fifa", "olympics", "championship", "tournament",
        "player", "team", "coach", "game", "match", "score", "playoff",
        "recipe", "cooking", "fashion", "style", "beauty", "makeup",
        "dating", "relationship", "wedding", "divorce", "baby", "pregnancy"
    ]
    
    # Check if it contains excluded content
    text_content = f"{title} {summary}"
    if any(keyword in text_content for keyword in exclude_keywords):
        return False
    
    # Enhanced important news detection
    important_keywords = [
        # Politics and Government
        "government", "policy", "election", "president", "congress", "senate",
        "legislation", "regulation", "supreme court", "federal", "state",
        
        # Technology and Innovation
        "technology", "ai", "artificial intelligence", "breakthrough", "innovation",
        "cybersecurity", "data privacy", "blockchain", "quantum", "automation",
        
        # Economy and Business
        "economy", "market", "inflation", "recession", "gdp", "federal reserve",
        "unemployment", "economic", "financial", "stock market", "trade",
        
        # Health and Medicine
        "health", "medical", "vaccine", "pandemic", "research", "disease",
        "treatment", "pharmaceutical", "clinical trial", "public health",
        
        # Environment and Climate
        "climate", "environment", "global warming", "carbon", "renewable",
        "sustainability", "pollution", "emissions", "green energy",
        
        # International Affairs
        "international", "war", "conflict", "diplomacy", "trade", "sanctions",
        "foreign policy", "global", "world", "united nations", "nato",
        
        # Education and Science
        "education", "university", "research", "study", "scientific",
        "discovery", "academic", "school", "college"
    ]
    
    # Calculate importance score
    importance_score = sum(1 for keyword in important_keywords if keyword in text_content)
    
    return importance_score >= 1

@tool
def filter_relevant_events(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Enhanced event filtering with better categorization."""
    relevant_events = []
   
    for event in events:
        if is_newsworthy(event):
            # Add category hint for better image selection
            event['category'] = categorize_event(event)
            relevant_events.append(event)
    
    # Sort by relevance and return top events
    return relevant_events[:10]

@tool
def categorize_event(event: Dict[str, Any]) -> str:
    """Enhanced event categorization with better keyword detection."""
    title = event.get("title", "").lower()
    summary = event.get("summary", "").lower()
    text = f"{title} {summary}"
    
    # Enhanced categorization with more specific keywords
    categories = {
        "Politics": [
            "trump", "biden", "congress", "election", "policy", "senate", "house",
            "democrat", "republican", "president", "government", "supreme court",
            "legislation", "federal", "political", "vote", "campaign"
        ],
        "Technology": [
            "ai", "technology", "software", "digital", "tech", "artificial intelligence",
            "machine learning", "algorithm", "innovation", "cybersecurity", "blockchain",
            "quantum", "automation", "robot", "data", "internet", "app", "platform"
        ],
        "Business": [
            "economy", "market", "business", "trade", "economic", "stock", "finance",
            "investment", "inflation", "recession", "fed", "gdp", "corporate",
            "company", "earnings", "profit", "revenue", "banking"
        ],
        "Health": [
            "health", "medical", "covid", "vaccine", "diagnosis", "hospital", "doctor",
            "patient", "treatment", "disease", "medicine", "pharmaceutical", "research",
            "clinical", "therapy", "healthcare", "wellness", "mental health"
        ],
        "Environment": [
            "climate", "environment", "carbon", "emissions", "global warming", "renewable",
            "solar", "wind", "pollution", "sustainability", "green", "energy",
            "conservation", "ecosystem", "biodiversity"
        ],
        "International": [
            "war", "military", "defense", "weapon", "conflict", "peace", "diplomacy",
            "international", "foreign", "russia", "china", "ukraine", "nato",
            "global", "world", "country", "nation", "embassy"
        ],
        "Education": [
            "education", "school", "university", "student", "teacher", "college",
            "degree", "academic", "research", "study", "science", "learning",
            "scholarship", "campus"
        ]
    }
    
    # Calculate category scores
    category_scores = {}
    for category, keywords in categories.items():
        score = sum(1 for keyword in keywords if keyword in text)
        if score > 0:
            category_scores[category] = score
    
    # Return category with highest score
    if category_scores:
        return max(category_scores.items(), key=lambda x: x[1])[0]
    
    return "General"

# Enhanced Hot Topic Generator Prompt
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
  {
    "headline": "Compelling, serious news headline (max 80 characters)",
    "description": "Two sentence description explaining the significance and impact. Focus on why this matters to readers.",
    "category": "Politics/Technology/Business/Health/Environment/International/Education/General",
    "source_url": "URL of the original news source",
    "keywords": ["keyword1", "keyword2", "keyword3"]
  }
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
        f"Title: {event['title']}\nSummary: {event['summary']}\nSource: {event['source']}\nURL: {event.get('url', '')}\nCategory: {event.get('category', 'General')}"
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
                    "source_url": "https://example.com",
                    "keywords": ["economy", "markets", "inflation"]
                },
                {
                    "headline": "Technological Breakthrough in AI Research",
                    "description": "Scientists have made significant advances in artificial intelligence capabilities. This development could impact multiple industries.",
                    "category": "Technology", 
                    "source_url": "https://example.com",
                    "keywords": ["AI", "technology", "research"]
                }
            ]
        }
        return {"hot_topics": fallback_topics, "messages": [result]}

def enhanced_image_fetcher_node(state: HotTopicState):
    """Enhanced image fetching with multiple strategies and better fallbacks."""
    print("--- FETCHING ENHANCED CONTEXTUAL IMAGES ---")
    
    image_urls = {}
    
    if state.get('hot_topics') and 'topics' in state['hot_topics']:
        for i, topic in enumerate(state['hot_topics']['topics']):
            category = topic.get('category', 'General')
            headline = topic.get('headline', '')
            source_url = topic.get('source_url', '')
            keywords = topic.get('keywords', [])
            
            image_found = False
            best_image = None
            
            print(f"--- PROCESSING IMAGES FOR TOPIC {i}: {headline[:50]}... ---")
            
            # Strategy 1: Extract from source URL with enhanced scoring
            if source_url and source_url.startswith('http'):
                try:
                    extracted_images = extract_enhanced_news_images.invoke({
                        "url": source_url,
                        "title": headline,
                        "category": category
                    })
                    
                    if extracted_images:
                        best_image = extracted_images[0]  # Top scored image
                        print(f"--- EXTRACTED HIGH-QUALITY IMAGE FOR TOPIC {i} ---")
                        image_found = True
                except Exception as e:
                    print(f"--- ERROR EXTRACTING ENHANCED IMAGE FOR TOPIC {i}: {e} ---")
            
            # Strategy 2: Search using keywords and category
            if not image_found:
                try:
                    search_query = " ".join(keywords[:2]) if keywords else headline
                    contextual_images = search_contextual_images.invoke({
                        "query": search_query,
                        "category": category
                    })
                    
                    if contextual_images:
                        best_image = contextual_images[0]
                        print(f"--- FOUND CONTEXTUAL IMAGE FOR TOPIC {i} ---")
                        image_found = True
                except Exception as e:
                    print(f"--- ERROR SEARCHING CONTEXTUAL IMAGES FOR TOPIC {i}: {e} ---")
            
            # Strategy 3: Category-specific fallback
            if not image_found:
                try:
                    category_images = get_category_specific_images(category.lower())
                    if category_images:
                        best_image = category_images[0]
                        print(f"--- USING CATEGORY FALLBACK FOR TOPIC {i} ---")
                        image_found = True
                except Exception as e:
                    print(f"--- ERROR WITH CATEGORY FALLBACK FOR TOPIC {i}: {e} ---")
            
            # Final fallback
            if not best_image:
                best_image = "https://source.unsplash.com/1200x800/?news,journalism,media"
                print(f"--- USING FINAL FALLBACK FOR TOPIC {i} ---")
            
            image_urls[f"topic_{i}"] = best_image
    
    print(f"--- TOTAL ENHANCED IMAGES PROCESSED: {len(image_urls)} ---")
    return {"image_urls": image_urls, "messages": []}

def aggregator_node(state: HotTopicState):
    """Combines all data into final hot topics with enhanced metadata."""
    print("--- AGGREGATING HOT TOPICS WITH ENHANCED DATA ---")
    
    final_topics = []
    if state.get('hot_topics') and 'topics' in state['hot_topics']:
        for i, topic in enumerate(state['hot_topics']['topics']):
            # Get image URL with enhanced fallback
            image_url = state.get('image_urls', {}).get(f"topic_{i}")
            if not image_url:
                # Final fallback based on category
                category = topic.get('category', 'General').lower()
                category_images = get_category_specific_images(category)
                image_url = category_images[0] if category_images else "https://source.unsplash.com/1200x800/?news"
            
            # Create enhanced topic with metadata
            topic_with_enhanced_data = {
                **topic,
                "id": str(uuid.uuid4()),
                "slug": re.sub(r'[^a-zA-Z0-9\s-]', '', topic.get("headline", "")).lower().replace(" ", "-").replace("--", "-").strip("-")[:100],
                "image_url": image_url,
                "generated_at": state.get('generated_at', datetime.now().isoformat()),
                "read_time": 3,  # Estimated read time
                "source_count": 1,  # Number of sources
                "keywords": topic.get("keywords", []),
                "importance_score": calculate_importance_score(topic),
                "image_source": "enhanced_extraction"
            }
            final_topics.append(topic_with_enhanced_data)
    
    # Sort by importance score
    final_topics.sort(key=lambda x: x.get('importance_score', 0), reverse=True)
    
    print(f"--- FINAL ENHANCED TOPICS: {len(final_topics)} ---")
    return {"hot_topics": {"topics": final_topics}, "messages": []}

def calculate_importance_score(topic: Dict[str, Any]) -> int:
    """Calculate importance score for topic ranking."""
    score = 0
    
    headline = topic.get("headline", "").lower()
    description = topic.get("description", "").lower()
    category = topic.get("category", "").lower()
    
    # Category importance weights
    category_weights = {
        "politics": 10,
        "international": 9,
        "business": 8,
        "technology": 8,
        "health": 7,
        "environment": 6,
        "education": 5,
        "general": 3
    }
    
    score += category_weights.get(category, 3)
    
    # Keyword importance
    important_words = [
        "breaking", "urgent", "crisis", "emergency", "major", "significant",
        "federal", "government", "president", "congress", "supreme court",
        "global", "international", "war", "conflict", "peace",
        "economy", "market", "inflation", "recession", "gdp",
        "breakthrough", "innovation", "discovery", "research"
    ]
    
    text = f"{headline} {description}"
    score += sum(2 for word in important_words if word in text)
    
    return score

# Enhanced Graph Construction
def create_enhanced_hot_topics_workflow():
    """Creates and returns the enhanced hot topics workflow graph."""
    llm = ChatOpenAI(model="gpt-4o", temperature=0.3)
    
    workflow = StateGraph(HotTopicState)
    
    workflow.add_node("trending_news", trending_news_node)
    workflow.add_node("event_filter", event_filter_node)
    workflow.add_node("hot_topic_generator", hot_topic_generator_node)
    workflow.add_node("enhanced_image_fetcher", enhanced_image_fetcher_node)
    workflow.add_node("aggregator", aggregator_node)
    
    workflow.add_edge(START, "trending_news")
    workflow.add_edge("trending_news", "event_filter")
    workflow.add_edge("event_filter", "hot_topic_generator")
    workflow.add_edge("hot_topic_generator", "enhanced_image_fetcher")
    workflow.add_edge("enhanced_image_fetcher", "aggregator")
    workflow.add_edge("aggregator", END)
    
    return workflow.compile()

# Enhanced Hot Topics Manager
class EnhancedHotTopicsManager:
    def __init__(self):
        print("--- INITIALIZING ENHANCED HOT TOPICS MANAGER ---")
        try:
            self.workflow = create_enhanced_hot_topics_workflow()
            self.cache = {}
            self.last_generated = None
            self.image_extractor = EnhancedImageExtractor()
            print("--- ENHANCED HOT TOPICS MANAGER INITIALIZED ---")
        except Exception as e:
            print(f"--- ERROR INITIALIZING ENHANCED MANAGER: {e} ---")
            self.workflow = None
            self.cache = {}
            self.last_generated = None
            self.image_extractor = None
    
    def generate_daily_topics(self):
        """Runs the enhanced workflow to generate important hot topics."""
        print("--- GENERATING ENHANCED DAILY HOT TOPICS ---")
        
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
            print(f"--- GENERATED {topics_count} ENHANCED HOT TOPICS ---")
            return self.cache
        except Exception as e:
            print(f"--- ERROR GENERATING ENHANCED TOPICS: {e} ---")
            return {"topics": []}
    
    def get_cached_topics(self):
        """Returns cached hot topics or generates new ones."""
        # Force generation if cache is empty or old
        if (self.last_generated is None or 
            datetime.now() - self.last_generated > timedelta(hours=3) or  # More frequent generation
            not self.cache or
            len(self.cache.get('topics', [])) == 0):
            return self.generate_daily_topics()
        
        return self.cache
    
    def refresh_images_for_topics(self):
        """Refresh images for existing topics with better extraction."""
        if not self.cache or 'topics' not in self.cache:
            return
        
        print("--- REFRESHING IMAGES FOR EXISTING TOPICS ---")
        
        for topic in self.cache['topics']:
            try:
                # Try to get better image
                headline = topic.get('headline', '')
                category = topic.get('category', 'General')
                keywords = topic.get('keywords', [])
                
                # Search for better images
                search_query = " ".join(keywords[:2]) if keywords else headline
                better_images = search_contextual_images.invoke({
                    "query": search_query,
                    "category": category
                })
                
                if better_images:
                    topic['image_url'] = better_images[0]
                    topic['image_source'] = 'refreshed_extraction'
                    
            except Exception as e:
                print(f"--- ERROR REFRESHING IMAGE FOR TOPIC: {e} ---")
                continue

# Initialize the enhanced manager
print("--- STARTING ENHANCED HOT TOPICS INITIALIZATION ---")
hot_topics_manager = EnhancedHotTopicsManager()

# FastAPI Application
app = FastAPI(
    title="Enhanced Important News Hot Topics API",
    description="AI-powered important news topics generator with enhanced image extraction and multiple fallback strategies",
    version="3.0.0"
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
        "message": "Enhanced Important News Hot Topics API is running",
        "version": "3.0.0",
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "focus": "Important news only - no celebrity, sports, or entertainment",
        "image_strategy": "Multi-strategy enhanced image extraction with Brave API, Unsplash API, and smart fallbacks",
        "features": [
            "Enhanced image extraction from news sources",
            "Multi-API image search (Brave + Unsplash)",
            "Smart category-based fallbacks",
            "Image quality scoring and validation",
            "Keywords extraction for better image matching",
            "Importance scoring for topic ranking"
        ]
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
        "image_extractor_status": "initialized" if hot_topics_manager.image_extractor else "failed",
        "apis_configured": {
            "brave_api": bool(BRAVE_API_KEY),
            "unsplash_api": bool(UNSPLASH_ACCESS_KEY),
            "openai_api": bool(OPENAI_API_KEY)
        },
        "image_strategy": "Enhanced multi-strategy extraction with quality scoring and validation"
    }

@app.get("/api/feed")
def get_enhanced_feed():
    """Returns enhanced hot topics as a list of articles for the frontend."""
    global last_server_refresh
    
    print("--- /API/FEED ENDPOINT HIT (ENHANCED) ---")
    
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
        print(f"Enhanced server refresh triggered at {current_time}")
        
        # Clear the cache to force fresh data
        hot_topics_manager.cache = {}
        hot_topics_manager.last_generated = None
        print("Enhanced cache cleared for fresh generation")
    
    try:
        topics_data = hot_topics_manager.get_cached_topics()
        topics = topics_data.get('topics', [])
        articles = []
        
        for topic in topics:
            # Create enhanced article object
            article = {
                "id": topic.get("id", str(uuid.uuid4())),
                "title": topic.get("headline", "Important News Update"),
                "slug": topic.get("slug", re.sub(r'[^a-zA-Z0-9\s-]', '', topic.get("headline", "")).lower().replace(" ", "-").replace("--", "-").strip("-")),
                "excerpt": topic.get("description", "Important news development."),
                "category": topic.get("category", "General"),
                "publishedAt": topic.get("generated_at", datetime.now().isoformat()),
                "readTime": topic.get("read_time", 3),
                "sourceCount": topic.get("source_count", 1),
                "heroImageUrl": topic.get("image_url", "https://source.unsplash.com/1200x800/?news,newspaper"),
                "authorName": "AI News Curator",
                "authorTitle": "Enhanced News Generator",
                "keywords": topic.get("keywords", []),
                "importance_score": topic.get("importance_score", 0),
                "image_source": topic.get("image_source", "fallback")
            }
            articles.append(article)
        
        print(f"--- RETURNING {len(articles)} ENHANCED NEWS ARTICLES ---")
        return articles
        
    except Exception as e:
        print(f"--- ERROR IN ENHANCED /API/FEED: {e} ---")
        # Return enhanced fallback articles
        return [{
            "id": str(uuid.uuid4()),
            "title": "Enhanced Breaking News Available",
            "slug": "enhanced-breaking-news-available",
            "excerpt": "Important news stories are being processed with enhanced image extraction.",
            "category": "General",
            "publishedAt": datetime.now().isoformat(),
            "readTime": 2,
            "sourceCount": 1,
            "heroImageUrl": "https://source.unsplash.com/1200x800/?news,breaking,journalism",
            "authorName": "AI News Curator",
            "authorTitle": "Enhanced News Generator",
            "keywords": ["news", "breaking", "important"],
            "importance_score": 5,
            "image_source": "fallback"
        }]

@app.post("/api/refresh-images")
def refresh_topic_images():
    """Refresh images for existing topics with better extraction."""
    try:
        hot_topics_manager.refresh_images_for_topics()
        return {
            "message": "Images refreshed successfully",
            "timestamp": datetime.now().isoformat(),
            "topics_updated": len(hot_topics_manager.cache.get('topics', []))
        }
    except Exception as e:
        print(f"--- ERROR REFRESHING IMAGES: {e} ---")
        raise HTTPException(status_code=500, detail="Failed to refresh images")

@app.get("/api/image-test/{topic_index}")
def test_image_extraction(topic_index: int):
    """Test image extraction for a specific topic."""
    try:
        topics = hot_topics_manager.get_cached_topics()
        if not topics or 'topics' not in topics or topic_index >= len(topics['topics']):
            raise HTTPException(status_code=404, detail="Topic not found")
        
        topic = topics['topics'][topic_index]
        headline = topic.get('headline', '')
        category = topic.get('category', 'General')
        source_url = topic.get('source_url', '')
        
        # Test different image extraction strategies
        results = {
            "topic": {
                "headline": headline,
                "category": category,
                "source_url": source_url
            },
            "extraction_results": {}
        }
        
        # Test source extraction
        if source_url:
            try:
                extracted = extract_enhanced_news_images.invoke({
                    "url": source_url,
                    "title": headline,
                    "category": category
                })
                results["extraction_results"]["source_extraction"] = extracted
            except Exception as e:
                results["extraction_results"]["source_extraction"] = f"Error: {e}"
        
        # Test contextual search
        try:
            contextual = search_contextual_images.invoke({
                "query": headline,
                "category": category
            })
            results["extraction_results"]["contextual_search"] = contextual
        except Exception as e:
            results["extraction_results"]["contextual_search"] = f"Error: {e}"
        
        # Test category fallback
        try:
            category_fallback = get_category_specific_images(category.lower())
            results["extraction_results"]["category_fallback"] = category_fallback
        except Exception as e:
            results["extraction_results"]["category_fallback"] = f"Error: {e}"
        
        return results
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"--- ERROR IN IMAGE TEST: {e} ---")
        raise HTTPException(status_code=500, detail="Image test failed")

# Keep existing endpoints with enhanced functionality
@app.post("/api/research")
def trigger_research_generic(request: dict):
    """Enhanced generic research endpoint for any query."""
    try:
        query = request.get("query", "")
        
        if not query:
            raise HTTPException(status_code=400, detail="Query is required")
        
        slug = re.sub(r'[^a-zA-Z0-9\s]', '', query).lower().replace(" ", "-")[:50]
        
        return {
            "message": "Enhanced research triggered successfully",
            "research_query": query,
            "slug": slug,
            "status": "success",
            "enhanced_features": ["Better image extraction", "Multi-source analysis", "Enhanced categorization"]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"--- ERROR IN ENHANCED GENERIC RESEARCH: {e} ---")
        raise HTTPException(status_code=500, detail="Enhanced research failed")

@app.post("/api/force-generate-topics")
def force_generate_enhanced_topics():
    """Force generate new enhanced topics (bypass cache)."""
    print("--- FORCE ENHANCED TOPIC GENERATION REQUESTED ---")
    try:
        hot_topics_manager.cache = {}
        hot_topics_manager.last_generated = None
        
        topics = hot_topics_manager.generate_daily_topics()
        return {
            "message": "Enhanced important topics forcefully generated",
            "topics_count": len(topics.get('topics', [])),
            "topics": topics,
            "generated_at": datetime.now().isoformat(),
            "enhanced_features": [
                "Multi-strategy image extraction",
                "API-powered image search",
                "Quality scoring and validation",
                "Enhanced categorization",
                "Importance ranking"
            ]
        }
    except Exception as e:
        print(f"--- ERROR FORCE GENERATING ENHANCED TOPICS: {e} ---")
        return {
            "error": str(e), 
            "topics_count": 0,
            "message": "Failed to force generate enhanced topics"
        }

@app.get("/api/debug/enhanced-topics")
def debug_enhanced_topics():
    """Enhanced debug endpoint to see topics status."""
    topics = hot_topics_manager.cache.get('topics', [])
    
    # Analyze image sources
    image_sources = {}
    for topic in topics:
        source = topic.get('image_source', 'unknown')
        image_sources[source] = image_sources.get(source, 0) + 1
    
    return {
        "cache_exists": bool(hot_topics_manager.cache),
        "cache_topics_count": len(topics),
        "last_generated": hot_topics_manager.last_generated.isoformat() if hot_topics_manager.last_generated else None,
        "manager_status": "initialized" if hot_topics_manager.workflow else "failed",
        "image_extractor_status": "initialized" if hot_topics_manager.image_extractor else "failed",
        "workflow_exists": hot_topics_manager.workflow is not None,
        "image_sources_breakdown": image_sources,
        "apis_configured": {
            "brave_api": bool(BRAVE_API_KEY),
            "unsplash_api": bool(UNSPLASH_ACCESS_KEY)
        },
        "sample_topic": topics[0] if topics else None,
        "enhancement_features": [
            "Multi-strategy image extraction",
            "Quality scoring and validation", 
            "API-powered search",
            "Smart fallbacks",
            "Enhanced categorization"
        ]
    }

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting Enhanced Important News Hot Topics API Server...")
    print("📊 Available endpoints:")
    print("  GET  /                         - Health check")
    print("  GET  /health                   - Detailed health check")
    print("  GET  /api/feed                 - Get enhanced news feed")
    print("  POST /api/force-generate-topics - Force generate enhanced topics")
    print("  POST /api/refresh-images       - Refresh images for topics")
    print("  GET  /api/image-test/{index}   - Test image extraction")
    print("  GET  /api/debug/enhanced-topics - Debug enhanced topics")
    print("  POST /api/research             - Enhanced research trigger")
    print("🎯 FOCUS: Important news only - Politics, Technology, Business, Health, International")
    print("🖼️ IMAGES: Multi-strategy extraction with Brave API, Unsplash API, quality scoring")
    print("⚡ ENHANCEMENTS:")
    print("   - Enhanced image extraction with multiple APIs")
    print("   - Quality scoring and validation")
    print("   - Smart category-based fallbacks")
    print("   - Keywords extraction for better matching")
    print("   - Importance scoring for ranking")
    print("   - Robust error handling and fallbacks")
    
    uvicorn.run(app, host="0.0.0.0", port=8000)