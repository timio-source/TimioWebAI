import os
import re
import json
import uuid
import asyncio
import threading
import time
import random
import logging
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from functools import wraps
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
from urllib.parse import urljoin, urlparse, quote
from openai import RateLimitError

from schemas import ResearchReport

# Define scrape_website tool
@tool
def scrape_website(url: str) -> str:
    """Scrape the main textual content from a website URL."""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        }
        response = requests.get(url, timeout=10, headers=headers)
        response.raise_for_status()
        soup = BeautifulSoup(response.content, 'html.parser')
        # Extract main content from common tags
        main_content = ''
        for tag in ['article', '.main-content', '.content', '.post-content', 'body']:
            section = soup.select_one(tag)
            if section:
                main_content = section.get_text(separator='\n', strip=True)
                break
        if not main_content:
            main_content = soup.get_text(separator='\n', strip=True)
        return main_content[:5000]  # Limit to 5000 chars
    except Exception as e:
        return f"Error scraping website: {e}"

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Global Variables ---
# In-Memory Cache - A simple dictionary to store generated reports by slug
report_cache: Dict[str, ResearchReport] = {}

# Server refresh tracking
last_server_refresh = None

# Rate limiting: Reduced to 1 worker to avoid concurrent rate limit hits
executor = ThreadPoolExecutor(max_workers=1)

# Article Generation Queue
article_generation_queue = []
article_generation_lock = threading.Lock()
is_generating_articles = False

