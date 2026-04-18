const { createGoogleGenerativeAI } = require('@ai-sdk/google'); // Use this for custom config
const { generateText } = require('ai');

// 1. Setup the provider with the key directly
const google = createGoogleGenerativeAI({
    apiKey: "AIzaSyD9oYTJuP8-ahPOn84LBNXs8IaGHN79DzI",
});

async function testGeminiModel() {
    console.log("--- Starting Gemini Model Test ---");
    
    try {
        const result = await generateText({
            // 2. Use the configured provider
            model: google('gemini-3-flash-preview'), 
            system: "You are a helpful assistant.",
            prompt: "Hello! If you can read this, please reply with 'Model is Active' and your version name.",
        });

        console.log("✅ SUCCESS!");
        console.log("Response:", result.text);
        
    } catch (error) {
        console.error("❌ MODEL TEST FAILED");
        console.error("Error Message:", error.message);
        
        if (error.responseBody) {
            console.log("Full Error Body from Google:");
            console.log(error.responseBody);
        }
    }
}

testGeminiModel();