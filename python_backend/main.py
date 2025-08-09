
import os
import re
import json
import uuid
import asyncio
import threading
import time
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
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

from schemas import ResearchReport

load_dotenv()

# --- Global Variables ---
# In-Memory Cache - A simple dictionary to store generated reports by slug
report_cache: Dict[str, ResearchReport] = {}

# Server refresh tracking
last_server_refresh = None

# Article Generation Queue
article_generation_queue = []
article_generation_lock = threading.Lock()
is_generating_articles = False
# --- Pexels Tool ---
PEXELS_API_KEY = os.getenv("PEXELS_API_KEY")
if PEXELS_API_KEY:
    pexels_api = Pexels(PEXELS_API_KEY)
else:
    pexels_api = None

@tool
def pexels_tool(query: str) -> List[Dict[str, Any]]:
    """Searches for images on Pexels and returns a list of image URLs."""
    if not pexels_api:
        print("--- PEXELS API KEY NOT FOUND ---")
        return []
    try:
        search_photos = pexels_api.search_photos(query, page=1, per_page=5)
        return [{"url": photo['src']['original']} for photo in search_photos['photos']]
    except Exception as e:
        print(f"--- PEXELS API ERROR: {e} ---")
        return []

# --- Research Prompt Template ---
# This is the main research prompt that enforces real-time, non-partisan research
RESEARCH_PROMPT_TEMPLATE = """You are a real-time, non-partisan research assistant with live web browsing capability. You NEVER fabricate data, quotes, articles, or URLs. Today you are researching "[QUERY]" You only can output two types of responses:
1. Content based on real articles, real public sources accessed live through your browsing ability with cited urls.
2. Should there be issues with type 1, you will say "Error accessing web articles" or "No web article found"

Quote guide: Any content you write within "" must never be paraphrased or rewritten, while content you write outside of "" can be paraphrased. They must be shown exactly as originally published. The only permitted edits to a quote are:
    a. Ellipses: to remove extraneous content and make quote more concise
    b. Square brackets: to clarify a word or replace a pronoun with noun for better readability

You strictly follow this format, and provide no extra info outside of it:

Executive Summary:
Short, simple, easy to read, bullet point summary of event in plain English. Don't use complete sentences.

Raw facts:
1. Determine the raw facts on the topic from reliable sources
Ex: Direct quote of what exactly was said, literal concrete propositions of a bill or policy from the document in question, statements from those involved, etc.
Direct data or statements from government documents, public officials, original press releases, or reputable news sources. While primary sources are preferred when available, you may also use well-established news outlets and authoritative sources. You may go to intermediary sites in your research, but get your data from their sources when possible.
If your researching a proposed law or bill, include raw facts directly from the document in question when available. Cite the name of the exact document or speaker they came from, + source
Places you can find US law text & congress hearings:
https://www.congress.gov/
https://www.govinfo.gov/
Official statements from White House:
https://www.whitehouse.gov/news/
2. Return all the raw facts you find in a bullet point list. Organize the list by source.

Timeline:
Bullet point timeline of events if relevant

Different perspectives – summarize how the story is being covered by outlets with different perspectives on the story. Include REAL quotes and the outlet names. How are people and outlets interpreting the raw info from section 2?
a. Research articles with opposing or different takes to this article
-Consider what different views on this may be, and use search terms that would bring them up
b. Organize them into distinct, differing, and opposing groups based on their perspective. Begin each viewpoint group with one clear headline labeling, write it as if it were a snappy headline the outlets in the group could've posted. Avoid using the word viewpoint in titles.
c. Formatting:
Viewpoint Title 1 (No "")
- 1 bullet point summary of view
- Publisher Name
- Short Quote

Conflicting Info:
a. Determine if there are conflicts between any of the viewpoints you found
b. If none return "No conflicts detected"
c. IF you find conflicts:
i. Clearly identify what the conflict or misconception is.
ii. After each conflict list the conflicting sources as follows: [Source(s)] vs [Opposing Sources(s)]
- Link
- [Repeat if multiple articles under this viewpoint]
- [Don't waste words on section titles like "Publisher Name:" or "Quote"]"""

# --- Examples for Structured Output ---
# These examples show the AI exactly what format to output for each section
example_for_article = {
    "title": "Research Report on [QUERY]",
    "excerpt": "Comprehensive analysis based on real-time web research and primary sources.",
    "content": "This report provides a detailed analysis based on live web research and primary source verification.",
    "hero_image_url": "https://images.pexels.com/photos/12345/research-image.jpg"
}

