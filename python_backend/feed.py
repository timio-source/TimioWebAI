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
from pexelsapi.pexels import Pexels

load_dotenv()



# Typed Dict is a python hint statement



# Writing out hte state definition
# Define a reducer function for merging dictionaries
def merge_reports(dict1: dict, dict2: dict) -> dict:
    return {**dict1, **dict2}

class HotTopicState(TypedDict): 
    messages: Annotated[list, lambda x, y: x + y] # Stores conversation history between workflow nodes & has x + y merge message function
    trending_events: List[Dict[str, Any]] # stores raw trending news from various sources, list of dictionary where each dictionary returns one news event
    hot_topics: Annotated[Optional[dict], merge_reports] # Stores the final generated hot topics, has a merge reports function that stores multiple topics
    image_urls: Optional[dict] # Has optional parameters and stores image URLs for each hot topics
    generated_at: str # TimeStamp of when hot topics were generated


''' Example of State: 
    state = {
    "messages": [],
    "trending_events": [],
    "hot_topics": None,
    "image_urls": None,
    "generated_at": "2024-01-15T10:30:00Z"



    This serves as a log to keep track of the state of multiple components
}'''


# Now we must define the tools - the functions that your AI agents can call to perform specific tasks

# Fetches current trending news from TavilySearch
@tool
def get_trending_news() -> List[Dict[str, Any]]:
    """Fetches trending news from TavilySearch."""
    tavily = TavilySearch(max_results=12)
    # Use a generic trending news query
    query = "trending news today"
    try:
        results = tavily.invoke(query)
        # Tavily may return a list or dict with 'results' key
        if isinstance(results, dict):
            articles = results.get('results', [])
        elif isinstance(results, list):
            articles = results
        else:
            articles = []
        news = []
        for article in articles:
            news.append({
                "title": article.get("title", "Untitled"),
                "url": article.get("url", ""),
                "source": article.get("source", ""),
                "published_at": article.get("published_at", datetime.now().isoformat()),
                "summary": article.get("content", article.get("description", "")),
            })
        return news
    except Exception as e:
        print(f"Error fetching trending news from Tavily: {e}")
        return []




def is_newsworthy(event: Dict[str, Any]) -> bool:
    """Determines if an event is newsworthy based on criteria."""
    # Check if it's recent (within last 24 hours)
    # Check if it has broad impact
    # Check if it's from reliable sources
    # For now, return True for all events - in production, implement real filtering
    return True

