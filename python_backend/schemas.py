from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import humps

class CamelCaseModel(BaseModel):
    class Config:
        alias_generator = humps.camelize
        populate_by_name = True

class Article(CamelCaseModel):
    id: int
    title: str
    slug: str
    excerpt: str
    content: str
    category: str
    published_at: str
    read_time: int
    source_count: int
    hero_image_url: str
    author_name: Optional[str] = None
    author_title: Optional[str] = None

class ExecutiveSummary(CamelCaseModel):
    article_id: int
    points: List[str]

class TimelineItem(CamelCaseModel):
    article_id: int
    date: str
    title: str
    description: str
    type: str
    source_label: str
    source_url: Optional[str] = None

class CitedSource(CamelCaseModel):
    name: str
    type: str
    description: str
    url: str
    image_url: Optional[str] = None
    article_id: int

class RawFacts(CamelCaseModel):
    article_id: int
    category: str
    facts: List[str]

class Perspective(CamelCaseModel):
    article_id: int
    viewpoint: str
    description: str
    source: Optional[str] = None
    quote: Optional[str] = None
    color: str
    url: Optional[str] = None
    reasoning: Optional[str] = None
    evidence: Optional[str] = None
    conflict_source: Optional[str] = None
    conflict_quote: Optional[str] = None
    conflict_url: Optional[str] = None

class ResearchReport(CamelCaseModel):
    article: Article
    executive_summary: ExecutiveSummary
    timeline_items: List[TimelineItem]
    cited_sources: List[CitedSource]
    raw_facts: List[RawFacts]
    perspectives: List[Perspective] 