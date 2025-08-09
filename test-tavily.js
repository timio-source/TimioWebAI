import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

async function testTavily() {
  console.log('Testing Tavily API...');
  console.log('API Key:', process.env.TAVILY_API_KEY ? process.env.TAVILY_API_KEY.substring(0, 15) + '...' : 'NOT FOUND');
  
  if (!process.env.TAVILY_API_KEY) {
    console.error('TAVILY_API_KEY not found in environment variables');
    return;
  }

  try {
    const tavilySearch = new TavilySearchResults({
      apiKey: process.env.TAVILY_API_KEY,
      maxResults: 3,
      searchDepth: "basic"
    });

    console.log('Searching for "Tesla"...');
    const results = await tavilySearch.invoke("Tesla");
    
    console.log('✅ Tavily search successful!');
    console.log(`Results type:`, typeof results);
    console.log(`Results length:`, results.length);
    
    // Check if results is a string that needs to be parsed
    if (typeof results === 'string') {
      try {
        const parsedResults = JSON.parse(results);
        console.log('Parsed results:', parsedResults.length, 'items');
        console.log('First parsed result:', parsedResults[0]);
      } catch (parseError) {
        console.log('Could not parse as JSON, showing raw string (first 200 chars):', results.substring(0, 200));
      }
    } else {
      console.log('First result:', results[0]);
    }
    
  } catch (error) {
    console.error('❌ Tavily search failed:');
    console.error('Error:', error.message);
    console.error('Full error:', error);
  }
}

testTavily(); 