@tool
def filter_relevant_events(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Filters events for relevance and newsworthiness."""
    relevant_events = []
   
    for event in events:
        # Filter criteria:
        # - Is it recent (last 24 hours)?
        # - Does it have broad impact?
        # - Is it from reliable sources?
        # - Is it not duplicate content?
        
        if is_newsworthy(event):
            relevant_events.append(event)
    
    return relevant_events[:8]  # Return top 8 most relevant for hot topics                  



@tool
def categorize_event(event: Dict[str, Any]) -> str:
    """Categorizes an event into Politics, Technology, etc."""
    title = event.get("title", "").lower()
    summary = event.get("summary", "").lower()
    
    # Enhanced keyword-based categorization
    if any(word in title for word in ["trump", "biden", "congress", "election", "policy", "senate", "house", "democrat", "republican", "president", "government"]):
        return "Politics"
    elif any(word in title for word in ["ai", "technology", "software", "digital", "tech", "artificial intelligence", "machine learning", "algorithm", "app", "startup", "innovation"]):
        return "Technology"
    elif any(word in title for word in ["economy", "market", "business", "trade", "economic", "stock", "finance", "investment", "wall street", "nasdaq", "dow", "s&p"]):
        return "Business"
    elif any(word in title for word in ["health", "medical", "covid", "vaccine", "diagnosis", "hospital", "doctor", "patient", "treatment", "disease", "medicine", "pharmaceutical"]):
        return "Health"
    elif any(word in title for word in ["climate", "environment", "carbon", "emissions", "global warming", "renewable", "solar", "wind", "pollution", "sustainability"]):
        return "Environment"
    elif any(word in title for word in ["sport", "football", "basketball", "baseball", "soccer", "olympics", "championship", "tournament", "player", "team", "nfl", "nba", "mlb"]):
        return "Sports"
    elif any(word in title for word in ["movie", "film", "actor", "actress", "hollywood", "entertainment", "music", "singer", "album", "concert", "award", "oscar", "grammy"]):
        return "Entertainment"
    elif any(word in title for word in ["war", "military", "defense", "weapon", "conflict", "peace", "diplomacy", "international", "foreign", "russia", "china", "ukraine"]):
        return "International"
    elif any(word in title for word in ["education", "school", "university", "student", "teacher", "college", "degree", "academic", "research", "study"]):
        return "Education"
    else:
        return "General"
    


# Next we would have to make our System Prompt


# Hot Topic Generator Agent
HOT_TOPIC_PROMPT = """You are a hot topic generator. Your job is to:
1. Take trending events and create compelling headlines
2. Write 2-sentence descriptions that capture the essence
3. Ensure topics are newsworthy and current
4. Make headlines engaging but factual
5. Generate 6-8 diverse topics across different categories
6. Focus on stories with broad impact and public interest

You MUST generate a valid JSON output that strictly follows the structure below.
Do not add any commentary, explanations, or any text outside of the JSON output.

### EXAMPLE FORMAT ###
```json
[
  {{
    "headline": "Compelling headline",
    "description": "Two sentence description that explains the event and its significance.",
    "category": "Politics/Technology/Business/Health/Environment/Sports/Entertainment/International/Education/General",
    "source_url": "URL of the original news source"
  }},
  {{
    "headline": "Another compelling headline",
    "description": "Two sentence description for this topic.",
    "category": "Technology",
    "source_url": "https://example.com/article"
  }}
]
```

Now, using the provided trending events, generate exactly 6-8 diverse hot topics. Adhere to the example format precisely and ensure all categories are varied.
"""

# Event Filter Agent
EVENT_FILTER_PROMPT = """You are an event filter. Your job is to:
1. Identify which events are truly newsworthy
2. Filter out duplicate or similar stories
3. Prioritize events with broad impact
4. Ensure diversity in topics and sources
"""

# Category Classifier Agent
CATEGORY_PROMPT = """You are a category classifier. Classify each event into:
- Politics
- Technology  
- Business
- Health
- Environment
- International
- Sports
- Entertainment
"""


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
    print("--- 📰 FETCHING TRENDING NEWS ---")
    events = get_trending_news.invoke({})
    return {"trending_events": events, "messages": []}

def event_filter_node(state: HotTopicState):
    """Filters and prioritizes events."""
    print("--- 🔍 FILTERING EVENTS ---")
    filtered_events = filter_relevant_events.invoke({"events": state['trending_events']})
    return {"trending_events": filtered_events, "messages": []}

def hot_topic_generator_node(state: HotTopicState):
    """Generates hot topic headlines and descriptions."""
    print("--- ✍️ GENERATING HOT TOPICS ---")
    
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
    print(f"Events text preview: {events_text[:200]}...")
    
    message = HumanMessage(content=f"Generate 6-8 diverse hot topics from these events, ensuring variety across different categories:\n\n{events_text}")
    print(f"--- SENDING MESSAGE TO AGENT ---")
    print(f"Message: {message.content[:200]}...")
    result = agent.invoke({"messages": [message]})
    print(f"--- AGENT RESPONSE TYPE: {type(result)} ---")
    
    # Parse the result to extract hot topics
    try:
        # The result from the LLM might be a string that needs parsing.
        # It may also be inside the 'content' attribute of an AIMessage
        if hasattr(result, 'content'):
            data_str = result.content
        else:
            data_str = str(result)
            
        # Log the raw response from the model
        print(f"--- RAW RESPONSE FOR HOT TOPICS ---")
        print(data_str)
        print(f"--- END RAW RESPONSE FOR HOT TOPICS ---")
            
        # Clean the string if it's wrapped in markdown
        if data_str.strip().startswith("```"):
            match = re.search(r'```(json)?\s*\n(.*?)\n\s*```', data_str, re.DOTALL)
            if match:
                data_str = match.group(2)
        
        # Clean up the JSON string
        data_str = data_str.strip()
        if not data_str.startswith('['):
            # If it's not an array, try to wrap it
            if data_str.startswith('{'):
                data_str = '[' + data_str + ']'
        
        hot_topics = json.loads(data_str)
        
        # Ensure it's in the right format
        if isinstance(hot_topics, list):
            topics_data = {"topics": hot_topics}
        else:
            topics_data = hot_topics
            
        print(f"--- ✅ HOT TOPICS PARSED SUCCESSFULLY ---")
        return {"hot_topics": topics_data, "messages": [result]}
    except (json.JSONDecodeError, AttributeError) as e:
        # Handle parsing errors or if the content is not what we expect
        error_message = f"Error parsing hot topics: {e}"
        print(f"--- ❌ ERROR PARSING HOT TOPICS: {error_message} ---")
        print(f"Content was: {data_str[:200]}...")
        # Return a fallback structure
        fallback_topics = {
            "topics": [
                {
                    "headline": "Breaking News: Major Developments",
                    "description": "Significant events are unfolding across multiple sectors.",
                    "category": "General",
                    "source_url": "https://example.com"
                }
            ]
        }
        return {"hot_topics": fallback_topics, "messages": [result]}

def image_fetcher_node(state: HotTopicState):
    """Fetches images for hot topics."""
    print("--- 🖼️ FETCHING IMAGES ---")
    
    # Initialize Pexels API
    PEXELS_API_KEY = os.getenv("PEXELS_API_KEY")
    if PEXELS_API_KEY:
        pexels_api = Pexels(PEXELS_API_KEY)
    else:
        pexels_api = None
    
    image_urls = {}
    
    if state.get('hot_topics') and 'topics' in state['hot_topics']:
        for i, topic in enumerate(state['hot_topics']['topics']):
            if pexels_api:
                try:
                    search_photos = pexels_api.search_photos(topic['headline'], page=1, per_page=1)
                    if search_photos['photos']:
                        image_urls[f"topic_{i}"] = search_photos['photos'][0]['src']['original']
                    else:
                        image_urls[f"topic_{i}"] = "https://images.pexels.com/photos/12345/news-image.jpg"
                except Exception as e:
                    print(f"Error fetching image for topic {i}: {e}")
                    image_urls[f"topic_{i}"] = "https://images.pexels.com/photos/12345/news-image.jpg"
            else:
                image_urls[f"topic_{i}"] = "https://images.pexels.com/photos/12345/news-image.jpg"
    
    return {"image_urls": image_urls, "messages": []}

def aggregator_node(state: HotTopicState):
    """Combines all data into final hot topics."""
    print("--- 📊 AGGREGATING HOT TOPICS ---")
    
    # Combine hot topics with images
    final_topics = []
    if state.get('hot_topics') and 'topics' in state['hot_topics']:
        for i, topic in enumerate(state['hot_topics']['topics']):
            topic_with_image = {
                **topic,
                "id": str(uuid.uuid4()),
                "image_url": state.get('image_urls', {}).get(f"topic_{i}", "https://images.pexels.com/photos/12345/news-image.jpg"),
                "generated_at": state.get('generated_at', datetime.now().isoformat())
            }
            final_topics.append(topic_with_image)
    
    return {"hot_topics": {"topics": final_topics}, "messages": []}

# Graph Construction
def create_hot_topics_workflow():
    """Creates and returns the hot topics workflow graph."""
    # Initialize LLM
    llm = ChatOpenAI(model="gpt-4o", temperature=0.7)
    
    # Build graph
    workflow = StateGraph(HotTopicState)
    
    # Add nodes
    workflow.add_node("trending_news", trending_news_node)
    workflow.add_node("event_filter", event_filter_node)
    workflow.add_node("hot_topic_generator", hot_topic_generator_node)
    workflow.add_node("image_fetcher", image_fetcher_node)
    workflow.add_node("aggregator", aggregator_node)
    
    # Add edges
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
        self.workflow = create_hot_topics_workflow()
        self.cache = {}
        self.last_generated = None
    
    def generate_daily_topics(self):
        """Runs the workflow to generate 4 new hot topics."""
        print("--- 🚀 GENERATING DAILY HOT TOPICS ---")
        
        initial_state = {
            "messages": [],
            "trending_events": [],
            "hot_topics": {},
            "image_urls": {},
            "generated_at": datetime.now().isoformat()
        }
        
        final_state = self.workflow.invoke(initial_state)
        
        # Cache the results
        self.cache = final_state.get('hot_topics', {})
        self.last_generated = datetime.now()
        
        print(f"--- ✅ GENERATED {len(self.cache.get('topics', []))} HOT TOPICS ---")
        return self.cache
    
    def get_cached_topics(self):
        """Returns cached hot topics or generates new ones."""
        # Check if we need to generate new topics (every 24 hours)
        if (self.last_generated is None or 
            datetime.now() - self.last_generated > timedelta(hours=24) or
            not self.cache):
            return self.generate_daily_topics()
        
        return self.cache

# Initialize the manager
hot_topics_manager = HotTopicsManager()

# FastAPI endpoints
app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",  # Alternative dev port
        "http://localhost:8080",  # Alternative dev port
        "https://web-ai-dze2.vercel.app",  # Your Vercel domain
        "https://web-ai-dze2-m4v627xld-cabrerajulian401s-projects.vercel.app",
        "https://timio-web-ai-klcl.vercel.app/",  # Your specific Vercel domain
        "https://web-ai-dze2-git-main-cabrerajulian401s-projects.vercel.app",  # Another Vercel domain
        "https://*.vercel.app",  # All Vercel domains
        "https://*.onrender.com",  # All Render domains
        "*"  # Allow all origins (for development/testing)
    ],
    allow_credentials=False,  # Changed to False to work with wildcard
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/feed")
def get_feed():
    """Returns hot topics as a list of articles for the frontend."""
    print("--- 📢 /API/FEED ENDPOINT HIT ---")
    topics_data = hot_topics_manager.get_cached_topics()
    topics = topics_data.get('topics', [])
    articles = []
    for topic in topics:
        # Map backend topic fields to frontend FeedArticle fields
        article = {
            "id": topic.get("id", str(uuid.uuid4())),
            "title": topic.get("headline", "Untitled Topic"),
            "slug": topic.get("headline", "untitled-topic").lower().replace(" ", "-").replace("/", "-"),
            "excerpt": topic.get("description", "No description available."),
            "category": topic.get("category", "General"),
            "publishedAt": topic.get("generated_at", datetime.now().isoformat()),
            "readTime": 2,  # Default/fake value
            "sourceCount": 1,  # Default/fake value
            "heroImageUrl": topic.get("image_url", "https://images.pexels.com/photos/12345/news-image.jpg"),
            "authorName": "AI Agent",
            "authorTitle": "Hot Topics Generator"
        }
        articles.append(article)
    return articles

@app.post("/api/hot-topic/{topic_id}/research")
def trigger_research(topic_id: str):
    """Triggers research generation for a specific hot topic."""
    # Find the topic
    topics = hot_topics_manager.get_cached_topics()
    topic = None
    
    if topics and 'topics' in topics:
        for t in topics['topics']:
            if t.get('id') == topic_id:
                topic = t
                break
    
    if not topic:
        raise HTTPException(status_code=404, detail="Hot topic not found")
    
    # Trigger research using the topic headline
    # This would integrate with your existing research workflow
    research_query = topic['headline']
    
    # For now, return the topic info - in production, trigger actual research
    return {
        "topic": topic,
        "research_query": research_query,
        "message": "Research triggered for this hot topic"
    }

@app.get("/")
def read_root():
    return {"message": "Hot Topics API is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)