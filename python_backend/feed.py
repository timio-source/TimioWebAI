import os
import re
import json
import uuid
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional, TypedDict, Annotated
from dotenv import load_dotenv
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse, quote_plus
import time
import random

load_dotenv()

# Global variable for cache coordination
last_server_refresh = None

# API Configuration
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")

# Image fallback categories with high-quality news images
CATEGORY_IMAGES = {
    "politics": [
        "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=1200&q=80",
        "https://images.unsplash.com/photo-1586892478025-2b5472316f22?w=1200&q=80",
        "https://images.unsplash.com/photo-1495476479092-6ece1898a101?w=1200&q=80"
    ],
    "technology": [
        "https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=1200&q=80",
        "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=1200&q=80",
        "https://images.unsplash.com/photo-1535378917042-10a22c95931a?w=1200&q=80"
    ],
    "business": [
        "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&q=80",
        "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=1200&q=80",
        "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&q=80"
    ],
    "health": [
        "https://images.unsplash.com/photo-1576091160399-112ba8d25d1f?w=1200&q=80",
        "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=1200&q=80",
        "https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=1200&q=80"
    ],
    "environment": [
        "https://images.unsplash.com/photo-1569163139394-de4e5f43e4e3?w=1200&q=80",
        "https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=1200&q=80"
    ],
    "international": [
        "https://images.unsplash.com/photo-1526666923127-b2970f64b422?w=1200&q=80",
        "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&q=80"
    ],
    "general": [
        "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=1200&q=80",
        "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=1200&q=80"
    ]
}

class ImageExtractor:
    """Simple image extraction from news URLs"""
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
    
    def extract_from_url(self, url: str) -> Optional[str]:
        """Extract main image from article URL"""
        if not url or not url.startswith('http'):
            return None
        
        try:
            response = self.session.get(url, timeout=5, allow_redirects=True)
            if response.status_code != 200:
                return None
                
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Try to find Open Graph image
            og_image = soup.find('meta', property='og:image')
            if og_image and og_image.get('content'):
                img_url = og_image['content']
                if img_url.startswith('//'):
                    img_url = 'https:' + img_url
                elif img_url.startswith('/'):
                    img_url = urljoin(url, img_url)
                return img_url
            
            # Try Twitter card
            twitter_image = soup.find('meta', {'name': 'twitter:image'})
            if twitter_image and twitter_image.get('content'):
                img_url = twitter_image['content']
                if img_url.startswith('//'):
                    img_url = 'https:' + img_url
                elif img_url.startswith('/'):
                    img_url = urljoin(url, img_url)
                return img_url
                
        except Exception as e:
            print(f"Error extracting image: {e}")
            
        return None

