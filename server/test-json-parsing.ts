import { jsonFormatterService } from './json-formatter-service';

// Test cases for common JSON parsing issues
const testCases = [
  {
    name: 'Smart quotes issue',
    input: `{ "article": { "title": "Test Article", "summary": "This is a "quoted" text with smart quotes" } }`,
    expectedFix: 'Replace smart quotes with regular quotes'
  },
  {
    name: 'Missing comma between objects',
    input: `{ "article": { "title": "Test" } "summary": { "text": "Summary" } }`,
    expectedFix: 'Add comma between objects'
  },
  {
    name: 'Trailing comma issue',
    input: `{ "article": { "title": "Test", "summary": "Summary", } }`,
    expectedFix: 'Remove trailing comma'
  },
  {
    name: 'Control characters',
    input: `{ "article": { "title": "Test\n\r\tArticle", "summary": "Summary" } }`,
    expectedFix: 'Escape control characters properly'
  },
  {
    name: 'Malformed property names',
    input: `{ ,"article,":,{ ,"title,":,"Test Article,", ,"summary,":,"Summary," } }`,
    expectedFix: 'Fix malformed property names and structure'
  },
  {
    name: 'Mixed quotes and escaping',
    input: `{ "article": { "title": "Test's "Article"", "summary": 'Summary with "quotes"' } }`,
    expectedFix: 'Standardize quotes and fix escaping'
  },
  {
    name: 'Array structure issues',
    input: `{ "items": [ { "name": "Item 1" } { "name": "Item 2" } ] }`,
    expectedFix: 'Add comma between array items'
  },
  {
    name: 'Unicode and special characters',
    input: `{ "article": { "title": "Test – Article", "summary": "Summary… with ellipsis" } }`,
    expectedFix: 'Handle unicode characters properly'
  }
];

async function runJSONParsingTests() {
  console.log('=== JSON PARSING EDGE CASE TESTS ===\n');
  
  for (const testCase of testCases) {
    console.log(`Testing: ${testCase.name}`);
    console.log(`Input: ${testCase.input}`);
    console.log(`Expected fix: ${testCase.expectedFix}`);
    
    try {
      const result = await jsonFormatterService.formatToValidJSON(testCase.input);
      const parsed = JSON.parse(result);
      console.log('✓ SUCCESS - Valid JSON produced');
      console.log('Result:', JSON.stringify(parsed, null, 2));
    } catch (error) {
      console.log('✗ FAILED:', error.message);
    }
    
    console.log('---\n');
  }
}

// Function to test the actual problematic response from logs
async function testActualFailure() {
  console.log('=== TESTING ACTUAL FAILURE FROM LOGS ===\n');
  
  const actualFailure = `{ ,"article,":,{ ,"title,":,"Catastrophic Flooding i`;
  
  try {
    const result = await jsonFormatterService.formatToValidJSON(actualFailure);
    console.log('✓ Actual failure case resolved');
    console.log('Result:', result);
  } catch (error) {
    console.log('✗ Actual failure case still failing:', error.message);
  }
}

// Export for use in other modules
export { runJSONParsingTests, testActualFailure };

// Run tests if this file is executed directly
if (require.main === module) {
  runJSONParsingTests().then(() => {
    return testActualFailure();
  }).catch(console.error);
}