# Rate limiting decorator
def with_rate_limit_retry(max_retries=3, base_delay=2):
    """Decorator to handle rate limit errors with exponential backoff."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except RateLimitError as e:
                    if attempt == max_retries - 1:
                        logger.error(f"Rate limit exceeded after {max_retries} attempts: {e}")
                        raise
                    
                    # Extract wait time from error message if available
                    error_msg = str(e)
                    wait_time = base_delay * (2 ** attempt)  # Exponential backoff
                    
                    # Try to parse the suggested wait time from the error
                    match = re.search(r'Please try again in (\d+\.?\d*)s', error_msg)
                    if match:
                        suggested_wait = float(match.group(1))
                        wait_time = max(wait_time, suggested_wait)
                    
                    # Add some jitter to avoid thundering herd
                    jitter = random.uniform(0.1, 0.5)
                    total_wait = wait_time + jitter
                    
                    logger.warning(f"Rate limit hit (attempt {attempt + 1}/{max_retries}), waiting {total_wait:.2f}s")
                    time.sleep(total_wait)
                    
                except Exception as e:
                    logger.error(f"Non-rate-limit error in {func.__name__}: {e}")
                    raise
            
            return None
        return wrapper
    return decorator

# Queue management functions
def queue_article_generation(topics, force_research=False):
    """Add topics to the article generation queue. If force_research=True, research all topics regardless of cache."""
    global article_generation_queue, is_generating_articles
    
    with article_generation_lock:
        new_topics = []
        for topic in topics:
            # Generate slug for the topic
            topic_slug = topic.get('headline', '').lower().replace(' ', '-').replace('"', '')
            topic_slug = re.sub(r'[^a-z0-9-]', '', topic_slug)
            
            # Check if article is already cached (unless force_research is True)
            if force_research or topic_slug not in report_cache:
                # Check if already in queue
                already_queued = any(
                    existing_topic.get('slug') == topic_slug 
                    for existing_topic in article_generation_queue
                )
                
                if not already_queued:
                    topic['slug'] = topic_slug
                    topic['force_research'] = force_research
                    new_topics.append(topic)
        
        # Add new topics to queue
        article_generation_queue.extend(new_topics)
        logger.info(f"Queued {len(new_topics)} new articles for generation (force_research={force_research})")
    
    # Start background generation if not already running
    if not is_generating_articles and article_generation_queue:
        logger.info("Starting background article generation")
        executor.submit(process_article_generation_queue)

def process_article_generation_queue():
    """Process articles in the generation queue with rate limiting."""
    global is_generating_articles, article_generation_queue
    
    with article_generation_lock:
        if is_generating_articles:
            return  # Already processing
        is_generating_articles = True
    
    try:
        processed_count = 0
        failed_count = 0
        
        while True:
            with article_generation_lock:
                if not article_generation_queue:
                    break
                topic = article_generation_queue.pop(0)
            
            topic_name = topic.get('headline', 'Unknown')
            logger.info(f"Generating article {processed_count + 1} for: {topic_name}")
            
            try:
                # Check if already cached before processing (unless this is a forced refresh)
                topic_slug = topic.get('slug', '')
                if topic_slug in report_cache and not topic.get('force_research', False):
                    logger.info(f"Article already cached: {topic_slug}")
                    continue
                
                logger.info(f"Starting generation for topic: {topic_name} (slug: {topic_slug})")
                
                # Generate the article with retry logic
                slug = generate_article_with_retry(topic)
                
                if slug:
                    processed_count += 1
                    logger.info(f"Article generated and cached: {slug}")
                    
                    # Verify the cached article has all required sections
                    if slug in report_cache:
                        cached_report = report_cache[slug]
                        required_sections = ['article', 'executive_summary', 'timeline_items', 'cited_sources', 'raw_facts', 'perspectives']
                        missing_sections = [section for section in required_sections if not hasattr(cached_report, section) or not getattr(cached_report, section)]
                        
                        if missing_sections:
                            logger.error(f"CRITICAL: Cached article {slug} is missing sections: {missing_sections}")
                        else:
                            logger.info(f"Cached article {slug} has all required sections")
                    else:
                        logger.error(f"CRITICAL: Generated article {slug} not found in cache")
                else:
                    failed_count += 1
                    logger.error(f"Failed to generate article for: {topic_name}")
                
            except Exception as e:
                failed_count += 1
                logger.error(f"Error generating article for {topic_name}: {e}")
                
                # Re-queue the topic if it was a rate limit error
                if "rate limit" in str(e).lower():
                    with article_generation_lock:
                        article_generation_queue.append(topic)
                    logger.info(f"Re-queued {topic_name} due to rate limit")
            
            # Mandatory delay between articles to respect rate limits
            time.sleep(5)  # 5 seconds between each article generation
            
        logger.info(f"Background generation completed: {processed_count} successful, {failed_count} failed")
    
    except Exception as e:
        logger.error(f"Error in background article generation: {e}")
    
    finally:
        with article_generation_lock:
            is_generating_articles = False

# Rate-limited article generation function
@with_rate_limit_retry(max_retries=5, base_delay=3)
def generate_article_with_retry(topic):
    """Generate article with rate limit handling."""
    return asyncio.run(generate_article_for_topic(topic))

async def generate_article_for_topic(topic):
    """Generate an article for a specific topic with rate limiting."""
    try:
        topic_headline = topic.get('headline', '')
        topic_slug = topic.get('slug', '')
        
        if not topic_headline:
            logger.error("No headline provided for topic")
            return None
        
        # Check if article is already cached (unless this is a forced refresh)
        if topic_slug in report_cache and not topic.get('force_research', False):
            logger.info(f"Article already cached: {topic_slug}")
            return topic_slug
        
        logger.info(f"Starting research for: {topic_headline}")
        
        # Create initial state for the research workflow
        initial_state = {
            "query": topic_headline,
            "messages": [],
            "scraped_data": [],
            "research_report": {},
            "image_urls": {}
        }
        
        # Execute the research workflow with rate limiting
        try:
            final_state = graph.invoke(initial_state, {"recursion_limit": 100})
        except RateLimitError as e:
            logger.error(f"Rate limit during graph execution: {e}")
            # Wait and retry once
            wait_time = 10
            logger.info(f"Waiting {wait_time}s before retry...")
            time.sleep(wait_time)
            final_state = graph.invoke(initial_state, {"recursion_limit": 100})
        
        # Extract the research report from the final state
        final_report_data = {}
        if final_state and 'research_report' in final_state:
            final_report_data = final_state['research_report']
        
        # Merge image URLs into the final report
        if final_state and 'image_urls' in final_state and final_state['image_urls']:
            if 'article' in final_report_data:
                final_report_data['article']['hero_image_url'] = final_state['image_urls']['hero_image']
            if 'cited_sources' in final_report_data and final_state['image_urls']['source_images']:
                for i, source in enumerate(final_report_data['cited_sources']):
                    if i < len(final_state['image_urls']['source_images']):
                        source['image_url'] = final_state['image_urls']['source_images'][i]
                    else:
                        source['image_url'] = "https://via.placeholder.com/400x300?text=Source+Image"
        
        # Assemble final report
        article_id = int(uuid.uuid4().int & (1<<31)-1)
        if 'article' in final_report_data:
            final_report_data['article']['slug'] = topic_slug
            final_report_data['article']['id'] = article_id
            final_report_data['article']['read_time'] = 5
            final_report_data['article']['source_count'] = len(final_state.get('scraped_data', []))
            final_report_data['article']['published_at'] = topic.get('generated_at', datetime.now().isoformat())
            final_report_data['article']['category'] = topic.get('category', 'Research')
            final_report_data['article']['author_name'] = "AI Agent"
            final_report_data['article']['author_title'] = "Research Specialist"
            
            # Use the topic's image if available
            if topic.get('image_url') and 'hero_image_url' not in final_report_data['article']:
                final_report_data['article']['hero_image_url'] = topic['image_url']
        
        # Add article_id to all sections
        for key in ['executive_summary', 'timeline_items', 'cited_sources', 'raw_facts', 'perspectives', 'conflicting_info']:
            if key in final_report_data:
                if isinstance(final_report_data[key], list):
                    for item in final_report_data[key]:
                        item['article_id'] = article_id
                else:
                    final_report_data[key]['article_id'] = article_id
        
        # ENSURE ALL REQUIRED SECTIONS EXIST - ROBUST VALIDATION
        logger.info(f"Validating all report sections for: {topic_headline}")
        
        # Ensure timeline_items exists and is not empty
        if 'timeline_items' not in final_report_data or not final_report_data['timeline_items']:
            logger.warning(f"Missing timeline_items for {topic_headline} - creating fallback")
            final_report_data['timeline_items'] = [{
                'article_id': article_id,
                'date': datetime.now().isoformat(),
                'title': 'Research Initiated',
                'description': f'Research on "{topic_headline}" was initiated',
                'type': 'research_start',
                'source_label': 'AI Research Agent'
            }]
        else:
            logger.info(f"timeline_items found: {len(final_report_data['timeline_items'])} items")
        
        # Ensure cited_sources exists and is not empty
        if 'cited_sources' not in final_report_data or not final_report_data['cited_sources']:
            logger.warning(f"Missing cited_sources for {topic_headline} - creating fallback")
            final_report_data['cited_sources'] = [{
                'article_id': article_id,
                'name': 'Research Sources',
                'type': 'web_search',
                'description': 'Various web sources consulted during research',
                'url': 'https://example.com/research-sources',
                'image_url': None
            }]
        else:
            logger.info(f"cited_sources found: {len(final_report_data['cited_sources'])} sources")
        
        # Ensure raw_facts exists and is not empty
        if 'raw_facts' not in final_report_data or not final_report_data['raw_facts']:
            logger.warning(f"Missing raw_facts for {topic_headline} - creating fallback")
            final_report_data['raw_facts'] = [{
                'article_id': article_id,
                'category': 'research',
                'facts': [f'Research was conducted on "{topic_headline}"']
            }]
        else:
            logger.info(f"raw_facts found: {len(final_report_data['raw_facts'])} fact groups")
        
        # Ensure perspectives exists and is not empty
        if 'perspectives' not in final_report_data or not final_report_data['perspectives']:
            logger.warning(f"Missing perspectives for {topic_headline} - creating fallback")
            final_report_data['perspectives'] = [{
                'article_id': article_id,
                'viewpoint': 'Research Summary',
                'description': f'Analysis of "{topic_headline}" based on available sources',
                'source': 'AI Research Agent',
                'color': 'blue'
            }]
        else:
            logger.info(f"perspectives found: {len(final_report_data['perspectives'])} perspectives")
        
        # Ensure executive_summary exists and is not empty
        if 'executive_summary' not in final_report_data or not final_report_data['executive_summary']:
            logger.warning(f"Missing executive_summary for {topic_headline} - creating fallback")
            final_report_data['executive_summary'] = {
                'article_id': article_id,
                'points': [
                    f"Research conducted on {topic_headline}",
                    "Analysis based on current available sources",
                    "Comprehensive review of relevant information"
                ]
            }
        else:
            logger.info(f"executive_summary found with {len(final_report_data['executive_summary'].get('points', []))} points")
        
        # Final validation check - ensure all required sections exist
        required_sections = ['article', 'executive_summary', 'timeline_items', 'cited_sources', 'raw_facts', 'perspectives']
        missing_sections = [section for section in required_sections if section not in final_report_data]
        
        if missing_sections:
            logger.error(f"CRITICAL: Missing required sections for {topic_headline}: {missing_sections}")
            raise ValueError(f"Missing required sections: {missing_sections}")
        else:
            logger.info(f"All required sections validated for {topic_headline}")
        
        # Validate and cache the report
        validated_report = ResearchReport.model_validate(final_report_data)
        report_cache[topic_slug] = validated_report
        
        logger.info(f"Article generated and cached: {topic_slug}")
        return topic_slug
        
    except Exception as e:
        logger.error(f"Error generating article for {topic.get('headline', 'Unknown')}: {e}")
        return None

# Add this function after the imports and before the existing functions
def validate_and_fix_cached_articles():
    """
    Validate all cached articles and fix any missing sections.
    This ensures feed reports are always complete.
    """
    logger.info("Validating all cached articles for missing sections...")
    
    fixed_count = 0
    total_articles = len(report_cache)
    
    for slug, report in list(report_cache.items()):
        try:
            # Check if report has all required sections
            required_sections = ['article', 'executive_summary', 'timeline_items', 'cited_sources', 'raw_facts', 'perspectives']
            missing_sections = []
            
            for section in required_sections:
                if not hasattr(report, section) or not getattr(report, section):
                    missing_sections.append(section)
            
            if missing_sections:
                logger.warning(f"Article {slug} missing sections: {missing_sections} - attempting to fix")
                
                # Try to fix by regenerating the article
                try:
                    # Extract topic info from the existing article
                    topic = {
                        'headline': report.article.title,
                        'slug': slug,
                        'category': report.article.category,
                        'generated_at': report.article.published_at
                    }
                    
                    # Regenerate the article
                    new_slug = generate_article_with_retry(topic)
                    if new_slug and new_slug in report_cache:
                        logger.info(f"Successfully regenerated article {slug}")
                        fixed_count += 1
                    else:
                        logger.error(f"Failed to regenerate article {slug}")
                        
                except Exception as e:
                    logger.error(f"Error fixing article {slug}: {e}")
            else:
                logger.info(f"Article {slug} has all required sections")
                
        except Exception as e:
            logger.error(f"Error validating article {slug}: {e}")
    
    logger.info(f"Cache validation complete: {fixed_count}/{total_articles} articles fixed")
    return fixed_count

# --- Enhanced Image Extraction Tools with Brave API ---
@tool
def brave_image_search(query: str, count: int = 5) -> List[str]:
    """Search for images using Brave Search API based on the query."""
    try:
        brave_api_key = os.getenv('BRAVE_API_KEY')
        if not brave_api_key:
            logger.warning("BRAVE_API_KEY not found, skipping Brave image search")
            return []
        
        # Encode the query for URL
        encoded_query = quote(query)
        
        # Brave Image Search API endpoint
        url = f"https://api.search.brave.com/res/v1/images/search"
        
        headers = {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': brave_api_key
        }
        
        params = {
            'q': query,
            'count': min(count, 10),  # Limit to 10 max
            'search_lang': 'en',
            'country': 'US',
            'safesearch': 'moderate',
            'freshness': 'pd',  # Past day for fresh content
            'size': 'large'  # Prefer larger images
        }
        
        logger.info(f"Searching Brave for images: {query}")
        response = requests.get(url, headers=headers, params=params, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        images = []
        
        if 'results' in data:
            for result in data['results'][:count]:
                if 'src' in result:
                    # Prefer the original image URL
                    image_url = result.get('src', '')
                    if image_url and image_url.startswith('http'):
                        images.append(image_url)
        
        logger.info(f"Brave returned {len(images)} images for query: {query}")
        return images
        
    except Exception as e:
        logger.warning(f"Brave image search failed for '{query}': {e}")
        return []

@tool
def duckduckgo_image_search(query: str, count: int = 5) -> List[str]:
    """Search for images using DuckDuckGo as a fallback option."""
    try:
        # DuckDuckGo instant answer API for images
        url = "https://duckduckgo.com/"
        
        # First, get the vqd token
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        }
        
        params = {
            'q': query,
            'iax': 'images',
            'ia': 'images'
        }
        
        response = requests.get(url, headers=headers, params=params, timeout=10)
        
        # Extract vqd token from response
        vqd_match = re.search(r'vqd=([\d-]+)', response.text)
        if not vqd_match:
            logger.warning("Could not extract vqd token from DuckDuckGo")
            return []
        
        vqd = vqd_match.group(1)
        
        # Now search for images
        image_url = "https://duckduckgo.com/i.js"
        image_params = {
            'l': 'us-en',
            'o': 'json',
            'q': query,
            'vqd': vqd,
            'f': ',,,,,',
            'p': '1'
        }
        
        image_response = requests.get(image_url, headers=headers, params=image_params, timeout=10)
        image_response.raise_for_status()
        
        data = image_response.json()
        images = []
        
        if 'results' in data:
            for result in data['results'][:count]:
                if 'image' in result:
                    image_url = result['image']
                    if image_url and image_url.startswith('http'):
                        images.append(image_url)
        
        logger.info(f"DuckDuckGo returned {len(images)} images for query: {query}")
        return images
        
    except Exception as e:
        logger.warning(f"DuckDuckGo image search failed for '{query}': {e}")
        return []

@tool
def unsplash_image_search(query: str, count: int = 5) -> List[str]:
    """Search for images using Unsplash API as another fallback."""
    try:
        unsplash_access_key = os.getenv('UNSPLASH_ACCESS_KEY')
        if not unsplash_access_key:
            logger.warning("UNSPLASH_ACCESS_KEY not found, using source.unsplash.com")
            # Fallback to source.unsplash.com for random images
            base_url = f"https://source.unsplash.com/800x600/"
            query_terms = query.replace(' ', ',')
            return [f"{base_url}?{query_terms}&{i}" for i in range(count)]
        
        url = "https://api.unsplash.com/search/photos"
        
        headers = {
            'Authorization': f'Client-ID {unsplash_access_key}',
            'Accept-Version': 'v1'
        }
        
        params = {
            'query': query,
            'per_page': min(count, 10),
            'orientation': 'landscape',
            'order_by': 'relevant'
        }
        
        response = requests.get(url, headers=headers, params=params, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        images = []
        
        if 'results' in data:
            for result in data['results'][:count]:
                if 'urls' in result:
                    # Use regular size image
                    image_url = result['urls'].get('regular', result['urls'].get('small', ''))
                    if image_url:
                        images.append(image_url)
        
        logger.info(f"Unsplash returned {len(images)} images for query: {query}")
        return images
        
    except Exception as e:
        logger.warning(f"Unsplash image search failed for '{query}': {e}")
        # Final fallback to source.unsplash.com
        base_url = f"https://source.unsplash.com/800x600/"
        query_terms = query.replace(' ', ',')
        return [f"{base_url}?{query_terms}&{i}" for i in range(count)]

@tool
def extract_article_images(url: str) -> List[str]:
    """Extract images from article URLs using multiple strategies."""
    images = []
    
    try:
        # Add headers to avoid being blocked
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        }
        
        response = requests.get(url, timeout=10, headers=headers)
        response.raise_for_status()
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Look for common article image selectors
        image_selectors = [
            'meta[property="og:image"]',
            'meta[name="twitter:image"]', 
            '.article-image img',
            '.hero-image img',
            '.featured-image img',
            'article img',
            '.content img',
            '.post-content img'
        ]
        
        for selector in image_selectors:
            if selector.startswith('meta'):
                meta_tag = soup.select_one(selector)
                if meta_tag and meta_tag.get('content'):
                    img_url = meta_tag.get('content')
                    if img_url.startswith('http'):
                        images.append(img_url)
                        break
            else:
                img_tags = soup.select(selector)
                for img in img_tags:
                    src = img.get('src') or img.get('data-src')
                    if src:
                        # Convert relative URLs to absolute
                        if src.startswith('//'):
                            src = 'https:' + src
                        elif src.startswith('/'):
                            src = urljoin(url, src)
                        elif not src.startswith('http'):
                            src = urljoin(url, src)
                        
                        # Filter out small/icon images
                        if not any(x in src.lower() for x in ['icon', 'logo', 'avatar', 'pixel.gif']):
                            images.append(src)
                            if len(images) >= 3:
                                break
                
                if images:
                    break
                    
    except Exception as e:
        logger.warning(f"Failed to extract images from {url}: {e}")
    
    return images[:3]  # Return up to 3 images

@tool
def generate_contextual_image(query: str, sources: List[str] = None) -> str:
    """Generate contextual images with improved fallback hierarchy."""
    
    # Strategy 1: Try Brave image search first
    logger.info(f"Trying Brave image search for: {query}")
    brave_images = brave_image_search(query, count=1)
    if brave_images:
        logger.info(f"Using Brave image for query: {query}")
        return brave_images[0]
    
    # Strategy 2: If we have sources, try to extract images from them
    if sources:
        for source_url in sources[:3]:  # Check first 3 sources
            try:
                extracted_images = extract_article_images(source_url)
                if extracted_images:
                    logger.info(f"Using extracted image from source: {source_url}")
                    return extracted_images[0]
            except Exception as e:
                logger.warning(f"Failed to extract image from {source_url}: {e}")
                continue
    
    # Strategy 3: Try DuckDuckGo image search
    logger.info(f"Trying DuckDuckGo image search for: {query}")
    duckduckgo_images = duckduckgo_image_search(query, count=1)
    if duckduckgo_images:
        logger.info(f"Using DuckDuckGo image for query: {query}")
        return duckduckgo_images[0]
    
    # Strategy 4: Try Unsplash search
    logger.info(f"Trying Unsplash image search for: {query}")
    unsplash_images = unsplash_image_search(query, count=1)
    if unsplash_images:
        logger.info(f"Using Unsplash image for query: {query}")
        return unsplash_images[0]
    
    # Final fallback: Generic news-related Unsplash image
    logger.info(f"Using final fallback image for query: {query}")
    fallback_terms = "news,breaking,journalism,media"
    return f"https://source.unsplash.com/800x600/?{fallback_terms}"

tavily_tool = TavilySearch()
tools = [tavily_tool, scrape_website, extract_article_images, brave_image_search, duckduckgo_image_search, unsplash_image_search, generate_contextual_image]

# 2. Agent State
class AgentState(TypedDict):
    messages: Annotated[list, lambda x, y: x + y]
    query: str
    scraped_data: list
    research_report: Optional[dict]
    image_urls: Optional[dict]

# 3. Agent and Graph Definition with optimized LLM
llm = ChatOpenAI(
    model="gpt-4o-mini",  # Use mini model for better rate limits
    temperature=0,
    max_tokens=1500,      # Limit tokens
    request_timeout=30
)

def create_agent(llm, tools, system_prompt):
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system_prompt),
            MessagesPlaceholder(variable_name="messages"),
        ]
    )
    return prompt | llm.bind_tools(tools)

def agent_node(state, agent, name):
    result = agent.invoke(state)
    return {"messages": [result]}

# --- Research Agent ---
def create_research_prompt(query: str) -> str:
    return RESEARCH_PROMPT_TEMPLATE.replace("[QUERY]", query)

RESEARCH_PROMPT_TEMPLATE = """You are a real-time, non-partisan research assistant with live web browsing capability. You NEVER fabricate data, quotes, articles, or URLs. 