class HotTopicsManager:
    def __init__(self):
        self.cache = {"topics": []}
        self.last_generated = None
        self.image_extractor = ImageExtractor()
        
    def fetch_trending_news(self) -> List[Dict[str, Any]]:
        """Fetch trending news using Tavily API or fallback"""
        try:
            if TAVILY_API_KEY:
                from tavily import TavilyClient
                client = TavilyClient(api_key=TAVILY_API_KEY)
                
                queries = [
                    "breaking news today politics government",
                    "technology AI innovation breakthrough today",
                    "economy business markets finance today",
                    "health medical research breakthrough today",
                    "climate environment energy today",
                    "international global affairs today"
                ]
                
                all_news = []
                for query in queries:
                    try:
                        results = client.search(query, max_results=3)
                        for result in results.get('results', []):
                            all_news.append({
                                "title": result.get("title", ""),
                                "url": result.get("url", ""),
                                "content": result.get("content", ""),
                                "category": query.split()[0]
                            })
                    except:
                        continue
                
                return all_news[:10]
        except:
            pass
        
        # Fallback to mock data if API fails
        return self.get_mock_news()
    
    def get_mock_news(self) -> List[Dict[str, Any]]:
        """Return mock news data for testing"""
        return [
            {
                "title": "Major Policy Changes Announced in Congressional Session",
                "url": "https://example.com/politics1",
                "content": "Congress announced sweeping policy reforms today affecting multiple sectors.",
                "category": "politics"
            },
            {
                "title": "Breakthrough in AI Technology Promises New Applications",
                "url": "https://example.com/tech1",
                "content": "Researchers unveiled a new AI system with unprecedented capabilities.",
                "category": "technology"
            },
            {
                "title": "Federal Reserve Signals New Economic Strategy",
                "url": "https://example.com/business1",
                "content": "The Fed announced adjustments to monetary policy amid changing conditions.",
                "category": "business"
            },
            {
                "title": "Medical Breakthrough in Cancer Treatment Research",
                "url": "https://example.com/health1",
                "content": "Scientists report promising results from new treatment approach.",
                "category": "health"
            },
            {
                "title": "Climate Summit Reaches Historic Agreement",
                "url": "https://example.com/environment1",
                "content": "World leaders agreed on new climate targets and funding mechanisms.",
                "category": "environment"
            },
            {
                "title": "International Trade Agreement Reshapes Global Commerce",
                "url": "https://example.com/international1",
                "content": "New trade deal between major economies promises to boost global trade.",
                "category": "international"
            }
        ]
    
    def categorize_article(self, title: str, content: str) -> str:
        """Categorize article based on content"""
        text = (title + " " + content).lower()
        
        categories = {
            "politics": ["congress", "election", "government", "president", "senate", "policy"],
            "technology": ["ai", "technology", "software", "digital", "innovation", "cyber"],
            "business": ["economy", "market", "business", "finance", "stock", "trade"],
            "health": ["health", "medical", "vaccine", "hospital", "treatment", "disease"],
            "environment": ["climate", "environment", "carbon", "renewable", "energy"],
            "international": ["international", "global", "world", "foreign", "diplomacy"]
        }
        
        scores = {}
        for category, keywords in categories.items():
            score = sum(1 for keyword in keywords if keyword in text)
            if score > 0:
                scores[category] = score
        
        if scores:
            return max(scores.items(), key=lambda x: x[1])[0]
        return "general"
    
    def get_image_for_article(self, article: Dict[str, Any]) -> str:
        """Get image for article with fallback strategy"""
        # Try to extract from article URL
        if article.get("url"):
            extracted = self.image_extractor.extract_from_url(article["url"])
            if extracted:
                return extracted
        
        # Use category-specific fallback
        category = article.get("category", "general").lower()
        if category in CATEGORY_IMAGES:
            return random.choice(CATEGORY_IMAGES[category])
        
        # Final fallback
        return "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=1200&q=80"
    
    def generate_daily_topics(self) -> Dict[str, List[Dict[str, Any]]]:
        """Generate hot topics from news"""
        print("--- GENERATING HOT TOPICS ---")
        
        # Fetch news
        news_items = self.fetch_trending_news()
        
        # Process into topics
        topics = []
        for i, news in enumerate(news_items[:8]):  # Limit to 8 topics
            category = self.categorize_article(news["title"], news.get("content", ""))
            
            topic = {
                "id": str(uuid.uuid4()),
                "headline": news["title"][:80],  # Limit headline length
                "description": news.get("content", "Breaking news development.")[:200],
                "category": category.capitalize(),
                "slug": re.sub(r'[^a-z0-9]+', '-', news["title"].lower())[:100],
                "image_url": self.get_image_for_article({**news, "category": category}),
                "generated_at": datetime.now().isoformat(),
                "read_time": 3,
                "source_count": 1,
                "keywords": self.extract_keywords(news["title"]),
                "importance_score": random.randint(5, 10),
                "image_source": "extraction" if news.get("url") else "fallback"
            }
            topics.append(topic)
        
        self.cache = {"topics": topics}
        self.last_generated = datetime.now()
        
        print(f"--- GENERATED {len(topics)} TOPICS ---")
        return self.cache
    
    def extract_keywords(self, text: str) -> List[str]:
        """Extract simple keywords from text"""
        words = re.findall(r'\b[a-zA-Z]{4,}\b', text.lower())
        stop_words = {'this', 'that', 'with', 'from', 'have', 'been', 'will', 'they', 'their'}
        keywords = [w for w in words if w not in stop_words][:3]
        return keywords
    
    def get_cached_topics(self) -> Dict[str, List[Dict[str, Any]]]:
        """Get topics from cache or generate new ones"""
        # Generate if cache is empty or older than 3 hours
        if (not self.last_generated or 
            datetime.now() - self.last_generated > timedelta(hours=3) or
            not self.cache.get("topics")):
            return self.generate_daily_topics()
        
        return self.cache

