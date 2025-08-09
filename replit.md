# AI Article Display Application

## Overview

This is a full-stack web application built with Express.js and React that displays AI-related articles with rich metadata including executive summaries, timelines, related articles, raw facts, and multiple perspectives. The application follows a modern architecture with a clear separation between frontend and backend concerns.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite with custom configuration for development and production
- **Styling**: Tailwind CSS with shadcn/ui component library
- **State Management**: TanStack Query (React Query) for server state management
- **Routing**: Wouter for lightweight client-side routing
- **UI Components**: Radix UI primitives with custom shadcn/ui styling

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ESM modules
- **Database**: PostgreSQL with Drizzle ORM
- **Database Provider**: Neon Database (serverless PostgreSQL)
- **Session Management**: PostgreSQL-based session storage
- **Development**: Hot reload with Vite integration

### Project Structure
```
├── client/          # Frontend React application
├── server/          # Backend Express application
├── shared/          # Shared TypeScript schemas and types
├── migrations/      # Database migrations
└── dist/           # Production build output
```

## Key Components

### Database Schema
The application uses a relational database with the following main entities:
- **Articles**: Core article content with metadata
- **Executive Summary**: Key points for each article
- **Timeline Items**: Chronological events related to the article
- **Related Articles**: Links to relevant external content
- **Raw Facts**: Categorized factual information
- **Perspectives**: Different viewpoints on the topic

### API Structure
- **GET /api/article/:slug**: Retrieves complete article data including all related entities
- RESTful design with proper error handling and logging

### UI Components
- **Expandable Sections**: For organizing content like raw facts and perspectives
- **Timeline**: Visual representation of chronological events
- **Related Articles**: Grid layout of related content
- **Responsive Design**: Mobile-first approach with Tailwind CSS

## Data Flow

1. **Request Flow**: Client requests article by slug → Express server → Database query via Drizzle ORM
2. **Response Flow**: Database → Server aggregates all related data → JSON response to client
3. **State Management**: TanStack Query handles caching, loading states, and error handling
4. **Rendering**: React components render the structured data with shadcn/ui components

## External Dependencies

### Database
- **Neon Database**: Serverless PostgreSQL for production
- **Drizzle ORM**: Type-safe database operations with PostgreSQL dialect
- **Connection**: Environment-based DATABASE_URL configuration

### UI Libraries
- **Radix UI**: Accessible component primitives
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide React**: Icon library for UI elements

### Development Tools
- **Vite**: Fast build tool with HMR
- **ESBuild**: Production bundling for server code
- **TypeScript**: Type safety across the entire stack

## Deployment Strategy

### Development
- **Server**: `npm run dev` - Uses tsx for TypeScript execution with hot reload
- **Client**: Vite dev server with HMR integrated into Express
- **Database**: `npm run db:push` - Pushes schema changes to database

### Production
- **Build**: `npm run build` - Vite builds client, ESBuild bundles server
- **Start**: `npm start` - Runs production server from dist directory
- **Static Files**: Express serves built React app from dist/public

### Environment Configuration
- **DATABASE_URL**: Required for database connection
- **NODE_ENV**: Controls development vs production behavior
- **Session Storage**: PostgreSQL-based session management

## Changelog

