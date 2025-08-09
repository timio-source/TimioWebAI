import OpenAI from 'openai';

export class JSONFormatterService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async formatToValidJSON(rawContent: string): Promise<string> {
    try {
      console.log('=== JSON FORMATTER SERVICE ===');
      console.log('Input content length:', rawContent.length);
      console.log('First 200 chars:', rawContent.substring(0, 200));

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a JSON formatting specialist. Your ONLY job is to fix malformed JSON and return valid JSON.

RULES:
1. Fix syntax errors (missing commas, quotes, brackets)
2. Replace smart quotes with regular quotes
3. Remove control characters and invalid escape sequences
4. Ensure proper JSON structure
5. Return ONLY valid JSON - no explanations or extra text
6. Preserve all original content and data
7. Do not modify or summarize the actual content, only fix the JSON structure

Common fixes needed:
- Replace " " with " "
- Replace ' ' with ' '
- Fix missing commas between objects/arrays
- Remove trailing commas
- Fix broken string escaping
- Ensure proper object/array nesting`
          },
          {
            role: 'user',
            content: `Fix this malformed JSON and return only valid JSON:\n\n${rawContent}`
          }
        ],
        max_tokens: 16000,
        temperature: 0.1,
      });

      const formattedContent = response.choices[0]?.message?.content?.trim();
      
      if (!formattedContent) {
        throw new Error('No formatted content received from JSON formatter');
      }

      console.log('Formatted content length:', formattedContent.length);
      console.log('First 200 chars after formatting:', formattedContent.substring(0, 200));

      // Test if the formatted content is valid JSON
      try {
        JSON.parse(formattedContent);
        console.log('✓ JSON formatting successful');
        return formattedContent;
      } catch (parseError) {
        console.error('✗ JSON formatting failed, still invalid:', parseError);
        throw new Error(`Formatted JSON is still invalid: ${parseError.message}`);
      }

    } catch (error) {
      console.error('JSON Formatter Service error:', error);
      throw error;
    }
  }
}

export const jsonFormatterService = new JSONFormatterService();