# Initialize manager
hot_topics_manager = HotTopicsManager()

# FastAPI App
app = FastAPI(
    title="Hot Topics API",
    description="AI-powered news topics generator",
    version="2.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {
        "message": "Hot Topics API is running",
        "version": "2.0.0",
        "status": "healthy"
    }

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "cache_status": "active" if hot_topics_manager.cache.get("topics") else "empty",
        "topics_count": len(hot_topics_manager.cache.get("topics", []))
    }

@app.get("/api/feed")
def get_feed():
    """Get news feed"""
    print("--- /API/FEED ENDPOINT HIT ---")
    
    try:
        topics_data = hot_topics_manager.get_cached_topics()
        topics = topics_data.get("topics", [])
        
        articles = []
        for topic in topics:
            article = {
                "id": topic.get("id"),
                "title": topic.get("headline"),
                "slug": topic.get("slug"),
                "excerpt": topic.get("description"),
                "category": topic.get("category"),
                "publishedAt": topic.get("generated_at"),
                "readTime": topic.get("read_time", 3),
                "sourceCount": topic.get("source_count", 1),
                "heroImageUrl": topic.get("image_url"),
                "authorName": "AI News Curator",
                "authorTitle": "News Generator",
                "keywords": topic.get("keywords", []),
                "importance_score": topic.get("importance_score", 5),
                "image_source": topic.get("image_source", "fallback")
            }
            articles.append(article)
        
        print(f"--- RETURNING {len(articles)} ARTICLES ---")
        return articles
        
    except Exception as e:
        print(f"--- ERROR IN /API/FEED: {e} ---")
        return []

@app.post("/api/force-generate-topics")
def force_generate_topics():
    """Force generate new topics"""
    print("--- FORCE TOPIC GENERATION REQUESTED ---")
    try:
        hot_topics_manager.cache = {"topics": []}
        hot_topics_manager.last_generated = None
        
        topics = hot_topics_manager.generate_daily_topics()
        return {
            "message": "Topics generated successfully",
            "topics_count": len(topics.get("topics", [])),
            "generated_at": datetime.now().isoformat()
        }
    except Exception as e:
        print(f"--- ERROR GENERATING TOPICS: {e} ---")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/refresh-images")
def refresh_images():
    """Refresh images for existing topics"""
    try:
        if hot_topics_manager.cache.get("topics"):
            for topic in hot_topics_manager.cache["topics"]:
                # Re-fetch image
                category = topic.get("category", "general").lower()
                topic["image_url"] = random.choice(CATEGORY_IMAGES.get(category, CATEGORY_IMAGES["general"]))
                topic["image_source"] = "refreshed"
        
        return {
            "message": "Images refreshed",
            "topics_updated": len(hot_topics_manager.cache.get("topics", []))
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/research")
def trigger_research(request: dict):
    """Research endpoint"""
    query = request.get("query", "")
    if not query:
        raise HTTPException(status_code=400, detail="Query required")
    
    slug = re.sub(r'[^a-z0-9]+', '-', query.lower())[:50]
    
    return {
        "message": "Research triggered",
        "query": query,
        "slug": slug,
        "status": "success"
    }

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting Hot Topics API Server...")
    uvicorn.run(app, host="0.0.0.0", port=8000)