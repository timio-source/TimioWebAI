// Test edge cases for JSON parsing issues
export function testJSONEdgeCases() {
  const testCases = [
    {
      name: 'Smart quotes in JSON',
      input: '{ "title": "Test "Article"", "summary": "Summary" }',
      issue: 'Smart quotes break JSON parsing'
    },
    {
      name: 'Stray commas',
      input: '{ ,"article,":,{ ,"title,":,"Test," } }',
      issue: 'Commas in wrong places causing syntax errors'
    },
    {
      name: 'Missing commas between objects',
      input: '{ "article": { "title": "Test" } "summary": "Summary" }',
      issue: 'Missing comma between properties'
    },
    {
      name: 'Trailing commas',
      input: '{ "article": { "title": "Test", "summary": "Summary", } }',
      issue: 'Trailing comma before closing brace'
    },
    {
      name: 'Control characters',
      input: '{ "article": { "title": "Test\n\r\tArticle", "summary": "Summary" } }',
      issue: 'Unescaped control characters'
    },
    {
      name: 'Unicode characters',
      input: '{ "article": { "title": "Test – Article", "summary": "Summary… end" } }',
      issue: 'Unicode dash and ellipsis characters'
    },
    {
      name: 'Incomplete JSON',
      input: '{ "article": { "title": "Test Article", "summary": "Sum',
      issue: 'Truncated JSON response'
    }
  ];

  console.log('=== JSON EDGE CASE ANALYSIS ===\n');

  testCases.forEach(testCase => {
    console.log(`Test: ${testCase.name}`);
    console.log(`Issue: ${testCase.issue}`);
    console.log(`Input: ${testCase.input}`);
    
    try {
      JSON.parse(testCase.input);
      console.log('✓ Actually valid JSON');
    } catch (error) {
      console.log(`✗ Invalid JSON: ${error.message}`);
    }
    console.log('---\n');
  });
}

// Common JSON repair functions
export function repairBasicJSON(input: string): string {
  return input
    // Fix smart quotes
    .replace(/"/g, '"')
    .replace(/"/g, '"')
    .replace(/'/g, "'")
    .replace(/'/g, "'")
    // Fix unicode characters
    .replace(/…/g, '...')
    .replace(/–/g, '-')
    .replace(/—/g, '-')
    // Fix stray commas
    .replace(/^\s*,/, '')
    .replace(/{\s*,/g, '{')
    .replace(/\[\s*,/g, '[')
    .replace(/,\s*,/g, ',')
    // Fix trailing commas
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']')
    // Fix missing commas
    .replace(/}\s*{/g, '},{')
    .replace(/]\s*\[/g, '],[')
    .replace(/"\s*"([^:])/g, '","$1')
    // Escape control characters
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

if (require.main === module) {
  testJSONEdgeCases();
}