CRITICAL FOCUS REQUIREMENT: You are researching EXACTLY "[QUERY]" - nothing else. You must stay strictly on topic and not deviate from this specific query. If you cannot find relevant information for the exact query, you must state "No relevant information found for [QUERY]" rather than researching related topics.

STRICT CONTENT FILTERING RULES:
- ONLY include information that is DIRECTLY about "[QUERY]"
- DO NOT include background information, context, or related topics unless they are ESSENTIAL to understanding "[QUERY]"
- DO NOT add historical context, broader implications, or tangential subjects
- DO NOT include information about similar topics, related events, or broader trends
- If an article mentions "[QUERY]" briefly but focuses on other topics, DO NOT include it
- If a source discusses broader context that doesn't directly relate to "[QUERY]", exclude it
- Focus on the SPECIFIC query, not the general subject area
- Every fact, quote, and perspective must be DIRECTLY about "[QUERY]"

SEARCH STRATEGY:
1. Use the EXACT query "[QUERY]" for all web searches
2. Only research information directly related to "[QUERY]"
3. If search results are not relevant to "[QUERY]", do not include them
4. If you cannot find information about "[QUERY]", do not substitute with related topics
5. Use the scrape_website tool to get deeper content and real quotes from important sources
6. Focus on getting direct quotes from primary sources and official statements
7. REJECT any content that is not specifically about "[QUERY]"

You only can output two types of responses:
1. Content based on real articles, real public sources accessed live through your browsing ability with cited urls that are DIRECTLY about "[QUERY]"
2. Should there be issues with type 1, you will say "Error accessing web articles" or "No web article found for [QUERY]"

Quote guide: Any content you write within "" must never be paraphrased or rewritten, while content you write outside of "" can be paraphrased. They must be shown exactly as originally published. The only permitted edits to a quote are:
    a. Ellipses: to remove extraneous content and make quote more concise
    b. Square brackets: to clarify a word or replace a pronoun with noun for better readability

You strictly follow this format, and provide no extra info outside of it:

Executive Summary:
Short, simple, easy to read, bullet point summary of "[QUERY]" in plain English. Don't use complete sentences. Only include information directly about "[QUERY]". DO NOT add context, background, or related information.

Raw facts:
1. Determine the raw facts on "[QUERY]" from reliable sources
Ex: Direct quote of what exactly was said about "[QUERY]", literal concrete propositions related to "[QUERY]", statements from those involved with "[QUERY]", etc.
Direct data or statements from government documents, public officials, original press releases, or reputable news sources that are SPECIFICALLY about "[QUERY]". While primary sources are preferred when available, you may also use well-established news outlets and authoritative sources. You may go to intermediary sites in your research, but get your data from their sources when possible.
If you're researching a proposed law or bill related to "[QUERY]", include raw facts directly from the document in question when available. Cite the name of the exact document or speaker they came from, + source
Places you can find US law text & congress hearings:
https://www.congress.gov/
https://www.govinfo.gov/
Official statements from White House:
https://www.whitehouse.gov/news/
2. Return all the raw facts you find about "[QUERY]" in a bullet point list. Organize the list by source.
3. DO NOT include facts about related topics, background information, or broader context.

