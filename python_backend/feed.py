import os
import re
import json
import uuid
import asyncio
import aiohttp
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, HttpUrl
from typing import List, Dict, Any, Optional, Union
from contextlib import asynccontextmanager
from dotenv import load_dotenv
import logging
import time
import random
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

load_dotenv()

# Configuration
class Config:
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
    CACHE_DURATION_HOURS = int(os.getenv("CACHE_DURATION_HOURS", "3"))
    MAX_TOPICS = int(os.getenv("MAX_TOPICS", "8"))
    MAX_HEADLINE_LENGTH = int(os.getenv("MAX_HEADLINE_LENGTH", "80"))
    MAX_DESCRIPTION_LENGTH = int(os.getenv("MAX_DESCRIPTION_LENGTH", "200"))
    REQUEST_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", "10"))

config = Config()

# Pydantic Models
class Topic(BaseModel):
    id: str = Field(..., description="Unique topic identifier")
    headline: str = Field(..., max_length=config.MAX_HEADLINE_LENGTH)
    description: str = Field(..., max_length=config.MAX_DESCRIPTION_LENGTH)
    category: str = Field(..., description="Topic category")
    slug: str = Field(..., description="URL-friendly slug")
    image_url: HttpUrl = Field(..., description="Topic image URL")
    generated_at: datetime = Field(default_factory=datetime.now)
    read_time: int = Field(default=3, ge=1, le=60)
    source_count: int = Field(default=1, ge=1)
    keywords: List[str] = Field(default_factory=list, max_items=5)
    importance_score: int = Field(default=5, ge=1, le=10)
    image_source: str = Field(default="fallback")

class Article(BaseModel):
    id: str
    title: str
    slug: str
    excerpt: str
    category: str
    publishedAt: datetime
    readTime: int
    sourceCount: int
    heroImageUrl: HttpUrl
    authorName: str = "AI News Curator"
    authorTitle: str = "News Generator"
    keywords: List[str]
    importance_score: int
    image_source: str

class ResearchRequest(BaseModel):
    query: str = Field(..., min_length=3, max_length=200)
    category: Optional[str] = None

class ApiResponse(BaseModel):
    message: str
    data: Optional[Dict[str, Any]] = None
    status: str = "success"
    timestamp: datetime = Field(default_factory=datetime.now)

# Enhanced image categories with more variety
CATEGORY_IMAGES = {
    "politics": [
        "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=1200&q=80",
        "https://images.unsplash.com/photo-1586892478025-2b5472316f22?w=1200&q=80",
        "https://images.unsplash.com/photo-1495476479092-6ece1898a101?w=1200&q=80",
        "https://images.unsplash.com/photo-1551836022-deb4988cc6c0?w=1200&q=80",
        "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1200&q=80"
    ],
    "technology": [
        "https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=1200&q=80",
        "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=1200&q=80",
        "https://images.unsplash.com/photo-1535378917042-10a22c95931a?w=1200&q=80",
        "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=1200&q=80",
        "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&q=80"
    ],
    "business": [
        "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&q=80",
        "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=1200&q=80",
        "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&q=80",
        "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=1200&q=80",
        "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1200&q=80"
    ],
    "health": [
        "https://images.unsplash.com/photo-1576091160399-112ba8d25d1f?w=1200&q=80",
        "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=1200&q=80",
        "https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=1200&q=80",
        "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=1200&q=80",
        "https://images.unsplash.com/photo-1584515933487-779824d29309?w=1200&q=80"
    ],
    "environment": [
        "https://images.unsplash.com/photo-1569163139394-de4e5f43e4e3?w=1200&q=80",
        "https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=1200&q=80",
        "https://images.unsplash.com/photo-1611273426858-450d8e3c9fce?w=1200&q=80",
        "https://images.unsplash.com/photo-1569163131394-de4e5f43e4e3?w=1200&q=80"
    ],
    "international": [
        "https://images.unsplash.com/photo-1526666923127-b2970f64b422?w=1200&q=80",
        "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&q=80",
        "https://images.unsplash.com/photo-1444927714506-8492d94b5ba0?w=1200&q=80"
    ],
    "general": [
        "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=1200&q=80",
        "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=1200&q=80",
        "https://images.unsplash.com/photo-1495020689067-958852a7765e?w=1200&q=80"
    ]
}

