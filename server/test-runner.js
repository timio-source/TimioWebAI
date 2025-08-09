const { jsonFormatterService } = require('./json-formatter-service.js');

async function testBasicCase() {
  const testInput = '{ ,"article,":,{ ,"title,":,"Test Article,", ,"summary,":,"Summary," } }';
  console.log('=== TESTING BASIC MALFORMED JSON ===');
  console.log('Input:', testInput);
  
  try {
    const result = await jsonFormatterService.formatToValidJSON(testInput);
    console.log('✓ SUCCESS');
    console.log('Fixed JSON:', result);
    const parsed = JSON.parse(result);
    console.log('Parsed successfully:', JSON.stringify(parsed, null, 2));
  } catch (error) {
    console.log('✗ FAILED:', error.message);
  }
}

testBasicCase().catch(console.error);