Timeline:
Bullet point timeline of events related to "[QUERY]" if relevant. ONLY include events that directly involve "[QUERY]", not related or background events.

Different perspectives – summarize how "[QUERY]" is being covered by outlets with different perspectives on the story. Include REAL quotes and the outlet names. How are people and outlets interpreting the raw info about "[QUERY]" from section 2?
a. Research articles with opposing or different takes on "[QUERY]"
-Consider what different views on "[QUERY]" may be, and use search terms that would bring them up
b. Organize them into distinct, differing, and opposing groups based on their perspective on "[QUERY]". Begin each viewpoint group with one clear headline labeling, write it as if it were a snappy headline the outlets in the group could've posted. Avoid using the word viewpoint in titles.
c. Formatting:
Viewpoint Title 1 (No "")
- 1 bullet point summary of view on "[QUERY]"
- Publisher Name
- Short Quote
d. ONLY include perspectives that are DIRECTLY about "[QUERY]", not related topics or broader implications.

Conflicting Info:
a. Determine if there are conflicts between any of the viewpoints you found about "[QUERY]"
b. If none return "No conflicts detected"
c. IF you find conflicts about "[QUERY]":
i. Clearly identify what the conflict or misconception is about "[QUERY]".
ii. After each conflict list the conflicting sources as follows: [Source(s)] vs [Opposing Sources(s)]
- Link
- [Repeat if multiple articles under this viewpoint]
- [Don't waste words on section titles like "Publisher Name:" or "Quote"]
d. ONLY include conflicts that are DIRECTLY about "[QUERY]", not related topics.

FINAL VALIDATION: Before submitting your response, review each section and ensure that every piece of information is DIRECTLY about "[QUERY]". Remove any content that is tangential, related, or provides broader context that doesn't specifically address "[QUERY]".

REMINDER: Stay focused on "[QUERY]" - do not research related topics or broader subjects unless they are directly relevant to "[QUERY]". If you cannot find enough information specifically about "[QUERY]", it is better to have a shorter, focused report than to include irrelevant information."""

tavily_tool = TavilySearch()
research_agent = create_agent(llm, [tavily_tool], create_research_prompt("placeholder"))

def research_node(state: AgentState):
    logger.info("RESEARCHING")
    # Create dynamic research prompt with the actual query
    dynamic_prompt = create_research_prompt(state['query'])
    dynamic_research_agent = create_agent(llm, [tavily_tool, scrape_website], dynamic_prompt)
    
    state['messages'] = [HumanMessage(content=state['query'])]
    result = dynamic_research_agent.invoke(state)
    logger.info("RESEARCH COMPLETE")
    return {"messages": [result]}

# --- Scraper Agent ---
def scraper_node(state: AgentState):
    logger.info("SCRAPING WEB FOR PRIMARY SOURCES")
    urls = []
    scraped_content = []
    if state['messages'][-1].tool_calls:
        tool_calls = state['messages'][-1].tool_calls
        
        query = ""
        for call in tool_calls:
            if call['name'] == 'tavily_search':
                 query = call['args']['query']
                 break
        
        if query:
            logger.info(f"EXECUTING TAVILY SEARCH for: {query}")
            # Use the exact query first, then enhance with primary sources
            # This ensures we stay on topic while still getting authoritative sources
            exact_query = query  # Use the exact query as provided
            enhanced_query = f'"{query}" (site:gov OR site:congress.gov OR site:whitehouse.gov OR site:govinfo.gov OR official statement OR primary source OR reputable news OR authoritative source)'
            
            # Try exact query first, then enhanced if needed
            try:
                tavily_results = tavily_tool.invoke(exact_query)
                logger.info(f"Using exact query: {exact_query}")
            except Exception as e:
                logger.warning(f"Exact query failed, trying enhanced: {e}")
                tavily_results = tavily_tool.invoke(enhanced_query)
                logger.info(f"Using enhanced query: {enhanced_query}")
            logger.info(f"TAVILY RESULTS TYPE: {type(tavily_results)}")
            if isinstance(tavily_results, str):
                logger.info(f"TAVILY RESULTS PREVIEW: {tavily_results[:200]}...")
            
            # Handle different return types from TavilySearch tool
            if isinstance(tavily_results, list):
                results_list = tavily_results
            elif isinstance(tavily_results, dict):
                results_list = tavily_results.get('results', [])
            elif isinstance(tavily_results, str):
                # If it's a string, try to parse it as JSON
                try:
                    parsed_results = json.loads(tavily_results)
                    if isinstance(parsed_results, list):
                        results_list = parsed_results
                    elif isinstance(parsed_results, dict):
                        results_list = parsed_results.get('results', [])
                    else:
                        results_list = []
                except json.JSONDecodeError:
                    logger.warning(f"COULD NOT PARSE TAVILY RESULTS AS JSON: {tavily_results[:100]}...")
                    results_list = []
            else:
                logger.warning(f"UNEXPECTED TAVILY RESULTS TYPE: {type(tavily_results)}")
                results_list = []

            for res in results_list[:15]:  # Increased to 15 for better coverage
                try:
                    if isinstance(res, dict) and 'url' in res and 'content' in res:
                        url = res['url']
                        # First, use Tavily's pre-scraped content as a starting point
                        limited_content = res['content'][:1000]
                        
                        # Then, try to get deeper content using scrape_website tool
                        try:
                            logger.info(f"Scraping deeper content from: {url}")
                            scraped_deeper_content = scrape_website(url)
                            
                            if scraped_deeper_content and not scraped_deeper_content.startswith("Error"):
                                # Combine Tavily content with deeper scraped content
                                combined_content = f"{limited_content}\n\nDEEPER CONTENT:\n{scraped_deeper_content[:2000]}"
                                logger.info(f"Successfully scraped deeper content from {url}")
                                scraped_content.append({"url": url, "content": combined_content})
                            else:
                                # Fallback to Tavily content only
                                logger.warning(f"Scraping failed for {url}, using Tavily content only")
                                scraped_content.append({"url": url, "content": limited_content})
                        except Exception as scrape_error:
                            logger.warning(f"Error scraping {url}: {scrape_error}, using Tavily content only")
                            scraped_content.append({"url": url, "content": limited_content})
                        
                        urls.append(url)
                    else:
                        logger.warning(f"SKIPPING INVALID RESULT FORMAT: {type(res)}")
                except Exception as e:
                    logger.warning(f"ERROR PROCESSING RESULT: {e}")
                    continue
        else:
             logger.warning("NO TAVILY SEARCH TOOL CALL FOUND")

    logger.info(f"SCRAPING {len(urls)} PRIMARY SOURCE URLS")
    logger.info("SCRAPING COMPLETE")
    return {"scraped_data": scraped_content, "messages": []}

# --- Enhanced Image Fetcher Agent ---
IMAGE_FETCHER_PROMPT = """You are an expert at finding contextually relevant images from news articles and search results.
Your goal is to find the most appropriate images that match the research topic and enhance the article presentation.
Focus on finding high-quality, relevant images that support the content being researched."""

image_fetcher_agent = create_agent(llm, [extract_article_images, brave_image_search, duckduckgo_image_search, unsplash_image_search, generate_contextual_image], IMAGE_FETCHER_PROMPT)

def image_fetcher_node(state: AgentState):
    logger.info("FETCHING CONTEXTUAL IMAGES WITH ENHANCED SEARCH")
    
    # Extract query and source URLs
    query = state.get('query', '')
    source_urls = [item.get('url') for item in state.get('scraped_data', []) if item.get('url')]
    
    # Get hero image with improved search strategy
    hero_image_url = generate_contextual_image(query, source_urls)
    
    # Get images for cited sources
    source_images = []
    research_report = state.get('research_report', {})
    
    if 'cited_sources' in research_report:
        for i, source in enumerate(research_report['cited_sources']):
            source_image = None
            
            # Try to get image from specific source URL first
            if i < len(source_urls):
                source_url = source_urls[i]
                source_img_list = extract_article_images(source_url)
                if source_img_list:
                    source_image = source_img_list[0]
            
            # If no image from source, try contextual search
            if not source_image:
                source_name = source.get('name', query)
                contextual_images = brave_image_search(f"{query} {source_name}", count=1)
                if contextual_images:
                    source_image = contextual_images[0]
                else:
                    # Final fallback for sources
                    source_image = f"https://source.unsplash.com/400x300/?news,source&{i}"
            
            source_images.append(source_image)
    
    logger.info(f"CONTEXTUAL IMAGES FETCHED - Hero: {hero_image_url}, Sources: {len(source_images)}")
    return {"image_urls": {"hero_image": hero_image_url, "source_images": source_images}}

# --- Writer Agents ---
# Example data for each report section
example_for_article = {
    "title": "Sample Article Title",
    "slug": "sample-article-title",
    "id": 123456,
    "read_time": 5,
    "source_count": 3,
    "published_at": "2024-01-01T00:00:00Z",
    "category": "Research",
    "author_name": "AI Agent",
    "author_title": "Research Specialist",
    "hero_image_url": "https://example.com/image.jpg"
}
example_for_executive_summary = {
    "article_id": 123456,
    "points": [
        "Key finding 1 about the query",
        "Key finding 2 about the query",
        "Key finding 3 about the query"
    ]
}
example_for_timeline_items = [
    {
        "article_id": 123456,
        "date": "2024-01-01T00:00:00Z",
        "title": "Event Title",
        "description": "Description of the event",
        "type": "event_type",
        "source_label": "Source Name"
    }
]
example_for_cited_sources = [
    {
        "article_id": 123456,
        "name": "Source Name",
        "type": "web_search",
        "description": "Description of the source",
        "url": "https://example.com/source",
        "image_url": "https://example.com/source-image.jpg"
    }
]
example_for_raw_facts = [
    {
        "article_id": 123456,
        "category": "research",
        "facts": [
            "Fact 1 about the query",
            "Fact 2 about the query"
        ]
    }
]
example_for_perspectives = [
    {
        "article_id": 123456,
        "viewpoint": "Perspective Title",
        "description": "Description of the perspective",
        "source": "Source Name",
        "color": "blue"
    }
]
example_for_conflicting_info = [
    {
        "article_id": 123456,
        "conflict": "Description of the conflict",
        "source_a": {
            "name": "Source A",
            "quote": "Conflicting quote from Source A",
            "url": "https://example.com/source-a"
        },
        "source_b": {
            "name": "Source B",
            "quote": "Conflicting quote from Source B",
            "url": "https://example.com/source-b"
        }
    }
]

examples_map = {
    "article": example_for_article,
    "executive_summary": example_for_executive_summary,
    "timeline_items": example_for_timeline_items,
    "cited_sources": example_for_cited_sources,
    "raw_facts": example_for_raw_facts,
    "perspectives": example_for_perspectives,
    "conflicting_info": example_for_conflicting_info
}

def create_writer_agent(section_name: str):
    example = examples_map.get(section_name)
    if not example:
        raise ValueError(f"No example found for section: {section_name}")

    example_str = json.dumps(example, indent=2).replace("{", "{{").replace("}", "}}")

    prompt = f"""You are an expert writing agent focused on real-time, non-partisan research. Your sole purpose is to generate a specific section of a research report based on provided web content.

CRITICAL FOCUS REQUIREMENT: You must stay strictly on topic and only include information that is directly relevant to the research query. Do not include tangential or related information that is not specifically about the query.

STRICT CONTENT FILTERING RULES:
- ONLY include information that is DIRECTLY about the research query
- DO NOT include background information, context, or related topics unless they are ESSENTIAL to understanding the query
- DO NOT add historical context, broader implications, or tangential subjects
- DO NOT include information about similar topics, related events, or broader trends
- If content mentions the query briefly but focuses on other topics, DO NOT include it
- If a source discusses broader context that doesn't directly relate to the query, exclude it
- Focus on the SPECIFIC query, not the general subject area
- Every fact, quote, and perspective must be DIRECTLY about the query

IMPORTANT: You NEVER fabricate data, quotes, articles, or URLs. You only work with real content from the provided sources.

Quote guide: Any content you write within "" must never be paraphrased or rewritten, while content you write outside of "" can be paraphrased. They must be shown exactly as originally published.

CONTENT FILTERING:
- Only include information directly related to the research query
- Exclude tangential topics or broader subjects unless directly relevant
- Focus on the specific query, not related areas
- If content is not directly about the query, do not include it

QUOTE EXTRACTION:
- Extract real, direct quotes from the scraped content
- Use quotation marks for exact quotes from sources
- Include attribution for each quote (who said it, where it was published)
- Focus on quotes that directly relate to the research query
- Prefer quotes from primary sources, official statements, and authoritative sources

FINAL VALIDATION: Before submitting your response, review the content and ensure that every piece of information is DIRECTLY about the research query. Remove any content that is tangential, related, or provides broader context that doesn't specifically address the query.

You MUST generate a valid JSON output that strictly follows the structure and field names of the example below.
Do not add any commentary, explanations, or any text outside of the JSON output.

### EXAMPLE FORMAT ###
```json
{example_str}
```

Now, using the provided web content, generate the '{section_name}' section of the report. Adhere to the example format precisely and ensure all quotes are exact from the sources. Stay focused on the specific research query.
"""
    return create_agent(llm, [], prompt)

def create_conflicting_info_agent():
    example_str = json.dumps(example_for_conflicting_info, indent=2).replace("{", "{{").replace("}", "}}")
    
    prompt = f"""You are a specialized conflict detection agent focused on identifying and analyzing conflicts between different sources in research data.

Your primary goal is to find factual disputes, contradictions, opposing claims, and conflicting interpretations in the provided web content.

STRICT CONTENT FILTERING RULES:
- ONLY include conflicts that are DIRECTLY about the research query
- DO NOT include conflicts about related topics, broader implications, or tangential subjects
- DO NOT include conflicts about similar events or broader trends
- Focus on the SPECIFIC query, not the general subject area
- Every conflict must be DIRECTLY about the research query

IMPORTANT: You NEVER fabricate conflicts or sources. You only identify real conflicts from the provided content.

CONTENT REQUIREMENTS:
- Provide AT LEAST 2 different conflicts on the subject when conflicts exist
- Each conflict should represent a distinct factual dispute or contradiction
- Focus on finding significant conflicts that highlight different viewpoints or interpretations
- Ensure each conflict has a clear, distinct description of what is being disputed
- Avoid redundant or similar conflicts

CRITICAL QUOTE AND SOURCE DEDUPLICATION RULE: 
- You MUST ensure that quotes used in the conflicting_info section are DIFFERENT from quotes used in other sections (raw_facts, perspectives, etc.)
- You MUST also ensure that NO QUOTE is repeated within the conflicting_info section itself
- You MUST ensure that NO SOURCE is reused within the conflicting_info section itself
- Each conflict must use completely unique quotes AND unique sources that have not been used in any other conflict

FINAL VALIDATION: Before submitting your response, review each conflict and ensure that it is DIRECTLY about the research query. Remove any conflicts that are tangential, related, or provide broader context that doesn't specifically address the query.

You MUST generate a valid JSON output that strictly follows the structure and field names of the example below.
Do not add any commentary, explanations, or any text outside of the JSON output.

### EXAMPLE FORMAT ###
```json
{example_str}
```

Now, analyze the provided web content to identify at least 2 different conflicts when they exist. If no conflicts are found, return an empty array [].
"""
    return create_agent(llm, [], prompt)

def create_executive_summary_agent():
    example_str = json.dumps(example_for_executive_summary, indent=2).replace("{", "{{").replace("}", "}}")
    
    prompt = f"""You are a specialized executive summary agent focused on creating concise, bullet-point summaries of research findings.

Your goal is to provide a brief, easy-to-read summary of the most important findings from the research.

STRICT CONTENT FILTERING RULES:
- ONLY include information that is DIRECTLY about the research query
- DO NOT include background information, context, or related topics unless they are ESSENTIAL to understanding the query
- DO NOT add historical context, broader implications, or tangential subjects
- DO NOT include information about similar topics, related events, or broader trends
- Focus on the SPECIFIC query, not the general subject area
- Every bullet point must be DIRECTLY about the research query

IMPORTANT: You NEVER fabricate data, quotes, articles, or URLs. You only work with real content from the provided sources.

CONTENT LIMITATIONS:
- Provide ONLY 4-6 bullet points maximum
- Each bullet point should be concise and focused on the most critical information
- Avoid redundant or overlapping information
- Focus on the most newsworthy or significant findings
- ONLY include findings that are DIRECTLY about the research query

FINAL VALIDATION: Before submitting your response, review each bullet point and ensure that it is DIRECTLY about the research query. Remove any points that are tangential, related, or provide broader context that doesn't specifically address the query.

You MUST generate a valid JSON output that strictly follows the structure and field names of the example below.
Do not add any commentary, explanations, or any text outside of the JSON output.

### EXAMPLE FORMAT ###
```json
{example_str}
```

Now, analyze the provided web content to create a concise executive summary with 4-6 key points.
"""
    return create_agent(llm, [], prompt)

def create_raw_facts_agent():
    example_str = json.dumps(example_for_raw_facts, indent=2).replace("{", "{{").replace("}", "}}")
    
    prompt = f"""You are a specialized raw facts agent focused on extracting direct, verifiable facts from reliable sources.

Your goal is to identify the most important factual statements from the provided sources.

STRICT CONTENT FILTERING RULES:
- ONLY include facts that are DIRECTLY about the research query
- DO NOT include facts about related topics, broader implications, or tangential subjects
- DO NOT include facts about similar events or broader trends
- Focus on the SPECIFIC query, not the general subject area
- Every fact must be DIRECTLY about the research query

IMPORTANT: You NEVER fabricate data, quotes, articles, or URLs. You only work with real content from the provided sources.

CONTENT LIMITATIONS:
- Provide ONLY 6 facts maximum across all sources
- Focus on the most significant, verifiable facts
- Avoid redundant or similar facts from the same source
- Prioritize facts that are directly quoted or clearly stated
- Organize by source, but limit to 6 total facts
- ONLY include facts that are DIRECTLY about the research query

FINAL VALIDATION: Before submitting your response, review each fact and ensure that it is DIRECTLY about the research query. Remove any facts that are tangential, related, or provide broader context that doesn't specifically address the query.

You MUST generate a valid JSON output that strictly follows the structure and field names of the example below.
Do not add any commentary, explanations, or any text outside of the JSON output.

### EXAMPLE FORMAT ###
```json
{example_str}
```

Now, analyze the provided web content to extract the 6 most important raw facts from reliable sources.
"""
    return create_agent(llm, [], prompt)

def create_perspectives_agent():
    example_str = json.dumps(example_for_perspectives, indent=2).replace("{", "{{").replace("}", "}}")
    
    prompt = f"""You are a specialized perspectives agent focused on identifying different viewpoints and interpretations of research findings.

Your goal is to find contrasting perspectives on the topic from different sources and outlets.

STRICT CONTENT FILTERING RULES:
- ONLY include perspectives that are DIRECTLY about the research query
- DO NOT include perspectives about related topics, broader implications, or tangential subjects
- DO NOT include perspectives about similar events or broader trends
- Focus on the SPECIFIC query, not the general subject area
- Every perspective must be DIRECTLY about the research query

IMPORTANT: You NEVER fabricate data, quotes, articles, or URLs. You only work with real content from the provided sources.

CONTENT REQUIREMENTS:
- Provide AT LEAST 2 different perspectives on the subject
- Each perspective should represent a distinct viewpoint or interpretation
- Focus on finding opposing or contrasting viewpoints when possible
- Include real quotes from the sources to support each perspective
- Ensure each perspective has a clear, distinct headline
- Avoid redundant or similar perspectives
- ONLY include perspectives that are DIRECTLY about the research query

FINAL VALIDATION: Before submitting your response, review each perspective and ensure that it is DIRECTLY about the research query. Remove any perspectives that are tangential, related, or provide broader context that doesn't specifically address the query.

You MUST generate a valid JSON output that strictly follows the structure and field names of the example below.
Do not add any commentary, explanations, or any text outside of the JSON output.

### EXAMPLE FORMAT ###
```json
{example_str}
```

Now, analyze the provided web content to identify at least 2 different perspectives on the subject.
"""
    return create_agent(llm, [], prompt)

writer_agents = {
    "article": create_writer_agent("article"),
    "executive_summary": create_executive_summary_agent(),
    "timeline_items": create_writer_agent("timeline_items"),
    "cited_sources": create_writer_agent("cited_sources"),
    "raw_facts": create_raw_facts_agent(),
    "perspectives": create_perspectives_agent(),
    "conflicting_info": create_conflicting_info_agent(),
}

def deduplicate_conflicting_quotes(conflicting_info_data, research_report):
    """
    Ensures quotes in conflicting_info section are different from other sections AND within itself.
    Also prevents source reuse and source swapping.
    This function is called only for the conflicting_info agent.
    """
    if not conflicting_info_data or not isinstance(conflicting_info_data, list):
        return conflicting_info_data
    
    # Collect all quotes from other sections
    existing_quotes = set()
    
    # Check raw_facts section
    if 'raw_facts' in research_report:
        for fact_group in research_report['raw_facts']:
            if 'facts' in fact_group:
                for fact in fact_group['facts']:
                    # Extract quotes (text between quotes)
                    quotes = re.findall(r'"([^"]*)"', fact)
                    existing_quotes.update(quotes)
    
    # Check perspectives section
    if 'perspectives' in research_report:
        for perspective in research_report['perspectives']:
            if 'quote' in perspective:
                existing_quotes.add(perspective['quote'])
            if 'conflict_quote' in perspective:
                existing_quotes.add(perspective['conflict_quote'])
    
    # Check timeline_items section
    if 'timeline_items' in research_report:
        for item in research_report['timeline_items']:
            if 'description' in item:
                quotes = re.findall(r'"([^"]*)"', item['description'])
                existing_quotes.update(quotes)
    
    logger.info(f"FOUND {len(existing_quotes)} EXISTING QUOTES FROM OTHER SECTIONS")
    
    # Filter out conflicts that use duplicate quotes from other sections AND within conflicting_info
    unique_conflicts = []
    conflicting_quotes_used = set()  # Track quotes used within conflicting_info section
    conflicting_sources_used = set()  # Track sources used within conflicting_info section
    
    for conflict in conflicting_info_data:
        source_a_quote = conflict.get('source_a', {}).get('quote', '')
        source_b_quote = conflict.get('source_b', {}).get('quote', '')
        source_a_name = conflict.get('source_a', {}).get('name', '')
        source_b_name = conflict.get('source_b', {}).get('name', '')
        
        # Check if either quote is already used in other sections OR within conflicting_info
        # AND check if either source is already used within conflicting_info
        if (source_a_quote not in existing_quotes and 
            source_b_quote not in existing_quotes and
            source_a_quote not in conflicting_quotes_used and 
            source_b_quote not in conflicting_quotes_used and
            source_a_name not in conflicting_sources_used and
            source_b_name not in conflicting_sources_used):
            
            unique_conflicts.append(conflict)
            # Add these quotes and sources to the tracking sets
            conflicting_quotes_used.add(source_a_quote)
            conflicting_quotes_used.add(source_b_quote)
            conflicting_sources_used.add(source_a_name)
            conflicting_sources_used.add(source_b_name)
        else:
            logger.warning(f"REMOVING CONFLICT WITH DUPLICATES")
            logger.warning(f"Source A: {source_a_name} - {source_a_quote[:50]}...")
            logger.warning(f"Source B: {source_b_name} - {source_b_quote[:50]}...")
    
    logger.info(f"FINAL QUOTES USED IN CONFLICTING_INFO: {len(set(conflicting_quotes_used))}")
    logger.info(f"FINAL SOURCES USED IN CONFLICTING_INFO: {len(set(conflicting_sources_used))}")
    return unique_conflicts

def validate_conflicting_info_quotes(conflicting_info_data):
    """
    Manual validation function to check for duplicate quotes and sources in conflicting_info section.
    """
    if not conflicting_info_data or not isinstance(conflicting_info_data, list):
        logger.error("INVALID CONFLICTING_INFO DATA")
        return False
    
    all_quotes = []
    all_sources = []
    
    # Collect all quotes and sources
    for conflict in conflicting_info_data:
        source_a_quote = conflict.get('source_a', {}).get('quote', '')
        source_b_quote = conflict.get('source_b', {}).get('quote', '')
        source_a_name = conflict.get('source_a', {}).get('name', '')
        source_b_name = conflict.get('source_b', {}).get('name', '')
        
        if source_a_quote:
            all_quotes.append(source_a_quote)
        if source_b_quote:
            all_quotes.append(source_b_quote)
        if source_a_name:
            all_sources.append(source_a_name)
        if source_b_name:
            all_sources.append(source_b_name)
    
    # Check for duplicates
    unique_quotes = set(all_quotes)
    unique_sources = set(all_sources)
    quote_duplicates = len(all_quotes) - len(unique_quotes)
    source_duplicates = len(all_sources) - len(unique_sources)
    
    if quote_duplicates == 0 and source_duplicates == 0:
        logger.info(f"VALIDATION PASSED: No duplicate quotes or sources found in conflicting_info")
        logger.info(f"Total quotes: {len(all_quotes)}, Unique quotes: {len(unique_quotes)}")
        logger.info(f"Total sources: {len(all_sources)}, Unique sources: {len(unique_sources)}")
        return True
    else:
        logger.error(f"VALIDATION FAILED: {quote_duplicates} duplicate quotes and {source_duplicates} duplicate sources found")
        return False

# Optimized writer_node with rate limit handling
def writer_node(state: AgentState, agent_name: str):
    """Writer node with rate limit handling."""
    logger.info(f"Writing section: {agent_name}")
    agent = writer_agents[agent_name]
    
    # Create a message with the scraped data
    content = f"Generate the {agent_name.replace('_', ' ')} based on the following scraped content:\n\n"
    for item in state['scraped_data']:
        # Use more content since we now have deeper scraping
        content += f"URL: {item['url']}\nContent: {item['content'][:2000]}\n\n"  # Increased limit for better quotes
    
    messages = [HumanMessage(content=content)]
    
    # Apply rate limiting to the agent invocation
    @with_rate_limit_retry(max_retries=3, base_delay=2)
    def invoke_agent():
        return agent.invoke({"messages": messages})
    
    try:
        result = invoke_agent()
        
        # Log the raw response from the model
        logger.info(f"Raw response for {agent_name}: {str(result)[:200]}...")

        # Process the result
        if hasattr(result, 'content'):
            data_str = result.content
        else:
            data_str = str(result)
            
        # Clean the string if it's wrapped in markdown
        if data_str.strip().startswith("```"):
            match = re.search(r'```(json)?\s*\n(.*?)\n\s*```', data_str, re.DOTALL)
            if match:
                data_str = match.group(2)
            
        parsed_json = json.loads(data_str)
        
        # Apply quote deduplication specifically for conflicting_info agent
        if agent_name == "conflicting_info":
            logger.info(f"Applying quote deduplication for {agent_name}")
            current_research_report = state.get('research_report', {})
            parsed_json = deduplicate_conflicting_quotes(parsed_json, current_research_report)
            
            # Final validation to ensure no duplicates remain
            validate_conflicting_info_quotes(parsed_json)
        
        logger.info(f"Section {agent_name} complete")
        return {"research_report": {agent_name: parsed_json}}
        
    except Exception as e:
        error_message = f"Error processing {agent_name}: {e}"
        logger.error(error_message)
        return {"messages": [HumanMessage(content=error_message)]}

# --- Aggregator Node ---
def aggregator_node(state: AgentState):
    logger.info("Aggregating all the data")
    logger.info("AGGREGATION COMPLETE")
    return {}

# 4. Graph Construction
workflow = StateGraph(AgentState)
workflow.add_node("researcher", research_node)
workflow.add_node("scraper", scraper_node)
workflow.add_node("image_fetcher", image_fetcher_node)

for name in writer_agents.keys():
    workflow.add_node(name, lambda state, name=name: writer_node(state, name))

workflow.add_node("aggregator", aggregator_node)

workflow.add_edge(START, "researcher")
workflow.add_edge("researcher", "scraper")

# After scraping, run writer agents in parallel
for name in writer_agents.keys():
    workflow.add_edge("scraper", name)

# After all writers are done, go to the aggregator
for name in writer_agents.keys():
    workflow.add_edge(name, "aggregator")

# Run the image fetcher after the cited_sources writer has completed
workflow.add_edge("cited_sources", "image_fetcher")
workflow.add_edge("image_fetcher", "aggregator")

workflow.add_edge("aggregator", END)

graph = workflow.compile()

# 5. FastAPI App
app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",  # Alternative dev port
        "http://localhost:8080",  # Alternative dev port
        "https://web-ai-dze2.vercel.app",  # Your Vercel domain
        "https://web-ai-dze2-m4v627xld-cabrerajulian401s-projects.vercel.app",  # Your specific Vercel domain
        "https://web-ai-dze2-git-main-cabrerajulian401s-projects.vercel.app",  # Another Vercel domain
        "https://*.vercel.app",  # All Vercel domains
        "https://*.onrender.com",  # All Render domains
        "*"  # Allow all origins (for development/testing)
    ],
    allow_credentials=False,  # Changed to False to work with wildcard
    allow_methods=["*"],
    allow_headers=["*"],
)

class ResearchRequest(BaseModel):
    query: str

@app.post("/api/research")
async def research(request: ResearchRequest):
    logger.info(f"RECEIVED RESEARCH REQUEST: {request.query}")
    initial_state = {"query": request.query, "messages": [], "scraped_data": [], "research_report": {}, "image_urls": {}}
    
    final_report_data = {}
    
    # Using a single execution of the graph
    logger.info("EXECUTING WORKFLOW")
    final_state = graph.invoke(initial_state, {"recursion_limit": 100})
    
    # Extract the research report from the final state
    if final_state and 'research_report' in final_state:
        final_report_data = final_state['research_report']
        
    # Merge image URLs into the final report
    if final_state and 'image_urls' in final_state and final_state['image_urls']:
        if 'article' in final_report_data:
            final_report_data['article']['hero_image_url'] = final_state['image_urls']['hero_image']
        if 'cited_sources' in final_report_data and final_state['image_urls']['source_images']:
            for i, source in enumerate(final_report_data['cited_sources']):
                if i < len(final_state['image_urls']['source_images']):
                    source['image_url'] = final_state['image_urls']['source_images'][i]
                else:
                    source['image_url'] = "https://via.placeholder.com/400x300?text=Source+Image"

    logger.info("ASSEMBLING FINAL REPORT")
    article_id = int(uuid.uuid4().int & (1<<31)-1)
    if 'article' in final_report_data:
        # Generate a unique slug for the article
        base_slug = final_report_data['article']['title'].lower().replace(' ', '-').replace('"', '')
        slug = re.sub(r'[^a-z0-9-]', '', base_slug)
        final_report_data['article']['slug'] = slug

        final_report_data['article']['id'] = article_id
        final_report_data['article']['read_time'] = 5
        final_report_data['article']['source_count'] = len(final_state.get('scraped_data', []))
        final_report_data['article']['published_at'] = "2024-01-01T00:00:00Z"
        final_report_data['article']['category'] = "Research"
        final_report_data['article']['author_name'] = "AI Agent"
        final_report_data['article']['author_title'] = "Research Specialist"

    for key in ['executive_summary', 'timeline_items', 'cited_sources', 'raw_facts', 'perspectives', 'conflicting_info']:
        if key in final_report_data:
            if isinstance(final_report_data[key], list):
                for item in final_report_data[key]:
                    item['article_id'] = article_id
            else:
                final_report_data[key]['article_id'] = article_id

    try:
        logger.info("VALIDATING FINAL REPORT")
        validated_report = ResearchReport.model_validate(final_report_data)
        
        # Store the full report in the cache
        report_slug = validated_report.article.slug
        report_cache[report_slug] = validated_report
        
        logger.info(f"REPORT GENERATED AND CACHED. SLUG: {report_slug}")
        
        # Return only the slug to the frontend
        return {"slug": report_slug}
        
    except Exception as e:
        logger.error(f"FAILED TO GENERATE REPORT: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate valid report: {e}\n\n{final_report_data}")

@app.get("/api/article/{slug}", response_model=ResearchReport)
async def get_article(slug: str):
    logger.info(f"FETCHING ARTICLE WITH SLUG: {slug}")
    
    report = report_cache.get(slug)
    if not report:
        logger.error(f"ARTICLE NOT FOUND IN CACHE")
        
        # Check if it's in the generation queue
        with article_generation_lock:
            queued_headlines = [topic.get('headline', '') for topic in article_generation_queue]
            is_queued = any(slug in headline.lower().replace(' ', '-') for headline in queued_headlines)
        
        if is_queued:
            raise HTTPException(
                status_code=202, 
                detail="Article is being generated. Please try again in a few moments."
            )
        else:
            raise HTTPException(status_code=404, detail="Article not found")
    
    logger.info("ARTICLE FOUND, RETURNING TO CLIENT")
    return report

@app.get("/api/feed")
def get_feed():
    """Returns hot topics as a list of articles for the frontend."""
    global last_server_refresh  # Add this line at the top
    
    logger.info("/API/FEED ENDPOINT HIT")
    
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
        logger.info(f"Server refresh triggered at {current_time}")
        
        # Clear the cache to force fresh data
        report_cache.clear()
        logger.info(f"Cache cleared - {len(report_cache)} articles removed")
        
        # Force background research for all new hot topics
        try:
            from feed import hot_topics_manager
            topics_data = hot_topics_manager.get_cached_topics()
            topics = topics_data.get('topics', [])
            if topics:
                logger.info(f"Starting background research for {len(topics)} new hot topics")
                queue_article_generation(topics, force_research=True)
                
                # Validate and fix any existing cached articles with missing sections
                logger.info("Validating existing cached articles for completeness...")
                fixed_count = validate_and_fix_cached_articles()
                if fixed_count > 0:
                    logger.info(f"Fixed {fixed_count} articles with missing sections")
        except Exception as e:
            logger.error(f"Error starting background research: {e}")
    
    try:
        # Try to import hot topics manager
        from feed import hot_topics_manager
        logger.info("SUCCESSFULLY IMPORTED HOT TOPICS MANAGER")
        topics_data = hot_topics_manager.get_cached_topics()
        logger.info(f"GOT TOPICS DATA: {len(topics_data.get('topics', []))} topics")
        topics = topics_data.get('topics', [])
        
        # Queue article generation for topics that don't have cached articles
        queue_article_generation(topics, force_research=False)
        
        articles = []
        cached_count = 0
        
        for topic in topics:
            # Generate slug for the topic
            topic_slug = topic.get('headline', '').lower().replace(' ', '-').replace('"', '')
            topic_slug = re.sub(r'[^a-z0-9-]', '', topic_slug)
            
            # Check if article is cached
            is_cached = topic_slug in report_cache
            if is_cached:
                cached_count += 1
                
                # Validate cached article has all required sections
                cached_report = report_cache[topic_slug]
                required_sections = ['article', 'executive_summary', 'timeline_items', 'cited_sources', 'raw_facts', 'perspectives']
                missing_sections = [section for section in required_sections if not hasattr(cached_report, section) or not getattr(cached_report, section)]
                
                if missing_sections:
                    logger.warning(f"Feed article {topic_slug} missing sections: {missing_sections}")
                    # Queue for regeneration
                    queue_article_generation([topic], force_research=True)
                else:
                    logger.info(f"Feed article {topic_slug} has all required sections")
            
            # Map backend topic fields to frontend FeedArticle fields
            article = {
                "id": topic.get("id", str(uuid.uuid4())),
                "title": topic.get("headline", "Untitled Topic"),
                "slug": topic_slug,
                "excerpt": topic.get("description", "No description available."),
                "category": topic.get("category", "General"),
                "publishedAt": topic.get("generated_at", datetime.now().isoformat()),
                "readTime": 2,
                "sourceCount": 1,
                "heroImageUrl": topic.get("image_url", "https://images.pexels.com/photos/12345/news-image.jpg"),
                "authorName": "AI Agent",
                "authorTitle": "Hot Topics Generator",
                "cached": is_cached  # Add cache status to each article
            }
            articles.append(article)
        
        logger.info(f"RETURNING {len(articles)} ARTICLES ({cached_count} CACHED)")
        logger.info(f"TOTAL CACHED ARTICLES: {len(report_cache)}")
        
        # Return just the articles array (for frontend compatibility)
        return articles
        
    except Exception as e:
        logger.error(f"Error getting hot topics: {e}")
        import traceback
        traceback.print_exc()
        
        # Fallback to sample topics if the hot topics manager fails
        fallback_topic = {
            "id": str(uuid.uuid4()),
            "title": "AI Breakthrough: New Language Model Shows Human-Level Understanding",
            "slug": "ai-breakthrough-new-language-model-shows-human-level-understanding",
            "excerpt": "Researchers have developed a new AI model that demonstrates unprecedented understanding of complex human language patterns.",
            "category": "Technology",
            "publishedAt": datetime.now().isoformat(),
            "readTime": 3,
            "sourceCount": 5,
            "heroImageUrl": "https://images.pexels.com/photos/8386434/pexels-photo-8386434.jpeg",
            "authorName": "AI Agent",
            "authorTitle": "Tech Analyst",
            "cached": False
        }
        
        # Queue the fallback topic for article generation
        queue_article_generation([{
            "headline": fallback_topic["title"],
            "description": fallback_topic["excerpt"],
            "category": fallback_topic["category"],
            "generated_at": fallback_topic["publishedAt"],
            "image_url": fallback_topic["heroImageUrl"],
            "slug": fallback_topic["slug"]
        }], force_research=False)
        
        return [fallback_topic]

# Monitoring and control endpoints
@app.post("/api/warm-cache")
async def warm_cache():
    """Manually trigger article generation for all feed topics."""
    try:
        from feed import hot_topics_manager
        topics_data = hot_topics_manager.get_cached_topics()
        topics = topics_data.get('topics', [])
        
        if not topics:
            return {"message": "No topics found to generate articles for", "count": 0}
        
        # Queue all topics for generation
        queue_article_generation(topics, force_research=False)
        
        return {
            "message": f"Queued {len(topics)} topics for article generation",
            "count": len(topics),
            "topics": [topic.get('headline', 'Unknown') for topic in topics]
        }
        
    except Exception as e:
        logger.error(f"ERROR IN CACHE WARMING: {e}")
        raise HTTPException(status_code=500, detail=f"Error warming cache: {str(e)}")

@app.post("/api/validate-cache")
def validate_cache():
    """Manually validate and fix all cached articles."""
    try:
        logger.info("Manual cache validation triggered")
        fixed_count = validate_and_fix_cached_articles()
        
        return {
            "message": f"Cache validation complete",
            "articles_fixed": fixed_count,
            "total_articles": len(report_cache)
        }
        
    except Exception as e:
        logger.error(f"ERROR IN CACHE VALIDATION: {e}")
        raise HTTPException(status_code=500, detail=f"Error validating cache: {str(e)}")

@app.get("/api/cache-status")
def get_cache_status():
    """Get the current cache status."""
    try:
        from feed import hot_topics_manager
        topics_data = hot_topics_manager.get_cached_topics()
        topics = topics_data.get('topics', [])
        
        cached_count = 0
        topic_status = []
        
        for topic in topics:
            topic_slug = topic.get('headline', '').lower().replace(' ', '-').replace('"', '')
            topic_slug = re.sub(r'[^a-z0-9-]', '', topic_slug)
            
            is_cached = topic_slug in report_cache
            if is_cached:
                cached_count += 1
            
            topic_status.append({
                "headline": topic.get('headline', 'Unknown'),
                "slug": topic_slug,
                "cached": is_cached
            })
        
        with article_generation_lock:
            queue_length = len(article_generation_queue)
            is_generating = is_generating_articles
        
        return {
            "total_topics": len(topics),
            "cached_articles": cached_count,
            "uncached_articles": len(topics) - cached_count,
            "cache_percentage": (cached_count / len(topics) * 100) if topics else 0,
            "queue_length": queue_length,
            "is_generating": is_generating,
            "topic_status": topic_status
        }
        
    except Exception as e:
        logger.error(f"ERROR GETTING CACHE STATUS: {e}")
        return {
            "total_topics": 0,
            "cached_articles": len(report_cache),
            "uncached_articles": 0,
            "cache_percentage": 0,
            "queue_length": 0,
            "is_generating": False,
            "error": str(e)
        }

@app.get("/api/article-generation-status")
def get_article_generation_status():
    """Get the status of article generation."""
    with article_generation_lock:
        return {
            "queue_length": len(article_generation_queue),
            "is_generating": is_generating_articles,
            "cached_articles": len(report_cache),
            "queued_topics": [topic.get('headline', 'Unknown') for topic in article_generation_queue]
        }

@app.post("/api/generate-article-for-topic")
async def generate_article_for_topic_endpoint(request: dict):
    """Manually trigger article generation for a specific topic."""
    try:
        topic_headline = request.get('headline') or request.get('title', '')
        if not topic_headline:
            raise HTTPException(status_code=400, detail="Headline or title is required")
        
        # Create topic data structure
        topic_data = {
            "headline": topic_headline,
            "description": request.get('description', ''),
            "category": request.get('category', 'General'),
            "generated_at": datetime.now().isoformat(),
            "image_url": request.get('image_url', 'https://images.pexels.com/photos/12345/news-image.jpg')
        }
        
        # Generate article immediately (not in background)
        slug = await generate_article_for_topic(topic_data)
        
        if slug:
            return {
                "success": True,
                "slug": slug,
                "message": f"Article generated successfully for: {topic_headline}"
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to generate article")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ERROR IN MANUAL ARTICLE GENERATION: {e}")
        raise HTTPException(status_code=500, detail=f"Error generating article: {str(e)}")

@app.get("/api/rate-limit-status")
async def get_rate_limit_status():
    """Get current rate limiting status."""
    with article_generation_lock:
        return {
            "queue_length": len(article_generation_queue),
            "is_generating": is_generating_articles,
            "cached_articles": len(report_cache),
            "worker_count": executor._max_workers,
            "current_model": "gpt-4o-mini",
            "rate_limit_strategy": "sequential_with_backoff"
        }

@app.post("/api/pause-generation")
async def pause_generation():
    """Pause article generation."""
    global is_generating_articles
    
    with article_generation_lock:
        was_generating = is_generating_articles
        is_generating_articles = False
    
    return {
        "message": "Article generation paused",
        "was_generating": was_generating,
        "queue_length": len(article_generation_queue)
    }

@app.post("/api/resume-generation")
async def resume_generation():
    """Resume article generation."""
    if article_generation_queue and not is_generating_articles:
        executor.submit(process_article_generation_queue)
        return {"message": "Article generation resumed"}
    else:
        return {"message": "No articles to generate or already generating"}

@app.post("/api/reset-rate-limits")
async def reset_rate_limits():
    """Emergency endpoint to pause generation and reset rate limits."""
    global is_generating_articles, article_generation_queue
    
    with article_generation_lock:
        queue_length = len(article_generation_queue)
        is_generating_articles = False
        # Optionally clear the queue: article_generation_queue.clear()
    
    logger.info("Rate limit reset triggered - pausing generation")
    
    return {
        "message": "Generation paused to reset rate limits",
        "queue_length": queue_length,
        "recommendation": "Wait 60 seconds before resuming"
    }

@app.get("/api/health")
async def health_check():
    """Health check with rate limit status."""
    with article_generation_lock:
        return {
            "status": "healthy",
            "cached_articles": len(report_cache),
            "queue_length": len(article_generation_queue),
            "is_generating": is_generating_articles,
            "rate_limit_status": "monitoring"
        }

@app.get("/")
def read_root():
    return {"message": "Welcome to the Research Agent API"}

@app.get("/api/server-time")
async def get_server_time():
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
        logger.info(f"Server refresh triggered at {current_time}")
        
        # Clear the cache to force fresh data
        report_cache.clear()
        logger.info(f"Cache cleared - {len(report_cache)} articles removed")
    
    return {
        "timestamp": current_time.isoformat(),
        "shouldRefresh": should_refresh,
        "nextRefresh": f"{REFRESH_HOUR:02d}:{REFRESH_MINUTE:02d}",
        "currentHour": current_hour,
        "currentMinute": current_minute
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)