from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class Article(BaseModel):
    id: int
    title: str
    slug: str
    excerpt: str
    content: str
    category: str
    publishedAt: datetime
    readTime: int
    sourceCount: int
    heroImageUrl: str
    authorName: Optional[str] = None
    authorTitle: Optional[str] = None

class ExecutiveSummary(BaseModel):
    id: int
    articleId: int
    points: List[str]

class TimelineItem(BaseModel):
    id: int
    articleId: int
    date: datetime
    title: str
    description: str
    type: str
    sourceLabel: str
    sourceUrl: Optional[str] = None

class CitedSource(BaseModel):
    id: int
    articleId: int
    name: str
    type: str
    description: str
    url: Optional[str] = None
    imageUrl: str

class RawFacts(BaseModel):
    id: int
    articleId: int
    category: str
    facts: List[str]

class Perspective(BaseModel):
    id: int
    articleId: int
    viewpoint: str
    description: str
    source: Optional[str] = None
    quote: Optional[str] = None
    color: str
    url: Optional[str] = None
    reasoning: Optional[str] = None
    evidence: Optional[str] = None
    conflictSource: Optional[str] = None
    conflictQuote: Optional[str] = None
    conflictUrl: Optional[str] = None 