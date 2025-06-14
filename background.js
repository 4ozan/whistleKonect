// background.js

const TOGETHER_AI_API_URL = 'https://api.together.xyz/v1/chat/completions';
const DEFAULT_MODEL = 'mistralai/Mixtral-8x7B-Instruct-v0.1';

// Listen for messages from content.js or popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "ANALYZE_LINKEDIN_POST") {
        console.log("Background: Received post text:", request.text ? request.text.substring(0, 100) + '...' : 'Empty');
        analyzePost(request.text);
        sendResponse({ status: "received", message: "Processing request..." });
        return true; // Indicates that the response will be sent asynchronously
    }
});

async function analyzePost(postText) {
    if (!postText) {
        console.error("Background: Received empty post text. Aborting.");
         chrome.storage.local.set({
            lastAnalysisError: "Cannot analyze empty post."
        });
        return;
    }

    chrome.storage.local.get(['togetherApiKey', 'togetherModelName'], async (result) => {
        const apiKey = result.togetherApiKey;
        const modelName = result.togetherModelName || DEFAULT_MODEL;

        if (!apiKey) {
            console.error("Background: API Key is not set.");
            chrome.storage.local.set({
                lastAnalysisError: "API Key not set. Please configure it in the extension popup."
            });
            // Send message back to content script about failure
            chrome.tabs.query({ active: true, currentWindow: false }, (tabs) => {
                 tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { type: "ANALYSIS_COMPLETE", success: false, error: "API Key not set." }));
            });
            return;
        }        const systemPrompt = `I am going to give you some text to analyze and you will return insights in a bulleted list format.
Generate 10 different insights that include:
• A key takeaway
• Something surprising
• An interesting connection
• A metaphor or analogy
• An expert perspective
• A different viewpoint
• A common mistake to avoid
• A thought-provoking idea
• A potential benefit
• A challenge and solution
A few rules:
1. Avoid jargon
2. Each bullet must be 15 words or less
3. Be simple and clear.
4. Use colloquial language, as if you were personally reflecting.
Are you ready for the text`;

        try {
            console.log(`Background: Making API call with model ${modelName}`);
            const response = await fetch(TOGETHER_AI_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: modelName,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: postText }
                    ],
                    max_tokens: 700,
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Unknown API error' }));
                console.error('Background: API Error Response:', errorData);
                throw new Error(`API failed: ${response.status}. ${errorData.error?.message || errorData.message || ''}`);
            }

            const data = await response.json();
            
            if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
                const generatedText = data.choices[0].message.content;
                console.log("Background: Successfully generated insights.");
                chrome.storage.local.set({
                    lastAnalyzedPost: postText,
                    lastGeneratedInsights: generatedText,
                    lastAnalysisTimestamp: new Date().getTime(),
                    lastAnalysisError: null
                }, () => {
                    console.log("Background: Post and insights saved.");
                    chrome.runtime.sendMessage({ type: "ANALYSIS_COMPLETE", success: true });
                });
            } else {
                console.error('Background: Unexpected API response structure:', data);
                throw new Error("Could not parse insights from AI response.");
            }

        } catch (error) {
            console.error('Background: Error during analysis:', error);
            chrome.storage.local.set({
                lastAnalyzedPost: postText,
                lastGeneratedInsights: null,
                lastAnalysisTimestamp: new Date().getTime(),
                lastAnalysisError: error.message
            }, () => {
                 chrome.runtime.sendMessage({ type: "ANALYSIS_COMPLETE", success: false, error: error.message });
            });
        }
    });
}