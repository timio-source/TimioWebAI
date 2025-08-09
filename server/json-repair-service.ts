// Comprehensive JSON repair service for handling malformed OpenAI responses

export class JsonRepairService {
  static repairJson(content: string): string {
    console.log('=== JSON REPAIR SERVICE ===');
    console.log('Input length:', content.length);
    console.log('First 100 chars:', content.substring(0, 100));
    
    // Step 1: Clean and normalize the content
    let repaired = this.normalizeContent(content);
    
    // Step 2: Try to parse, if it fails, apply progressive fixes
    const strategies = [
      () => repaired, // Try as-is first
      () => this.fixBasicStructure(repaired),
      () => this.fixPropertyNames(repaired),
      () => this.fixStringValues(repaired),
      () => this.reconstructFromPattern(repaired)
    ];
    
    for (const [index, strategy] of strategies.entries()) {
      try {
        const candidate = strategy();
        console.log(`Trying strategy ${index + 1}:`, candidate.substring(0, 100));
        JSON.parse(candidate);
        console.log(`✓ Strategy ${index + 1} successful`);
        return candidate;
      } catch (error) {
        console.log(`✗ Strategy ${index + 1} failed:`, error.message);
      }
    }
    
    throw new Error('All repair strategies failed');
  }
  
  private static normalizeContent(content: string): string {
    return content
      // Fix smart quotes
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      // Remove BOM and other invisible characters
      .replace(/^\uFEFF/, '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      // Normalize whitespace
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();
  }
  
  private static fixBasicStructure(content: string): string {
    let fixed = content;
    
    // Remove leading/trailing whitespace and commas
    fixed = fixed.replace(/^[\s,]+|[\s,]+$/g, '');
    
    // Fix opening brace issues
    if (fixed.match(/^{\s*\n/)) {
      fixed = fixed.replace(/^{\s*\n/, '{');
    }
    
    // Fix duplicate commas
    fixed = fixed.replace(/,\s*,/g, ',');
    
    // Fix trailing commas
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
    
    // Fix leading commas
    fixed = fixed.replace(/([{\[])\s*,/g, '$1');
    
    return fixed;
  }
  
  private static fixPropertyNames(content: string): string {
    // Ensure all property names are quoted
    return content.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:)/g, '$1"$2"$3');
  }
  
  private static fixStringValues(content: string): string {
    let fixed = content;
    
    // Fix unescaped quotes in string values
    fixed = fixed.replace(/"([^"]*)"([^"]*)"([^"]*)":/g, '"$1\\"$2\\"$3":');
    
    // Fix unescaped newlines in strings
    fixed = fixed.replace(/("(?:[^"\\]|\\.)*?")|(\n)/g, (match, quotedString, newline) => {
      if (quotedString) {
        return quotedString.replace(/\n/g, '\\n');
      }
      return newline ? '' : match;
    });
    
    // Fix other control characters
    fixed = fixed.replace(/("(?:[^"\\]|\\.)*?")|(\t)/g, (match, quotedString, tab) => {
      if (quotedString) {
        return quotedString.replace(/\t/g, '\\t');
      }
      return tab ? '' : match;
    });
    
    return fixed;
  }
  
  private static reconstructFromPattern(content: string): string {
    // Try to extract key-value pairs and reconstruct valid JSON
    const pairs = [];
    
    // Match property: value patterns
    const patterns = [
      /"([^"]+)"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/g, // string values
      /"([^"]+)"\s*:\s*(\d+\.?\d*)/g, // numeric values
      /"([^"]+)"\s*:\s*(true|false|null)/g, // boolean/null values
      /"([^"]+)"\s*:\s*(\[[\s\S]*?\])/g, // array values
      /"([^"]+)"\s*:\s*(\{[\s\S]*?\})/g // object values
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        pairs.push(`"${match[1]}": ${match[2].startsWith('"') ? match[2] : `"${match[2]}"`}`);
      }
    }
    
    if (pairs.length === 0) {
      throw new Error('No valid key-value pairs found');
    }
    
    return `{ ${pairs.join(', ')} }`;
  }
}