example_for_executive_summary = {
    "points": [
        "Key finding 1 based on primary sources",
        "Key finding 2 with direct citation",
        "Key finding 3 from official documents"
    ]
}

example_for_timeline_items = [
    {
        "date": "2024-01-01T00:00:00Z",
        "title": "Event Title",
        "description": "Description with direct quote from source",
        "type": "Event Type",
        "source_label": "Official Source Name",
        "source_url": "https://official-source.gov/document"
    }
]

example_for_cited_sources = [
    {
        "name": "Official Government Agency",
        "type": "Primary Source",
        "description": "Direct source of information",
        "url": "https://official-source.gov"
    }
]

example_for_raw_facts = [
    {
        "category": "Primary Source: [Source Name]",
        "facts": [
            "Direct quote from source",
            "Literal statement from official document"
        ]
    }
]

example_for_perspectives = [
    {
        "viewpoint": "Perspective Headline",
        "description": "Summary of this perspective",
        "source": "Publisher Name",
        "quote": "Exact quote from article",
        "color": "blue",
        "url": "https://publisher.com/article",
        "reasoning": "Why this perspective matters",
        "evidence": "Supporting evidence",
        "conflict_source": "Opposing Source",
        "conflict_quote": "Exact conflicting quote",
        "conflict_url": "https://opposing-source.com/article"
    }
]
example_for_conflicting_info = [
    {
        "conflict_id": "conflict_001",
        "conflict_type": "factual_dispute",
        "conflict_description": "Description of the specific conflict or contradiction",
        "source_a": {
            "name": "First Source Name",
            "quote": "Exact quote from first source",
            "url": "https://first-source.com/article",
            "claim": "What this source claims"
        },
        "source_b": {
            "name": "Opposing Source Name", 
            "quote": "Exact conflicting quote from opposing source",
            "url": "https://opposing-source.com/article",
            "claim": "What the opposing source claims"
        },
        "resolution_status": "unresolved",
        "severity": "high"
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




# Define a reducer function for merging dictionaries
def merge_reports(dict1: dict, dict2: dict) -> dict:
    return {**dict1, **dict2}

# 1. Tool Setup
tavily_tool = TavilySearch(max_results=15)

@tool
def scrape_website(url: str) -> str:
    """Scrapes the content of a website."""
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.content, "lxml")
        text = soup.get_text(separator="\n", strip=True)
        return text[:4000]  # Limit content size
    except requests.RequestException as e:
        return f"Error scraping website: {e}"

tools = [tavily_tool, scrape_website]

# 2. Agent State
class AgentState(TypedDict):
    messages: Annotated[list, lambda x, y: x + y]
    query: str
    scraped_data: list
    research_report: Annotated[Optional[dict], merge_reports]
    image_urls: Optional[dict]
    
# 3. Agent and Graph Definition
llm = ChatOpenAI(model="gpt-4o", temperature=0)

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
# Use the comprehensive research prompt template
def create_research_prompt(query: str) -> str:
    return RESEARCH_PROMPT_TEMPLATE.replace("[QUERY]", query)

research_agent = create_agent(llm, [tavily_tool], create_research_prompt("placeholder"))
def research_node(state: AgentState):
    print("--- 🔬 RESEARCHING ---")
    # Create dynamic research prompt with the actual query
    dynamic_prompt = create_research_prompt(state['query'])
    dynamic_research_agent = create_agent(llm, [tavily_tool], dynamic_prompt)
    
    state['messages'] = [HumanMessage(content=state['query'])]
    result = dynamic_research_agent.invoke(state)
    print("--- ✅ RESEARCH COMPLETE ---")
    return {"messages": [result]}

# --- Scraper Agent ---
def scraper_node(state: AgentState):
    print("--- 🔍 SCRAPING WEB FOR PRIMARY SOURCES ---")
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
            print(f"--- EXECUTING TAVILY SEARCH for: {query} ---")
            # Encourage primary sources but don't require them - include both primary and reputable secondary sources
            enhanced_query = f"{query} (site:gov OR site:congress.gov OR site:whitehouse.gov OR site:govinfo.gov OR official statement OR primary source OR reputable news OR authoritative source)"
            tavily_results = tavily_tool.invoke(enhanced_query)
            print(f"--- 🔍 TAVILY RESULTS TYPE: {type(tavily_results)} ---")
            if isinstance(tavily_results, str):
                print(f"--- 🔍 TAVILY RESULTS PREVIEW: {tavily_results[:200]}... ---")
            
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
                    print(f"--- ⚠️ COULD NOT PARSE TAVILY RESULTS AS JSON: {tavily_results[:100]}... ---")
                    results_list = []
            else:
                print(f"--- ⚠️ UNEXPECTED TAVILY RESULTS TYPE: {type(tavily_results)} ---")
                results_list = []

            for res in results_list[:15]:  # Increased to 15 for better coverage
                try:
                    if isinstance(res, dict) and 'url' in res and 'content' in res:
                        scraped_content.append({"url": res['url'], "content": res['content']})
                        urls.append(res['url'])
                    else:
                        print(f"--- ⚠️ SKIPPING INVALID RESULT FORMAT: {type(res)} ---")
                except Exception as e:
                    print(f"--- ⚠️ ERROR PROCESSING RESULT: {e} ---")
                    continue
        else:
             print("--- NO TAVILY SEARCH TOOL CALL FOUND ---")

    print(f"--- SCRAPING {len(urls)} PRIMARY SOURCE URLS ---")
    # The new TavilySearch tool scrapes content automatically, so we don't need to do it manually here.
    # The 'scraped_content' is already populated from the tavily_results.
        
    print("--- ✅ SCRAPING COMPLETE ---")
    return {"scraped_data": scraped_content, "messages": []}

# --- Image Fetcher Agent ---
IMAGE_FETCHER_PROMPT = """You are an expert image researcher. Your goal is to use the Pexels tool to find relevant images.
For the main article, use the original user query to find a hero image.
For the cited sources, use the title of each source to find a relevant image.
You must return a dictionary where the keys are 'hero_image' and 'source_images' (a list of URLs)."""
image_fetcher_agent = create_agent(llm, [pexels_tool], IMAGE_FETCHER_PROMPT)

def image_fetcher_node(state: AgentState):
    print("--- 🖼️ FETCHING IMAGES ---")
    
    # Fetch hero image
    hero_image_query = state['query']
    hero_image_urls = pexels_tool.invoke(hero_image_query)
    hero_image_url = hero_image_urls[0]['url'] if hero_image_urls else "https://images.pexels.com/photos/12345/flood-image.jpg"

    # Fetch source images
    source_images = []
    research_report = state.get('research_report', {})
    if 'cited_sources' in research_report:
        for source in research_report['cited_sources']:
            source_image_urls = pexels_tool.invoke(source['name'])
            source_image_url = source_image_urls[0]['url'] if source_image_urls else "https://p-cdn.com/generic-source-logo.png"
            source_images.append(source_image_url)
            
    print("--- ✅ IMAGES FETCHED ---")
    return {"image_urls": {"hero_image": hero_image_url, "source_images": source_images}}


# --- Writer Agents ---
def create_writer_agent(section_name: str):
    example = examples_map.get(section_name)
    if not example:
        raise ValueError(f"No example found for section: {section_name}")

    # The example string is embedded in a prompt template, so its curly braces
    # need to be escaped to avoid being interpreted as template variables.
    example_str = json.dumps(example, indent=2).replace("{", "{{").replace("}", "}}")

    prompt = f"""You are an expert writing agent focused on real-time, non-partisan research. Your sole purpose is to generate a specific section of a research report based on provided web content.

IMPORTANT: You NEVER fabricate data, quotes, articles, or URLs. You only work with real content from the provided sources.

Quote guide: Any content you write within "" must never be paraphrased or rewritten, while content you write outside of "" can be paraphrased. They must be shown exactly as originally published.

You MUST generate a valid JSON output that strictly follows the structure and field names of the example below.
Do not add any commentary, explanations, or any text outside of the JSON output.

### EXAMPLE FORMAT ###
```json
{example_str}
```

Now, using the provided web content, generate the '{section_name}' section of the report. Adhere to the example format precisely and ensure all quotes are exact from the sources.
"""
    return create_agent(llm, [], prompt)

# Create specialized conflicting info agent
def create_conflicting_info_agent():
    example_str = json.dumps(example_for_conflicting_info, indent=2).replace("{", "{{").replace("}", "}}")
    
    prompt = f"""You are a specialized conflict detection agent focused on identifying and analyzing conflicts between different sources in research data.

Your primary goal is to find factual disputes, contradictions, opposing claims, and conflicting interpretations in the provided web content.

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
- If a quote or source has already been used anywhere else, find alternative quotes from different sources
- Focus on finding unique, distinct quotes and sources that highlight the specific conflicts
- Avoid using the same quote OR the same source in multiple conflict sections
- Each source can only appear once in the entire conflicting_info section

Conflict Types to Look For:
1. Factual Disputes: Different numbers, dates, statistics, or verifiable facts
2. Interpretive Differences: Different conclusions drawn from the same data
3. Methodological Conflicts: Different research approaches or methodologies
4. Bias Patterns: Systematic differences in reporting or presentation
5. Source Credibility: Conflicts between authoritative vs. non-authoritative sources

You MUST generate a valid JSON output that strictly follows the structure and field names of the example below.
Do not add any commentary, explanations, or any text outside of the JSON output.

### EXAMPLE FORMAT ###
```json
{example_str}
```

Now, analyze the provided web content to identify at least 2 different conflicts when they exist. For each conflict found:
- Clearly describe what the conflict is about
- Provide exact quotes from both sides (ensuring they are different from other sections AND from other conflicts in this section)
- Include source URLs for verification
- Categorize the conflict type
- Assess the severity of the conflict
- Ensure quote uniqueness within the conflicting_info section
- NEVER use the same quote in multiple conflicts within this section
- Each quote must be completely unique across all conflicts

If no conflicts are found, return an empty array [].
"""
    return create_agent(llm, [], prompt)

# Create specialized executive summary agent with limited points
def create_executive_summary_agent():
    example_str = json.dumps(example_for_executive_summary, indent=2).replace("{", "{{").replace("}", "}}")
    
    prompt = f"""You are a specialized executive summary agent focused on creating concise, bullet-point summaries of research findings.

Your goal is to provide a brief, easy-to-read summary of the most important findings from the research.

IMPORTANT: You NEVER fabricate data, quotes, articles, or URLs. You only work with real content from the provided sources.

CONTENT LIMITATIONS:
- Provide ONLY 4-6 bullet points maximum
- Each bullet point should be concise and focused on the most critical information
- Avoid redundant or overlapping information
- Focus on the most newsworthy or significant findings

You MUST generate a valid JSON output that strictly follows the structure and field names of the example below.
Do not add any commentary, explanations, or any text outside of the JSON output.

### EXAMPLE FORMAT ###
```json
{example_str}
```

Now, analyze the provided web content to create a concise executive summary with 4-6 key points.
"""
    return create_agent(llm, [], prompt)

# Create specialized raw facts agent with limited facts
def create_raw_facts_agent():
    example_str = json.dumps(example_for_raw_facts, indent=2).replace("{", "{{").replace("}", "}}")
    
    prompt = f"""You are a specialized raw facts agent focused on extracting direct, verifiable facts from reliable sources.

Your goal is to identify the most important factual statements from the provided sources.

IMPORTANT: You NEVER fabricate data, quotes, articles, or URLs. You only work with real content from the provided sources.

CONTENT LIMITATIONS:
- Provide ONLY 6 facts maximum across all sources
- Focus on the most significant, verifiable facts
- Avoid redundant or similar facts from the same source
- Prioritize facts that are directly quoted or clearly stated
- Organize by source, but limit to 6 total facts
- While primary sources are preferred, you may also use reputable news outlets and authoritative sources

You MUST generate a valid JSON output that strictly follows the structure and field names of the example below.
Do not add any commentary, explanations, or any text outside of the JSON output.

### EXAMPLE FORMAT ###
```json
{example_str}
```

Now, analyze the provided web content to extract the 6 most important raw facts from reliable sources.
"""
    return create_agent(llm, [], prompt)

# Create specialized perspectives agent with minimum 2 perspectives
def create_perspectives_agent():
    example_str = json.dumps(example_for_perspectives, indent=2).replace("{", "{{").replace("}", "}}")
    
    prompt = f"""You are a specialized perspectives agent focused on identifying different viewpoints and interpretations of research findings.

Your goal is to find contrasting perspectives on the topic from different sources and outlets.

IMPORTANT: You NEVER fabricate data, quotes, articles, or URLs. You only work with real content from the provided sources.

CONTENT REQUIREMENTS:
- Provide AT LEAST 2 different perspectives on the subject
- Each perspective should represent a distinct viewpoint or interpretation
- Focus on finding opposing or contrasting viewpoints when possible
- Include real quotes from the sources to support each perspective
- Ensure each perspective has a clear, distinct headline
- Avoid redundant or similar perspectives

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
    
    print(f"--- 🔍 FOUND {len(existing_quotes)} EXISTING QUOTES FROM OTHER SECTIONS ---")
    
    # Filter out conflicts that use duplicate quotes from other sections AND within conflicting_info
    unique_conflicts = []
    conflicting_quotes_used = set()  # Track quotes used within conflicting_info section
    conflicting_sources_used = set()  # Track sources used within conflicting_info section
    
    # First pass: collect all quotes and sources from conflicting_info to check for internal duplicates
    all_conflicting_quotes = []
    all_conflicting_sources = []
    for conflict in conflicting_info_data:
        source_a_quote = conflict.get('source_a', {}).get('quote', '')
        source_b_quote = conflict.get('source_b', {}).get('quote', '')
        source_a_name = conflict.get('source_a', {}).get('name', '')
        source_b_name = conflict.get('source_b', {}).get('name', '')
        
        if source_a_quote:
            all_conflicting_quotes.append(source_a_quote)
        if source_b_quote:
            all_conflicting_quotes.append(source_b_quote)
        if source_a_name:
            all_conflicting_sources.append(source_a_name)
        if source_b_name:
            all_conflicting_sources.append(source_b_name)
    
    # Check for internal duplicates before processing
    duplicate_quotes_internal = set()
    duplicate_sources_internal = set()
    seen_quotes = set()
    seen_sources = set()
    
    for quote in all_conflicting_quotes:
        if quote in seen_quotes:
            duplicate_quotes_internal.add(quote)
        seen_quotes.add(quote)
    
    for source in all_conflicting_sources:
        if source in seen_sources:
            duplicate_sources_internal.add(source)
        seen_sources.add(source)
    
    if duplicate_quotes_internal:
        print(f"--- 🚨 FOUND {len(duplicate_quotes_internal)} INTERNAL DUPLICATE QUOTES IN CONFLICTING_INFO ---")
        for quote in duplicate_quotes_internal:
            print(f"   Duplicate Quote: {quote[:100]}...")
    
    if duplicate_sources_internal:
        print(f"--- 🚨 FOUND {len(duplicate_sources_internal)} INTERNAL DUPLICATE SOURCES IN CONFLICTING_INFO ---")
        for source in duplicate_sources_internal:
            print(f"   Duplicate Source: {source}")
    
    # Second pass: process conflicts and remove duplicates
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
            print(f"--- ⚠️ REMOVING CONFLICT WITH DUPLICATES ---")
            print(f"Source A: {source_a_name} - {source_a_quote[:50]}...")
            print(f"Source B: {source_b_name} - {source_b_quote[:50]}...")
            if source_a_quote in existing_quotes or source_b_quote in existing_quotes:
                print(f"   Reason: Quote found in other sections")
            if source_a_quote in conflicting_quotes_used or source_b_quote in conflicting_quotes_used:
                print(f"   Reason: Quote already used in conflicting_info section")
            if source_a_name in conflicting_sources_used or source_b_name in conflicting_sources_used:
                print(f"   Reason: Source already used in conflicting_info section")
    
    # Final verification: double-check for any remaining duplicates
    final_quotes = []
    final_sources = []
    for conflict in unique_conflicts:
        source_a_quote = conflict.get('source_a', {}).get('quote', '')
        source_b_quote = conflict.get('source_b', {}).get('quote', '')
        source_a_name = conflict.get('source_a', {}).get('name', '')
        source_b_name = conflict.get('source_b', {}).get('name', '')
        
        if source_a_quote:
            final_quotes.append(source_a_quote)
        if source_b_quote:
            final_quotes.append(source_b_quote)
        if source_a_name:
            final_sources.append(source_a_name)
        if source_b_name:
            final_sources.append(source_b_name)
    
    final_quote_duplicates = len(final_quotes) - len(set(final_quotes))
    final_source_duplicates = len(final_sources) - len(set(final_sources))
    
    if final_quote_duplicates > 0 or final_source_duplicates > 0:
        print(f"--- 🚨 WARNING: {final_quote_duplicates} DUPLICATE QUOTES AND {final_source_duplicates} DUPLICATE SOURCES STILL FOUND ---")
        # Find and remove the duplicates
        seen_final_quotes = set()
        seen_final_sources = set()
        final_unique_conflicts = []
        
        for conflict in unique_conflicts:
            source_a_quote = conflict.get('source_a', {}).get('quote', '')
            source_b_quote = conflict.get('source_b', {}).get('quote', '')
            source_a_name = conflict.get('source_a', {}).get('name', '')
            source_b_name = conflict.get('source_b', {}).get('name', '')
            
            if (source_a_quote not in seen_final_quotes and 
                source_b_quote not in seen_final_quotes and
                source_a_name not in seen_final_sources and 
                source_b_name not in seen_final_sources):
                
                final_unique_conflicts.append(conflict)
                seen_final_quotes.add(source_a_quote)
                seen_final_quotes.add(source_b_quote)
                seen_final_sources.add(source_a_name)
                seen_final_sources.add(source_b_name)
            else:
                print(f"--- 🚨 FINAL REMOVAL: Conflict with duplicate quotes/sources removed ---")
        
        unique_conflicts = final_unique_conflicts
        print(f"--- ✅ FINAL DEDUPLICATION: {len(unique_conflicts)} CONFLICTS RETAINED ---")
    else:
        print(f"--- ✅ NO DUPLICATES FOUND IN FINAL VERIFICATION ---")
    
    print(f"--- 📊 FINAL QUOTES USED IN CONFLICTING_INFO: {len(set(final_quotes))} ---")
    print(f"--- 📊 FINAL SOURCES USED IN CONFLICTING_INFO: {len(set(final_sources))} ---")
    return unique_conflicts

def validate_conflicting_info_quotes(conflicting_info_data):
    """
    Manual validation function to check for duplicate quotes and sources in conflicting_info section.
    Call this function to verify no duplicates exist.
    """
    if not conflicting_info_data or not isinstance(conflicting_info_data, list):
        print("--- ❌ INVALID CONFLICTING_INFO DATA ---")
        return False
    
    all_quotes = []
    all_sources = []
    quote_sources = {}  # Track which conflict each quote comes from
    source_conflicts = {}  # Track which conflict each source comes from
    
    # Collect all quotes and sources
    for i, conflict in enumerate(conflicting_info_data):
        source_a_quote = conflict.get('source_a', {}).get('quote', '')
        source_b_quote = conflict.get('source_b', {}).get('quote', '')
        source_a_name = conflict.get('source_a', {}).get('name', '')
        source_b_name = conflict.get('source_b', {}).get('name', '')
        
        if source_a_quote:
            all_quotes.append(source_a_quote)
            if source_a_quote in quote_sources:
                quote_sources[source_a_quote].append(f"Conflict {i+1} - Source A")
            else:
                quote_sources[source_a_quote] = [f"Conflict {i+1} - Source A"]
        
        if source_b_quote:
            all_quotes.append(source_b_quote)
            if source_b_quote in quote_sources:
                quote_sources[source_b_quote].append(f"Conflict {i+1} - Source B")
            else:
                quote_sources[source_b_quote] = [f"Conflict {i+1} - Source B"]
        
        if source_a_name:
            all_sources.append(source_a_name)
            if source_a_name in source_conflicts:
                source_conflicts[source_a_name].append(f"Conflict {i+1} - Source A")
            else:
                source_conflicts[source_a_name] = [f"Conflict {i+1} - Source A"]
        
        if source_b_name:
            all_sources.append(source_b_name)
            if source_b_name in source_conflicts:
                source_conflicts[source_b_name].append(f"Conflict {i+1} - Source B")
            else:
                source_conflicts[source_b_name] = [f"Conflict {i+1} - Source B"]
    
    # Check for duplicates
    unique_quotes = set(all_quotes)
    unique_sources = set(all_sources)
    quote_duplicates = len(all_quotes) - len(unique_quotes)
    source_duplicates = len(all_sources) - len(unique_sources)
    
    if quote_duplicates == 0 and source_duplicates == 0:
        print(f"--- ✅ VALIDATION PASSED: No duplicate quotes or sources found in conflicting_info ---")
        print(f"--- 📊 Total quotes: {len(all_quotes)}, Unique quotes: {len(unique_quotes)} ---")
        print(f"--- 📊 Total sources: {len(all_sources)}, Unique sources: {len(unique_sources)} ---")
        return True
    else:
        print(f"--- ❌ VALIDATION FAILED: {quote_duplicates} duplicate quotes and {source_duplicates} duplicate sources found ---")
        
        # Find and report the quote duplicates
        if quote_duplicates > 0:
            seen_quotes = set()
            for quote in all_quotes:
                if quote in seen_quotes:
                    print(f"--- 🚨 DUPLICATE QUOTE FOUND ---")
                    print(f"   Quote: {quote[:100]}...")
                    print(f"   Used in: {quote_sources[quote]}")
                seen_quotes.add(quote)
        
        # Find and report the source duplicates
        if source_duplicates > 0:
            seen_sources = set()
            for source in all_sources:
                if source in seen_sources:
                    print(f"--- 🚨 DUPLICATE SOURCE FOUND ---")
                    print(f"   Source: {source}")
                    print(f"   Used in: {source_conflicts[source]}")
                seen_sources.add(source)
        
        return False

def writer_node(state: AgentState, agent_name: str):
    print(f"--- ✍️ WRITING SECTION: {agent_name} ---")
    agent = writer_agents[agent_name]
    
    # Create a message with the scraped data
    content = f"Generate the {agent_name.replace('_', ' ')} based on the following scraped content:\n\n"
    for item in state['scraped_data']:
        content += f"URL: {item['url']}\nContent: {item['content']}\n\n"
    
    messages = [HumanMessage(content=content)]
    
    result = agent.invoke({"messages": messages})
    
    # Log the raw response from the model
    print(f"--- RAW RESPONSE FOR {agent_name} ---")
    print(getattr(result, 'content', str(result)))
    print(f"--- END RAW RESPONSE FOR {agent_name} ---")

    try:
        # The result from the LLM might be a string that needs parsing.
        # It may also be inside the 'content' attribute of an AIMessage
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
            print(f"--- 🔍 APPLYING QUOTE DEDUPLICATION FOR {agent_name} ---")
            current_research_report = state.get('research_report', {})
            parsed_json = deduplicate_conflicting_quotes(parsed_json, current_research_report)
            
            # Final validation to ensure no duplicates remain
            print(f"--- 🔍 FINAL VALIDATION FOR {agent_name} ---")
            validate_conflicting_info_quotes(parsed_json)
        
        print(f"--- ✅ SECTION {agent_name} COMPLETE ---")
        return {"research_report": {agent_name: parsed_json}}
    except (json.JSONDecodeError, AttributeError) as e:
        # Handle parsing errors or if the content is not what we expect
        error_message = f"Error processing {agent_name}: {e}"
        print(f"--- ❌ ERROR IN SECTION {agent_name}: {error_message} ---")
        # Return a message to be handled or logged
        return {"messages": [HumanMessage(content=error_message)]}


# --- Aggregator Node ---
def aggregator_node(state: AgentState):
    print("---  aggregating ALL THE DATA ---")
    # This node is a bit of a trick. The writer nodes will update the `research_report` in the state.
    # In a real scenario, we might need a more robust way to merge partial results.
    # For this example, we assume each writer node adds its own key to the research_report dictionary.
    # We will just pass the state through, and the final state will have the complete report.
    # A final validation step could be added here.
    print("--- ✅ AGGREGATION COMPLETE ---")
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

# After scraping, run writer agents and image fetcher in parallel
for name in writer_agents.keys():
    workflow.add_edge("scraper", name)
# workflow.add_edge("scraper", "image_fetcher") # Run image fetcher later


# After all writers and the image fetcher are done, go to the aggregator
for name in writer_agents.keys():
    workflow.add_edge(name, "aggregator")
# workflow.add_edge("image_fetcher", "aggregator")

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
    print(f"--- 🚀 RECEIVED RESEARCH REQUEST: {request.query} ---")
    initial_state = {"query": request.query, "messages": [], "scraped_data": [], "research_report": {}, "image_urls": {}}
    
    final_report_data = {}
    
    # Using a single execution of the graph
    print("--- 🔄 EXECUTING WORKFLOW ---")
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
                    source['image_url'] = "https://p-cdn.com/generic-source-logo.png"


    print("--- 📝 ASSEMBLING FINAL REPORT ---")
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
        print("--- VALIDATING FINAL REPORT ---")
        validated_report = ResearchReport.model_validate(final_report_data)
        
        # Store the full report in the cache
        report_slug = validated_report.article.slug
        report_cache[report_slug] = validated_report
        
        print(f"--- ✅ REPORT GENERATED AND CACHED. SLUG: {report_slug} ---")
        
        # Return only the slug to the frontend
        return {"slug": report_slug}
        
    except Exception as e:
        print(f"--- ❌ FAILED TO GENERATE REPORT: {e} ---")
        raise HTTPException(status_code=500, detail=f"Failed to generate valid report: {e}\n\n{final_report_data}")

# Update the existing /api/article/{slug} endpoint to show better messages
@app.get("/api/article/{slug}", response_model=ResearchReport)
async def get_article(slug: str):
    print(f"--- 🔎 FETCHING ARTICLE WITH SLUG: {slug} ---")
    
    report = report_cache.get(slug)
    if not report:
        print(f"--- ❌ ARTICLE NOT FOUND IN CACHE ---")
        
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
    
    print("--- ✅ ARTICLE FOUND, RETURNING TO CLIENT ---")
    return report
# Update your existing /api/feed endpoint
@app.get("/api/feed")
def get_feed():
    """Returns hot topics as a list of articles for the frontend."""
    print("--- 📢 /API/FEED ENDPOINT HIT ---")
    
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
        print(f"🔄 Server refresh triggered at {current_time}")
        
        # Clear the cache to force fresh data
        report_cache.clear()
        print(f"🧹 Cache cleared - {len(report_cache)} articles removed")
    
    try:
        # Try to import hot topics manager
        from feed import hot_topics_manager
        print("--- SUCCESSFULLY IMPORTED HOT TOPICS MANAGER ---")
        topics_data = hot_topics_manager.get_cached_topics()
        print(f"--- GOT TOPICS DATA: {len(topics_data.get('topics', []))} topics ---")
        topics = topics_data.get('topics', [])
        
        # Queue article generation for topics that don't have cached articles
        queue_article_generation(topics)
        
        articles = []
        for topic in topics:
            # Generate slug for the topic
            topic_slug = topic.get('headline', '').lower().replace(' ', '-').replace('"', '')
            topic_slug = re.sub(r'[^a-z0-9-]', '', topic_slug)
            
            # Map backend topic fields to frontend FeedArticle fields
            article = {
                "id": topic.get("id", str(uuid.uuid4())),
                "title": topic.get("headline", "Untitled Topic"),
                "slug": topic_slug,  # Use the generated slug
                "excerpt": topic.get("description", "No description available."),
                "category": topic.get("category", "General"),
                "publishedAt": topic.get("generated_at", datetime.now().isoformat()),
                "readTime": 2,
                "sourceCount": 1,
                "heroImageUrl": topic.get("image_url", "https://images.pexels.com/photos/12345/news-image.jpg"),
                "authorName": "AI Agent",
                "authorTitle": "Hot Topics Generator"
            }
            articles.append(article)
        
        print(f"--- RETURNING {len(articles)} ARTICLES ---")
        print(f"--- CACHED ARTICLES COUNT: {len(report_cache)} ---")
        return articles
        
    except Exception as e:
        print(f"Error getting hot topics: {e}")
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
            "authorTitle": "Tech Analyst"
        }
        
        # Queue the fallback topic for article generation
        queue_article_generation([{
            "headline": fallback_topic["title"],
            "description": fallback_topic["excerpt"],
            "category": fallback_topic["category"],
            "generated_at": fallback_topic["publishedAt"],
            "image_url": fallback_topic["heroImageUrl"],
            "slug": fallback_topic["slug"]
        }])
        
        return [fallback_topic]

# Add endpoint to check article generation status
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

# Add endpoint to manually trigger article generation for a specific topic
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
        print(f"--- ❌ ERROR IN MANUAL ARTICLE GENERATION: {e} ---")
        raise HTTPException(status_code=500, detail=f"Error generating article: {str(e)}")



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
        print(f"🔄 Server refresh triggered at {current_time}")
        
        # Clear the cache to force fresh data
        report_cache.clear()
        print(f"🧹 Cache cleared - {len(report_cache)} articles removed")
    
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