class AsyncImageExtractor:
    """Async image extraction from news URLs"""
    
    def __init__(self):
        self.timeout = aiohttp.ClientTimeout(total=config.REQUEST_TIMEOUT)
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
    
    async def extract_from_url(self, url: str) -> Optional[str]:
        """Extract main image from article URL asynchronously"""
        if not url or not url.startswith('http'):
            return None
        
        try:
            async with aiohttp.ClientSession(timeout=self.timeout, headers=self.headers) as session:
                async with session.get(url) as response:
                    if response.status != 200:
                        return None
                    
                    content = await response.text()
                    soup = BeautifulSoup(content, 'html.parser')
                    
                    # Try Open Graph image first
                    og_image = soup.find('meta', property='og:image')
                    if og_image and og_image.get('content'):
                        img_url = og_image['content']
                        return self._normalize_url(img_url, url)
                    
                    # Try Twitter card
                    twitter_image = soup.find('meta', {'name': 'twitter:image'})
                    if twitter_image and twitter_image.get('content'):
                        img_url = twitter_image['content']
                        return self._normalize_url(img_url, url)
                    
                    # Try to find first large image
                    images = soup.find_all('img', src=True)
                    for img in images:
                        src = img.get('src')
                        if src and any(keyword in src.lower() for keyword in ['hero', 'featured', 'main', 'article']):
                            return self._normalize_url(src, url)
                            
        except asyncio.TimeoutError:
            logger.warning(f"Timeout extracting image from {url}")
        except Exception as e:
            logger.error(f"Error extracting image from {url}: {e}")
            
        return None
    
    def _normalize_url(self, img_url: str, base_url: str) -> str:
        """Normalize image URL"""
        if img_url.startswith('//'):
            return 'https:' + img_url
        elif img_url.startswith('/'):
            return urljoin(base_url, img_url)
        return img_url

