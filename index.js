
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import request from 'request';

dotenv.config();
console.log(process.env.apiKey ,process.env.googleApiKey)
// =========================
// Google Places function
// =========================
async function googlePlaces(query, location, radius = 1000) {
  try {
    const apiKey =process.env.googleApiKey;
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${location}&radius=${radius}&key=${apiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    // Simplified formatted result
    const formatted = data.results.map(place => ({
      name: place.name,
      address: place.formatted_address,
      location: place.geometry.location,
      rating: place.rating,
      place_id: place.place_id
    }));
    
    return formatted;
  } catch (err) {
    console.error("Google Places function error:", err);
    throw err;
  }
}

// =========================
// OpenAI Chat with Function Calling
// =========================
async function openAIWithFunctions(messages) {
  try {
    const tools = [
      {
        type: "function",
        function: {
          name: "googlePlaces",
          description: "Search for places using Google Places API. Useful for finding restaurants, cafes, shops, tourist spots, etc.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The search query (e.g., 'coffee shop', 'pizza restaurant')"
              },
              location: {
                type: "string",
                description: "The latitude,longitude coordinates (e.g., '37.7749,-122.4194')"
              },
              radius: {
                type: "number",
                description: "Search radius in meters (default: 1000)",
                default: 1000
              }
            },
            required: ["query", "location"]
          }
        }
      }
    ];

    const options = {
      url: "https://api.openai.com/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.apiKey}`,
      },
      json: {
        model: "gpt-4o-mini",
        messages: messages,
        tools: tools,
        tool_choice: "auto"
      }
    };

    const response = await new Promise((resolve, reject) => {
      request(options, (error, response, body) => {
        if (error) {
          console.error("Request error:", error);
          return reject(error);
        }
        
        // Debug: Print full response
        console.log("\n📥 OpenAI Response Status:", response.statusCode);
        console.log("📥 Response Body:", JSON.stringify(body, null, 2));
        
        // Check for API errors
        if (body.error) {
          console.error("❌ OpenAI API Error:", body.error);
          return reject(new Error(body.error.message));
        }
        
        return resolve(body);
      });
    });

    return response;
  } catch (err) {
    console.error("OpenAI function error:", err);
    throw err;
  }
}

// =========================
// Handle Function Calls
// =========================
async function handleFunctionCall(toolCall) {
  const functionName = toolCall.function.name;
  const args = JSON.parse(toolCall.function.arguments);

  console.log(`\n🔧 Executing ${functionName} with args:`, args);

  if (functionName === "googlePlaces") {
    const result = await googlePlaces(args.query, args.location, args.radius);
    return JSON.stringify(result);
  }
  
  return null;
}

// =========================
// Main Conversation Loop
// =========================
async function runConversation(userMessage, location = "28.6139,77.2090") {
  try {
    // Initial messages
    let messages = [
      { 
        role: "system", 
        content: `You are a helpful assistant that can search for places. User's current location is ${location}.` 
      },
      { role: "user", content: userMessage }
    ];

    console.log("\n💬 User:", userMessage);
    console.log("📍 Location:", location);

    // First API call
    console.log("\n🚀 Making first API call...");
    let response = await openAIWithFunctions(messages);
    
    // Validate response
    if (!response || !response.choices || !response.choices[0]) {
      console.error("❌ Invalid API response:", response);
      throw new Error("Invalid response from OpenAI API");
    }

    let assistantMessage = response.choices[0].message;

    // Check if function was called
    if (assistantMessage.tool_calls) {
      console.log("\n🔧 ChatGPT called function:", assistantMessage.tool_calls[0].function.name);
      
      // Add assistant's message to conversation
      messages.push(assistantMessage);

      // Execute all function calls
      for (const toolCall of assistantMessage.tool_calls) {
        const functionResult = await handleFunctionCall(toolCall);
        
        const resultCount = JSON.parse(functionResult).length;
        console.log(`\n✅ Function returned: ${resultCount} places`);
        
        // Add function result to conversation
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: functionResult
        });
      }

      // Second API call with function results
      console.log("\n🚀 Making second API call with function results...");
      response = await openAIWithFunctions(messages);
      
      if (!response || !response.choices || !response.choices[0]) {
        console.error("❌ Invalid API response on second call:", response);
        throw new Error("Invalid response from OpenAI API");
      }
      
      assistantMessage = response.choices[0].message;
    }

    console.log("\n🤖 Assistant:", assistantMessage.content);
    return assistantMessage.content;

  } catch (err) {
    console.error("\n❌ Conversation error:", err.message);
    console.error("Stack:", err.stack);
    throw err;
  }
}

// =========================
// Example usage
// =========================
async function main() {
  console.log("=".repeat(60));
  console.log("🧪 Testing OpenAI Function Calling with Google Places");
  console.log("=".repeat(60));

  // Check API key
  if (!process.env.apiKey) {
    console.error("❌ Error: API key not found!");
    console.log("💡 Set your OpenAI API key:");
    console.log("   export apiKey='your-api-key-here'");
    return;
  }

  try {
    // Example 1: Find coffee shops
    console.log("\n\n📍 Example 1: Find coffee shops");
    console.log("-".repeat(60));
    await runConversation(
      "Find me the best coffee shops nearby",
      "28.6139,77.2090" // Patna coordinates
    );

    console.log("\n" + "=".repeat(60) + "\n");

    // Example 2: Find restaurants
    console.log("\n\n🍕 Example 2: Find pizza places");
    console.log("-".repeat(60));
    await runConversation(
      "I want to eat pizza. Show me some good pizza places within 2km",
      "28.6139,77.2090"
    );

    console.log("\n" + "=".repeat(60) + "\n");

    // Example 3: Regular chat (no function call)
    console.log("\n\n💭 Example 3: Regular chat");
    console.log("-".repeat(60));
    await runConversation(
      "What's the capital of India?",
      "28.6139,77.2090"
    );

  } catch (err) {
    console.error("\n❌ Main function error:", err.message);
  }
}

// Run the examples
main();