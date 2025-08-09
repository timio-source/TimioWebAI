// Comprehensive text formatting utilities for research reports

export interface FormattedText {
  text: string;
  isMarkdown?: boolean;
  hasLinks?: boolean;
  hasBullets?: boolean;
}

export class TextFormatter {
  // Clean and format text from AI responses
  static cleanText(text: string): string {
    if (!text) return '';
    
    return text
      // Fix smart quotes and special characters
      .replace(/"/g, '"')
      .replace(/"/g, '"')
      .replace(/'/g, "'")
      .replace(/'/g, "'")
      .replace(/…/g, '...')
      .replace(/–/g, '-')
      .replace(/—/g, '-')
      // Remove control characters
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
      // Fix multiple spaces
      .replace(/\s+/g, ' ')
      // Trim whitespace
      .trim();
  }

  // Format executive summary points
  static formatExecutiveSummary(summary: string): string[] {
    if (!summary) return [];
    
    const cleaned = this.cleanText(summary);
    
    // Split by bullet points or new lines
    const points = cleaned
      .split(/\n|•|-/)
      .map(point => point.trim())
      .filter(point => point.length > 0)
      .map(point => point.replace(/^[•\-\s]+/, ''));
    
    return points;
  }

  // Format raw facts with proper structure
  static formatRawFacts(facts: any[]): any[] {
    if (!facts || !Array.isArray(facts)) return [];
    
    return facts.map(factGroup => ({
      ...factGroup,
      facts: factGroup.facts.map((fact: any) => {
        if (typeof fact === 'string') {
          return {
            text: this.cleanText(fact),
            source: null,
            url: null
          };
        }
        return {
          text: this.cleanText(fact.text || fact.fact || ''),
          source: fact.source || null,
          url: fact.url || null
        };
      })
    }));
  }

  // Format perspectives with proper quote handling
  static formatPerspectives(perspectives: any[]): any[] {
    if (!perspectives || !Array.isArray(perspectives)) return [];
    
    return perspectives.map(perspective => ({
      ...perspective,
      viewpoint: this.cleanText(perspective.viewpoint || ''),
      description: this.cleanText(perspective.description || ''),
      quote: perspective.quote ? this.cleanText(perspective.quote) : null,
      source: this.cleanText(perspective.source || '')
    }));
  }

  // Format timeline items
  static formatTimelineItems(items: any[]): any[] {
    if (!items || !Array.isArray(items)) return [];
    
    return items.map(item => ({
      ...item,
      title: this.cleanText(item.title || ''),
      description: this.cleanText(item.description || ''),
      source: this.cleanText(item.source || item.sourceLabel || '')
    }));
  }

  // Format cited sources
  static formatCitedSources(sources: any[]): any[] {
    if (!sources || !Array.isArray(sources)) return [];
    
    return sources.map(source => ({
      ...source,
      name: this.cleanText(source.name || ''),
      description: this.cleanText(source.description || ''),
      type: this.cleanText(source.type || '')
    }));
  }

  // Extract and format URLs from text
  static extractUrls(text: string): string[] {
    const urlRegex = /https?:\/\/[^\s<>[\]{}|\\^`]+/g;
    const matches = text.match(urlRegex);
    return matches || [];
  }

  // Validate URL format
  static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  // Format text with proper line breaks and spacing
  static formatDisplayText(text: string): string {
    if (!text) return '';
    
    return this.cleanText(text)
      // Convert markdown-style formatting
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // Handle line breaks
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      // Wrap in paragraph tags if needed
      .replace(/^(?!<p>)/, '<p>')
      .replace(/(?!<\/p>)$/, '</p>');
  }

  // Truncate text with ellipsis
  static truncateText(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) return text;
    
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastSpace > 0) {
      return truncated.substring(0, lastSpace) + '...';
    }
    
    return truncated + '...';
  }

  // Format source attribution
  static formatSourceAttribution(source: string, url?: string): string {
    const cleanSource = this.cleanText(source);
    
    if (url && this.isValidUrl(url)) {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 underline">${cleanSource}</a>`;
    }
    
    return cleanSource;
  }

  // Clean and validate JSON data
  static cleanJsonData(data: any): any {
    if (!data) return data;
    
    if (typeof data === 'string') {
      return this.cleanText(data);
    }
    
    if (Array.isArray(data)) {
      return data.map(item => this.cleanJsonData(item));
    }
    
    if (typeof data === 'object') {
      const cleaned: any = {};
      for (const [key, value] of Object.entries(data)) {
        cleaned[key] = this.cleanJsonData(value);
      }
      return cleaned;
    }
    
    return data;
  }

  // Format error messages for display
  static formatErrorMessage(error: string): string {
    return this.cleanText(error) || 'An unexpected error occurred. Please try again.';
  }

  // Format loading states
  static formatLoadingText(context: string): string {
    const contexts = {
      'research': 'Generating comprehensive research report...',
      'perspectives': 'Analyzing different viewpoints...',
      'facts': 'Gathering factual information...',
      'timeline': 'Building timeline of events...',
      'sources': 'Collecting cited sources...',
      'default': 'Loading content...'
    };
    
    return contexts[context as keyof typeof contexts] || contexts.default;
  }
}

// React component helpers
export const formatTextForDisplay = (text: string): string => {
  return TextFormatter.formatDisplayText(text);
};

export const cleanTextContent = (text: string): string => {
  return TextFormatter.cleanText(text);
};

export const formatBulletPoints = (text: string): string[] => {
  return TextFormatter.formatExecutiveSummary(text);
};