class EnhancedHotTopicsManager:
    def __init__(self):
        self.cache = {"topics": [], "generated_at": None}
        self.image_extractor = AsyncImageExtractor()
        self._lock = asyncio.Lock()
        
    async def fetch_trending_news(self) -> List[Dict[str, Any]]:
        """Fetch trending news using Tavily API with async support"""
        try:
            if config.TAVILY_API_KEY:
                # Note: Tavily client might need to be wrapped for async
                # For now, keeping the synchronous approach but with timeout handling
                return await asyncio.get_event_loop().run_in_executor(
                    None, self._fetch_with_tavily
                )
        except Exception as e:
            logger.error(f"Error fetching from Tavily: {e}")
        
        logger.info("Falling back to mock news data")
        return self.get_enhanced_mock_news()
    
    def _fetch_with_tavily(self) -> List[Dict[str, Any]]:
        """Synchronous Tavily fetch wrapped for executor"""
        try:
            from tavily import TavilyClient
            client = TavilyClient(api_key=config.TAVILY_API_KEY)
            
            queries = [
                "breaking news today politics government election",
                "technology AI artificial intelligence breakthrough today",
                "economy business markets finance stock today",
                "health medical research breakthrough vaccine today",
                "climate environment renewable energy today",
                "international global affairs diplomacy today",
                "science research discovery innovation today",
                "sports major events championships today"
            ]
            
            all_news = []
            for query in queries:
                try:
                    results = client.search(query, max_results=2)
                    for result in results.get('results', []):
                        if result.get("title") and result.get("url"):
                            all_news.append({
                                "title": result.get("title", ""),
                                "url": result.get("url", ""),
                                "content": result.get("content", ""),
                                "category": query.split()[0],
                                "published_date": result.get("published_date")
                            })
                except Exception as e:
                    logger.warning(f"Error with query '{query}': {e}")
                    continue
                
                # Small delay to be respectful to API
                time.sleep(0.1)
            
            return all_news[:config.MAX_TOPICS]
            
        except Exception as e:
            logger.error(f"Tavily API error: {e}")
            return []
    
    def get_enhanced_mock_news(self) -> List[Dict[str, Any]]:
        """Enhanced mock news with more variety and realistic content"""
        base_time = datetime.now()
        mock_articles = [
            {
                "title": "Congressional Leaders Announce Bipartisan Infrastructure Bill",
                "url": "https://example.com/politics-infrastructure",
                "content": "House and Senate leaders unveiled a comprehensive infrastructure package targeting roads, bridges, and broadband expansion across rural and urban areas.",
                "category": "politics",
                "published_date": (base_time - timedelta(hours=2)).isoformat()
            },
            {
                "title": "Revolutionary AI Model Shows Human-Level Reasoning Capabilities",
                "url": "https://example.com/tech-ai-breakthrough",
                "content": "Scientists demonstrate new neural architecture achieving unprecedented performance in logical reasoning and problem-solving tasks.",
                "category": "technology",
                "published_date": (base_time - timedelta(hours=4)).isoformat()
            },
            {
                "title": "Federal Reserve Adjusts Interest Rates Amid Economic Signals",
                "url": "https://example.com/business-fed-rates",
                "content": "The central bank's latest decision reflects ongoing efforts to balance inflation concerns with employment growth objectives.",
                "category": "business",
                "published_date": (base_time - timedelta(hours=6)).isoformat()
            },
            {
                "title": "Breakthrough Gene Therapy Shows Promise for Rare Diseases",
                "url": "https://example.com/health-gene-therapy",
                "content": "Clinical trials reveal significant improvement in patients with previously untreatable genetic conditions using novel CRISPR applications.",
                "category": "health",
                "published_date": (base_time - timedelta(hours=8)).isoformat()
            },
            {
                "title": "Global Climate Summit Announces $100 Billion Green Fund",
                "url": "https://example.com/environment-climate-fund",
                "content": "International coalition commits unprecedented funding for renewable energy projects and climate adaptation in developing nations.",
                "category": "environment",
                "published_date": (base_time - timedelta(hours=10)).isoformat()
            },
            {
                "title": "Major Trade Agreement Signed Between Pacific Nations",
                "url": "https://example.com/international-trade",
                "content": "Historic accord aims to reduce barriers and strengthen economic cooperation across the Pacific region, affecting billions in trade.",
                "category": "international",
                "published_date": (base_time - timedelta(hours=12)).isoformat()
            },
            {
                "title": "Space Mission Discovers Water on Previously Unknown Moons",
                "url": "https://example.com/science-space-discovery",
                "content": "Advanced telescopic observations reveal liquid water signatures on multiple celestial bodies within our solar system.",
                "category": "science",
                "published_date": (base_time - timedelta(hours=14)).isoformat()
            },
            {
                "title": "Olympic Champions Break Multiple World Records",
                "url": "https://example.com/sports-olympics-records",
                "content": "International competition sees unprecedented athletic achievements across swimming, track and field, and gymnastics events.",
                "category": "sports",
                "published_date": (base_time - timedelta(hours=16)).isoformat()
            }
        ]
        return mock_articles
    
    def categorize_article(self, title: str, content: str) -> str:
        """Enhanced article categorization with more categories and better logic"""
        text = (title + " " + content).lower()
        
        # Enhanced categorization with weighted keywords
        categories = {
            "politics": {
                "keywords": ["congress", "election", "government", "president", "senate", "policy", "voting", "campaign", "democracy", "legislation"],
                "weight": 1.0
            },
            "technology": {
                "keywords": ["ai", "artificial intelligence", "technology", "software", "digital", "innovation", "cyber", "computer", "algorithm", "data"],
                "weight": 1.0
            },
            "business": {
                "keywords": ["economy", "market", "business", "finance", "stock", "trade", "investment", "banking", "corporate", "startup"],
                "weight": 1.0
            },
            "health": {
                "keywords": ["health", "medical", "vaccine", "hospital", "treatment", "disease", "medicine", "patient", "clinical", "therapy"],
                "weight": 1.0
            },
            "environment": {
                "keywords": ["climate", "environment", "carbon", "renewable", "energy", "pollution", "sustainability", "green", "emissions", "conservation"],
                "weight": 1.0
            },
            "international": {
                "keywords": ["international", "global", "world", "foreign", "diplomacy", "nations", "embassy", "treaty", "bilateral", "multilateral"],
                "weight": 1.0
            },
            "science": {
                "keywords": ["science", "research", "discovery", "study", "experiment", "scientist", "breakthrough", "innovation", "analysis", "laboratory"],
                "weight": 1.0
            },
            "sports": {
                "keywords": ["sports", "team", "game", "championship", "olympic", "athlete", "competition", "tournament", "match", "season"],
                "weight": 1.0
            }
        }
        
        scores = {}
        for category, data in categories.items():
            score = sum(data["weight"] for keyword in data["keywords"] if keyword in text)
            if score > 0:
                scores[category] = score
        
        if scores:
            return max(scores.items(), key=lambda x: x[1])[0].capitalize()
        return "General"
    
    async def get_image_for_article(self, article: Dict[str, Any]) -> str:
        """Async image retrieval with fallback strategy"""
        # Try to extract from article URL
        if article.get("url"):
            extracted = await self.image_extractor.extract_from_url(article["url"])
            if extracted:
                return extracted
        
        # Use category-specific fallback
        category = article.get("category", "general").lower()
        if category in CATEGORY_IMAGES:
            return random.choice(CATEGORY_IMAGES[category])
        
        # Final fallback
        return random.choice(CATEGORY_IMAGES["general"])
    
    async def generate_daily_topics(self) -> Dict[str, Any]:
        """Generate hot topics from news with async support"""
        async with self._lock:
            logger.info("Starting topic generation process")
            
            # Fetch news
            news_items = await self.fetch_trending_news()
            logger.info(f"Fetched {len(news_items)} news items")
            
            # Process into topics with parallel image fetching
            tasks = []
            for news in news_items[:config.MAX_TOPICS]:
                tasks.append(self._process_single_article(news))
            
            topics = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Filter out exceptions and None values
            valid_topics = [t for t in topics if isinstance(t, dict) and t is not None]
            
            self.cache = {
                "topics": valid_topics,
                "generated_at": datetime.now()
            }
            
            logger.info(f"Generated {len(valid_topics)} valid topics")
            return self.cache
    
    async def _process_single_article(self, news: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Process a single article into a topic"""
        try:
            category = self.categorize_article(news["title"], news.get("content", ""))
            image_url = await self.get_image_for_article({**news, "category": category})
            
            topic = {
                "id": str(uuid.uuid4()),
                "headline": news["title"][:config.MAX_HEADLINE_LENGTH],
                "description": news.get("content", "Breaking news development.")[:config.MAX_DESCRIPTION_LENGTH],
                "category": category,
                "slug": re.sub(r'[^a-z0-9]+', '-', news["title"].lower())[:100].strip('-'),
                "image_url": image_url,
                "generated_at": datetime.now(),
                "read_time": self._calculate_read_time(news.get("content", "")),
                "source_count": 1,
                "keywords": self._extract_enhanced_keywords(news["title"] + " " + news.get("content", "")),
                "importance_score": self._calculate_importance_score(news),
                "image_source": "extraction" if news.get("url") and "example.com" not in news["url"] else "fallback"
            }
            return topic
        except Exception as e:
            logger.error(f"Error processing article: {e}")
            return None
    
    def _calculate_read_time(self, content: str) -> int:
        """Calculate estimated read time based on content length"""
        word_count = len(content.split()) if content else 100
        # Assuming 200 words per minute reading speed
        read_time = max(1, round(word_count / 200))
        return min(read_time, 10)  # Cap at 10 minutes
    
    def _extract_enhanced_keywords(self, text: str) -> List[str]:
        """Enhanced keyword extraction with better filtering"""
        words = re.findall(r'\b[a-zA-Z]{4,}\b', text.lower())
        
        # Enhanced stop words list
        stop_words = {
            'this', 'that', 'with', 'from', 'have', 'been', 'will', 'they', 'their',
            'were', 'said', 'each', 'which', 'them', 'than', 'many', 'some', 'time',
            'very', 'when', 'much', 'then', 'these', 'two', 'more', 'her', 'would',
            'there', 'our', 'what', 'your', 'way', 'has', 'had', 'who', 'oil', 'sit',
            'now', 'find', 'long', 'get', 'here', 'how', 'make', 'may', 'use', 'water'
        }
        
        # Filter and rank keywords
        keyword_freq = {}
        for word in words:
            if word not in stop_words and len(word) > 3:
                keyword_freq[word] = keyword_freq.get(word, 0) + 1
        
        # Return top keywords sorted by frequency
        keywords = sorted(keyword_freq.items(), key=lambda x: x[1], reverse=True)
        return [k[0].title() for k in keywords[:5]]
    
    def _calculate_importance_score(self, news: Dict[str, Any]) -> int:
        """Calculate importance score based on various factors"""
        score = 5  # Base score
        
        title = news.get("title", "").lower()
        content = news.get("content", "").lower()
        
        # Boost for certain keywords
        high_impact_words = [
            "breaking", "urgent", "major", "historic", "unprecedented", "crisis",
            "breakthrough", "scandal", "victory", "defeat", "announces", "reveals"
        ]
        
        for word in high_impact_words:
            if word in title:
                score += 2
            elif word in content:
                score += 1
        
        # Cap the score
        return min(score, 10)
    
    async def get_cached_topics(self) -> Dict[str, List[Dict[str, Any]]]:
        """Get topics from cache or generate new ones"""
        cache_time = self.cache.get("generated_at")
        
        # Generate if cache is empty or older than configured duration
        if (not cache_time or 
            datetime.now() - cache_time > timedelta(hours=config.CACHE_DURATION_HOURS) or
            not self.cache.get("topics")):
            await self.generate_daily_topics()
        
        return {"topics": self.cache.get("topics", [])}

# Initialize manager
hot_topics_manager = EnhancedHotTopicsManager()

# Lifespan management
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting Hot Topics API...")
    # Generate initial topics
    try:
        await hot_topics_manager.generate_daily_topics()
        logger.info("Initial topics generated successfully")
    except Exception as e:
        logger.error(f"Error generating initial topics: {e}")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Hot Topics API...")

# FastAPI App with lifespan management
app = FastAPI(
    title="Enhanced Hot Topics API",
    description="AI-powered news topics generator with async support",
    version="3.0.0",
    lifespan=lifespan
)

# Enhanced CORS with more specific settings
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    max_age=3600  # Cache preflight requests for 1 hour
)

# Custom exception handler
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "message": exc.detail,
            "status": "error",
            "timestamp": datetime.now().isoformat()
        }
    )

@app.get("/", response_model=ApiResponse)
async def read_root():
    """Root endpoint with API information"""
    return ApiResponse(
        message="Enhanced Hot Topics API is running",
        data={
            "version": "3.0.0",
            "features": ["async_support", "enhanced_caching", "better_categorization", "image_extraction"],
            "endpoints": ["/health", "/api/feed", "/api/force-generate-topics", "/api/refresh-images", "/api/research"]
        }
    )

@app.get("/health", response_model=ApiResponse)
async def health_check():
    """Enhanced health check with more details"""
    cache_info = hot_topics_manager.cache
    return ApiResponse(
        message="Service is healthy",
        data={
            "cache_status": "active" if cache_info.get("topics") else "empty",
            "topics_count": len(cache_info.get("topics", [])),
            "last_generated": cache_info.get("generated_at").isoformat() if cache_info.get("generated_at") else None,
            "cache_age_minutes": (
                (datetime.now() - cache_info.get("generated_at")).total_seconds() / 60 
                if cache_info.get("generated_at") else None
            ),
            "config": {
                "max_topics": config.MAX_TOPICS,
                "cache_duration_hours": config.CACHE_DURATION_HOURS,
                "tavily_enabled": bool(config.TAVILY_API_KEY)
            }
        }
    )

@app.get("/api/feed", response_model=List[Article])
async def get_feed():
    """Get news feed with enhanced error handling"""
    logger.info("Feed endpoint requested")
    
    try:
        topics_data = await hot_topics_manager.get_cached_topics()
        topics = topics_data.get("topics", [])
        
        articles = []
        for topic in topics:
            try:
                article = Article(
                    id=topic.get("id"),
                    title=topic.get("headline"),
                    slug=topic.get("slug"),
                    excerpt=topic.get("description"),
                    category=topic.get("category"),
                    publishedAt=topic.get("generated_at"),
                    readTime=topic.get("read_time", 3),
                    sourceCount=topic.get("source_count", 1),
                    heroImageUrl=topic.get("image_url"),
                    keywords=topic.get("keywords", []),
                    importance_score=topic.get("importance_score", 5),
                    image_source=topic.get("image_source", "fallback")
                )
                articles.append(article)
            except Exception as e:
                logger.error(f"Error creating article from topic: {e}")
                continue
        
        logger.info(f"Returning {len(articles)} articles")
        return articles
        
    except Exception as e:
        logger.error(f"Error in feed endpoint: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch feed")

@app.post("/api/force-generate-topics", response_model=ApiResponse)
async def force_generate_topics(background_tasks: BackgroundTasks):
    """Force generate new topics with background processing"""
    logger.info("Force topic generation requested")
    
    try:
        # Clear cache
        hot_topics_manager.cache = {"topics": [], "generated_at": None}
        
        # Generate new topics
        topics = await hot_topics_manager.generate_daily_topics()
        
        return ApiResponse(
            message="Topics generated successfully",
            data={
                "topics_count": len(topics.get("topics", [])),
                "categories": list(set(t.get("category", "Unknown") for t in topics.get("topics", []))),
                "generation_time": topics.get("generated_at").isoformat() if topics.get("generated_at") else None
            }
        )
        
    except Exception as e:
        logger.error(f"Error generating topics: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate topics: {str(e)}")

@app.post("/api/refresh-images", response_model=ApiResponse)
async def refresh_images():
    """Refresh images for existing topics"""
    try:
        topics = hot_topics_manager.cache.get("topics", [])
        updated_count = 0
        
        for topic in topics:
            category = topic.get("category", "general").lower()
            if category in CATEGORY_IMAGES:
                topic["image_url"] = random.choice(CATEGORY_IMAGES[category])
                topic["image_source"] = "refreshed"
                updated_count += 1
        
        return ApiResponse(
            message="Images refreshed successfully",
            data={
                "topics_updated": updated_count,
                "total_topics": len(topics)
            }
        )
        
    except Exception as e:
        logger.error(f"Error refreshing images: {e}")
        raise HTTPException(status_code=500, detail="Failed to refresh images")

@app.post("/api/research", response_model=ApiResponse)
async def trigger_research(request: ResearchRequest):
    """Enhanced research endpoint with validation"""
    try:
        query = request.query.strip()
        category = request.category
        
        slug = re.sub(r'[^a-z0-9]+', '-', query.lower())[:50].strip('-')
        
        # You could extend this to actually perform research
        # For now, it's a placeholder that could trigger background research
        
        return ApiResponse(
            message="Research request processed",
            data={
                "query": query,
                "category": category,
                "slug": slug,
                "estimated_completion": (datetime.now() + timedelta(minutes=5)).isoformat()
            }
        )
        
    except Exception as e:
        logger.error(f"Error in research endpoint: {e}")
        raise HTTPException(status_code=500, detail="Failed to process research request")

# Additional utility endpoints
@app.get("/api/categories", response_model=ApiResponse)
async def get_categories():
    """Get available categories"""
    return ApiResponse(
        message="Available categories",
        data={
            "categories": list(CATEGORY_IMAGES.keys()),
            "total_count": len(CATEGORY_IMAGES)
        }
    )

@app.get("/api/stats", response_model=ApiResponse)
async def get_stats():
    """Get API statistics"""
    topics = hot_topics_manager.cache.get("topics", [])
    
    category_counts = {}
    for topic in topics:
        cat = topic.get("category", "Unknown")
        category_counts[cat] = category_counts.get(cat, 0) + 1
    
    return ApiResponse(
        message="API statistics",
        data={
            "total_topics": len(topics),
            "category_distribution": category_counts,
            "average_importance": sum(t.get("importance_score", 0) for t in topics) / len(topics) if topics else 0,
            "cache_status": {
                "is_fresh": (
                    datetime.now() - hot_topics_manager.cache.get("generated_at", datetime.min)
                ).total_seconds() < (config.CACHE_DURATION_HOURS * 3600) if hot_topics_manager.cache.get("generated_at") else False,
                "last_refresh": hot_topics_manager.cache.get("generated_at").isoformat() if hot_topics_manager.cache.get("generated_at") else None
            }
        }
    )

# Background task for periodic refresh
async def periodic_refresh():
    """Background task to refresh topics periodically"""
    while True:
        try:
            await asyncio.sleep(config.CACHE_DURATION_HOURS * 3600)  # Sleep for cache duration
            logger.info("Starting periodic topic refresh")
            await hot_topics_manager.generate_daily_topics()
            logger.info("Periodic refresh completed")
        except Exception as e:
            logger.error(f"Error in periodic refresh: {e}")

# Start background task
@app.on_event("startup")
async def start_background_tasks():
    asyncio.create_task(periodic_refresh())

if __name__ == "__main__":
    import uvicorn
    
    print("🚀 Starting Enhanced Hot Topics API Server...")
    print(f"📊 Max Topics: {config.MAX_TOPICS}")
    print(f"⏰ Cache Duration: {config.CACHE_DURATION_HOURS} hours")
    print(f"🔑 Tavily API: {'Enabled' if config.TAVILY_API_KEY else 'Disabled (using mock data)'}")
    
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8000,
        log_level="info",
        access_log=True
    )