Changelog:
- July 04, 2025. Initial setup
- July 04, 2025. Added main feed page with article grid layout, TIMIO News branding, and navigation between feed and article pages
- July 04, 2025. Added sidebar with "As seen on PBS and Automateed" promotional image, changed all category tags to "News", updated main heading to "Today's Stories"
- July 04, 2025. Fixed sidebar image loading issue by properly copying image to public directory and updating paths
- July 04, 2025. Added "Learn More" button in sidebar linking to timio.news, implemented dummy placeholder data for timeline and related articles sections
- July 04, 2025. Enhanced UI with custom icons: hourglass for Executive Summary, crossed spears for Conflicting Info, curved arrows for Different Perspectives, all displayed over black circles
- July 04, 2025. Added prominent black dividers under Timeline and Related Articles headings, strengthened dividers in expandable sections
- July 04, 2025. Increased all section icon sizes and applied consistent black circle backgrounds across all expandable sections
- July 04, 2025. Built comprehensive theme system with CSS custom properties, ThemeManager class, and theme controller component for easy color scheme testing. Added theme settings button to headers on both feed and article pages
- July 05, 2025. Enhanced theme system with preset options (Default Light, Dark, Blue, Navy), added "Research Report:" labels to feed articles with dedicated color control, made sidebar transparent by default, and improved color organization in theme controller
- July 05, 2025. Separated header background from card background colors in theme system, implemented navy theme header with #162043 color, removed black borders from research cards, converted header borders to clean dividers using absolute positioning
- July 05, 2025. Switched from Google News RSS to newsdata.io API for recent trending US political news, implemented breaking news keywords (trending politics, latest Congress, Biden news today, Trump latest, etc.), added 24-hour timeframe filter for recent events, updated sample data with current political developments like Speaker challenges, legal cases, campaign updates, and congressional investigations
- July 05, 2025. Enhanced US political events filtering system with improved keyword matching for US political content, implemented hybrid approach combining API results with sample data when API returns limited diversity, added duplicate detection based on article titles, and created robust fallback system ensuring minimum 7 diverse US political articles are always available
- July 05, 2025. Successfully migrated from newsdata.io to NewsAPI.ai Event Registry for superior political events data. Implemented broader search strategy fetching 50 global political events then filtering for US-related content using keywords like 'trump', 'biden', 'congress', 'washington'. System now returns 21 diverse political articles including Trump administration updates, trade relations, congressional activities, and international political developments affecting the US
- July 05, 2025. Updated research report view to match feed page design with consistent headline overlays on images. Removed header metadata, Executive Summary section, and whitespace from article view for cleaner, more focused visual presentation. Article page now shows edge-to-edge hero image with overlay containing category badge, "Research Report:" label, and headline only
- July 05, 2025. Enhanced search bar prominence with gradient background, enhanced shadows, blue color scheme, hover animations, and Research button. Combined header and first card in article view. Updated search bar text to "Generate a report on any event" and removed AI branding subtext for cleaner presentation
- July 05, 2025. Completed dummy research report functionality with comprehensive "One Big Beautiful Bill" content including Executive Summary, Timeline, Raw Facts (organized by Legislative/Financial Impact/Voting Record categories), Different Perspectives (4 viewpoints with color-coded displays), and Conflicting Info sections. Implemented search functionality that navigates to dummy report regardless of search query, with Enter key support for enhanced user experience
- July 05, 2025. Updated research report design by removing header section, placing "TIMIO News" logo above "RESEARCH REPORT" in hero overlay, removing all action buttons for clean minimal presentation, and replaced placeholder image with authentic Getty Images photo of the bill signing ceremony
- July 06, 2025. Enhanced mobile responsiveness of feed page header with responsive sizing for logo, text, and layout. Fixed header heights and spacing for mobile devices (80px mobile, 120px tablet, 128px desktop)
- July 06, 2025. Redesigned Different Perspectives section with accordion-style collapsible sections featuring color-coded headers, block quotes with left borders, circular avatars, and authentic political analysis content from different stakeholders (Republican, Democratic, Business, Independent)
- July 06, 2025. Redesigned Raw Facts section with minimalist, authoritative layout removing colorful bullet points in favor of clean typography, bold statements, proper source attribution, and clear hierarchical organization with border dividers
- July 07, 2025. Updated Different Perspectives section with authentic content from provided text, featuring three distinct viewpoints: "A Golden Age for America" (pro-Trump), "A Gift to the Wealthy" (Democratic opposition), and "Skeptical Public" (polling data). Implemented colored header sections similar to attached design reference with red, blue, and gray color schemes for each perspective
- July 07, 2025. Enhanced OpenAI research system with comprehensive non-partisan methodology, primary source focus, and authentic perspective analysis. Added dummy article toggle in theme settings to switch between original "Big Beautiful Bill" content and real AI research results. Fixed executive summary display error and data structure compatibility between dummy and AI-generated articles
- July 07, 2025. Completed OpenAI integration by fixing frontend article display to properly show AI-generated content instead of hardcoded dummy data. Updated Raw Facts section with dynamic category grouping, enhanced Different Perspectives with color-coded headers, and transformed Conflicting Info section to use OpenAI perspectives data. All sections now properly display authentic OpenAI-generated research content with proper error handling and fallback support
- July 07, 2025. Enhanced OpenAI web search system to use GPT-4o-mini for related articles search to ensure authentic news articles are retrieved instead of generating fake content. Updated system prompts to explicitly require real-time web search capabilities and legitimate news sources with actual working URLs. Fixed article storage persistence issues and improved debugging for article retrieval
- July 07, 2025. Completed major architectural change from Related Articles to Cited Sources system. Replaced RelatedArticle schema with CitedSource focusing on source attribution rather than separate articles. Updated all components, storage, and dummy data to use cited sources structure. Created new CitedSources component with clickable source links, hover effects, and proper external link handling. Sources now aggregate all references from throughout the research report with unique Pexels images based on source names
- July 07, 2025. Enhanced OpenAI prompts to generate authentic URLs alongside all content. Updated system to request real, working URLs for every fact, quote, perspective, timeline item, and cited source. Modified data structures to include URL fields throughout (Raw Facts, Perspectives, Timeline, Cited Sources). Added clickable source links across all sections with proper external link handling. OpenAI now uses web search capability to provide genuine article URLs instead of placeholder links. Updated to use GPT-4o-2024-08-06 model for enhanced search capabilities and more authentic research generation
- July 07, 2025. Successfully integrated OpenAI "gpt-4o-search-preview" model with web search capabilities for authentic research generation. Fixed JSON parsing issues and improved error handling for API responses. System now generates comprehensive research reports with real-time data from sources like AP News, BBC, Wikipedia, and Reuters. Enhanced Pexels service error handling and increased token limits for complete response generation. OpenAI search model successfully retrieves current news with authentic URL citations throughout all report sections
- July 08, 2025. Fixed dummy data display issue where hardcoded "Big Beautiful Bill" content was shown regardless of dummy mode setting. Updated article display logic to only show dummy data when dummy mode is explicitly enabled in settings. Added proper fallback messages when real data is unavailable and dummy mode is disabled, ensuring users never see dummy content unintentionally
- July 08, 2025. Fixed Pexels API image relevance by improving search term mappings for better image matching. Enhanced cited sources aggregation to collect ALL sources from raw facts, perspectives, conflicting info, and timeline sections. Implemented URL extraction for timeline items to make source buttons clickable. Added comprehensive debug logging for source extraction process
- July 08, 2025. Completed comprehensive solution for cited sources aggregation. Enhanced Pexels API with 50+ news organization mappings (Reuters, AP News, CNN, BBC, etc.) for authentic imagery. Added pattern detection for unknown news sources using regex matching. Implemented detailed debug logging to track source extraction from all report sections. System now properly aggregates all sources referenced throughout research reports into the cited sources section
- July 08, 2025. Significantly improved Pexels API image selection system with multi-strategy search approach, relevance scoring, and intelligent filtering. Added backup search queries, generic fallback terms, and image ranking based on news relevance. System now tries multiple search strategies (primary, backup, generic) to find the most appropriate professional imagery for news sources. Enhanced filtering penalizes irrelevant content while boosting professional, news-related imagery for better visual representation
- July 08, 2025. Enhanced mobile responsiveness of theme controller and search bars across all pages. Theme controller now uses responsive width (full-width on mobile, 600px on desktop) with mobile-optimized padding and button sizes. Search bars improved with smaller icons, better spacing, touch-friendly buttons, and shortened text labels on mobile ("Go" instead of "Research"). Added touch-manipulation CSS class for better mobile interaction and minimum button heights for accessibility
- July 09, 2025. Fixed critical JSON parsing issue in OpenAI service that was causing Different Perspectives section (Pivot agent) to fail. Enhanced JSON cleaning process to handle smart quotes and special characters. System now successfully generates comprehensive research reports with authentic perspectives, quotes, and URLs from real sources like Time magazine and Reuters. All sections including Different Perspectives, Raw Facts, Timeline, and Cited Sources now display properly with real data
- July 09, 2025. Implemented comprehensive text formatting utilities (TextFormatter class) to handle smart quotes, special characters, and improve readability across all article sections. Added robust error boundary components for better error handling and user experience. Enhanced OpenAI service JSON response cleaning with improved character handling and structure repair. Updated all UI components (Timeline, CitedSources, Article sections) to use formatted text display with proper line spacing and URL validation
- July 09, 2025. Created comprehensive edge case testing system and two-stage JSON parsing approach. Implemented JSONFormatterService using GPT-4o-mini as dedicated JSON repair model to handle malformed responses. Added multiple repair strategies including aggressive JSON repair, fragment reconstruction, and enhanced error handling. Created test cases for common JSON parsing issues including smart quotes, malformed structures, and truncated responses. System now attempts JSON formatter service first, then falls back to manual cleaning methods
- July 09, 2025. Optimized research report generation performance by switching from gpt-4o-search-preview to gpt-4o-mini model for faster response times. Implemented fast JSON repair as first-stage processing with fallback to dedicated JSON formatter service. Added performance timing tracking and reduced token limits from 4000 to 2500. Simplified system prompts to focus on concise, efficient content generation while maintaining quality and authenticity
- July 09, 2025. Fixed critical JSON parsing issue with newline characters by implementing comprehensive newline handling system. Created direct JSON repair function that properly handles newlines outside of string values and escapes them within strings. Added character-by-character parsing to distinguish between structural and string content. System now successfully handles the specific "{\n" malformation pattern that was causing parsing failures
- July 09, 2025. Updated dummy article raw facts section to use source-based category headers as requested. Changed from generic categories (Legislative, Financial Impact, Voting Record) to specific source attribution (From the Bill Text H.R.1 119th Congress, Congressional Budget Office CBO). Content now includes detailed provisions from the actual bill text and official CBO analysis with specific impact projections
- July 09, 2025. Enhanced conflicting info section with new schema fields (conflictSource, conflictQuote) and visual VS format. Updated dummy content with three key conflicts: tax benefits (White House/Treasury vs CBO/Pew/KFF), Medicaid impact (White House vs CBO/KFF), and deficit effects (White House vs CBO/Al Jazeera/PBS). Added clear position labeling with blue/red color coding and summary of opposing sides

## User Preferences

Preferred communication style: Simple, everyday language.