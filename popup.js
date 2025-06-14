document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI elements
    const apiKeyInput = document.getElementById('apiKey');
    const saveApiKeyButton = document.getElementById('saveApiKey');
    const apiKeyStatus = document.getElementById('apiKeyStatus');
    const modelNameInput = document.getElementById('modelName');
    const postContentInput = document.getElementById('postContent');
    const generateCommentButton = document.getElementById('generateComment');
    const resultsArea = document.getElementById('resultsArea');
    const commentList = document.getElementById('commentList');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const statusArea = document.getElementById('statusArea');

    const DEFAULT_MODEL = 'mistralai/Mixtral-8x7B-Instruct-v0.1';
    const BTN_TEXT_DEFAULT = '✨ Gene Insights';
    const BTN_TEXT_LOADING = '⏳ Generating...';

    function hideStatus() {
        errorMessage.classList.add('hidden');
        successMessage.classList.add('hidden');
    }

    function showError(msg) {
        errorMessage.textContent = msg;
        errorMessage.classList.remove('hidden');
        successMessage.classList.add('hidden');
        resultsArea.classList.add('hidden');
        loadingIndicator.classList.add('hidden');
        generateCommentButton.disabled = false;
        generateCommentButton.innerHTML = BTN_TEXT_DEFAULT;
    }

    function showSuccess(msg) {
        successMessage.textContent = msg;
        successMessage.classList.remove('hidden');
        errorMessage.classList.add('hidden');
        // Keep loading indicator hidden unless explicitly shown
    }

    function showLoading() {
        hideStatus();
        loadingIndicator.classList.remove('hidden');
        generateCommentButton.disabled = true;
        generateCommentButton.innerHTML = BTN_TEXT_LOADING;
        resultsArea.classList.add('hidden');
        commentList.innerHTML = '';
    }

    function hideLoading() {
        loadingIndicator.classList.add('hidden');
        generateCommentButton.disabled = false;
        generateCommentButton.innerHTML = BTN_TEXT_DEFAULT;
    }


    function copyToClipboard(text, liElement, buttonElement) {
        navigator.clipboard.writeText(text).then(() => {
            showSuccess('Copied to clipboard!');            buttonElement.textContent = '✅ Copied';
            buttonElement.classList.add('copied');
            liElement.classList.add('border-green-500', 'bg-green-50');

            setTimeout(() => {
                hideStatus();
                buttonElement.textContent = '📋 Copy';
                buttonElement.classList.remove('copied');
                liElement.classList.remove('border-green-500', 'bg-green-50');
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy: ', err);
            showError('Failed to copy text.');
        });
    }    function displayResults(text) {
        commentList.innerHTML = '';
        const lines = text.split('\n');
        let hasContent = false;
        lines.forEach(line => {
            const trimmedLine = line.trim();
            // Check for various bullet point styles
            if (trimmedLine.startsWith('-') || trimmedLine.startsWith('*') || 
                trimmedLine.startsWith('•') || trimmedLine.startsWith('→') ||
                /^\d+\./.test(trimmedLine)) {                // Remove bullet point and any common prefixes
                let insightText = trimmedLine.replace(/^[-*•→]|^\d+\.\s*/, '').trim();
                // Remove any "Type:" prefix if it exists
                insightText = insightText.replace(/^(Key takeaway|Something surprising|Interesting connection|Metaphor|Expert perspective|Different viewpoint|Common mistake|Thought-provoking idea|Potential benefit|Challenge and solution):\s*/i, '').trim();
                
                if (insightText) {
                    const listItem = document.createElement('li');
                    
                    const textSpan = document.createElement('span');
                    textSpan.textContent = insightText;
                    textSpan.className = 'flex-grow mr-3';const copyButton = document.createElement('button');
                    copyButton.textContent = '📋 Copy';
                    copyButton.className = 'btn-copy ml-3 flex-shrink-0';

                    listItem.appendChild(textSpan);
                    listItem.appendChild(copyButton);

                    listItem.onclick = () => {
                         copyToClipboard(insightText, listItem, copyButton);
                    };
                    // Prevent button click from triggering li click (though it does the same)
                    copyButton.onclick = (e) => {
                        e.stopPropagation();
                        copyToClipboard(insightText, listItem, copyButton);
                    };

                    commentList.appendChild(listItem);
                    hasContent = true;
                }
            }
        });

        if (hasContent) {
            resultsArea.classList.remove('hidden');
            hideStatus();
        } else {
            showError('AI returned no insights or an empty response.');
        }
        hideLoading();
    }


    function loadSavedData() {
        chrome.storage.local.get([
            'togetherApiKey',
            'togetherModelName',
            'lastAnalyzedPost',
            'lastGeneratedInsights',
            'lastAnalysisTimestamp',
            'lastAnalysisError'
        ], (result) => {
            if (result.togetherApiKey) {
                apiKeyInput.value = result.togetherApiKey;
                apiKeyStatus.textContent = 'API Key loaded.';
                apiKeyStatus.className = 'text-xs text-green-600 mt-1';
            } else {
                apiKeyStatus.textContent = 'API Key not set. Please save your API Key.';
                apiKeyStatus.className = 'text-xs text-red-600 mt-1';
            }
            modelNameInput.value = result.togetherModelName || '';

            const post = result.lastAnalyzedPost;
            const insights = result.lastGeneratedInsights;
            const error = result.lastAnalysisError;

            if (post) postContentInput.value = post;            if (insights) {
                try {
                    displayResults(insights);
                } catch (e) {
                    console.error('Error displaying insights:', e);
                    showError('Failed to display insights. Please try again.');
                }
            } else if (error) {
                showError(`Analysis failed: ${error}`);
            } else if (post) {
                // Post exists but waiting for analysis
                showLoading();
            }
            hideLoading(); // Ensure loading is hidden on load
        });
    }

    saveApiKeyButton.addEventListener('click', () => {
        const apiKey = apiKeyInput.value.trim();
        const modelName = modelNameInput.value.trim();
        hideStatus();

        if (apiKey) {
            chrome.storage.local.set({ togetherApiKey: apiKey }, () => {
                apiKeyStatus.textContent = 'API Key saved!';
                apiKeyStatus.className = 'text-xs text-green-600 mt-1';
                console.log('API Key saved.');
            });
        } else {
            apiKeyStatus.textContent = 'Please enter an API Key.';
            apiKeyStatus.className = 'text-xs text-red-600 mt-1';
        }
        chrome.storage.local.set({ togetherModelName: modelName || DEFAULT_MODEL }, () => {
            console.log('Model name preference saved.');
        });
    });

    generateCommentButton.addEventListener('click', () => {
        const postText = postContentInput.value.trim();
        if (!postText) {
            showError('Post content is empty.');
            return;
        }

        chrome.storage.local.get(['togetherApiKey'], (result) => {
            if (!result.togetherApiKey) {
                showError('API Key not set. Please save your API Key first.');
                return;
            }

            showLoading(); // Show loading indicator

            chrome.runtime.sendMessage({ type: "ANALYZE_LINKEDIN_POST", text: postText }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Popup: Error sending message:", chrome.runtime.lastError.message);
                    showError("Error initiating analysis. Check background console.");
                } else if (response && response.status === "received") {
                    console.log("Popup: Manual generation request sent.");
                    // Now we wait for storage change or message to update.
                } else {
                    showError("Failed to send request to background service.");
                }
            });
        });
    });

    // Listen for storage changes to update UI automatically
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && (changes.lastGeneratedInsights || changes.lastAnalysisError)) {
            console.log("Popup: Detected storage change, reloading data.");
            loadSavedData();
        }
    });

    // Initial load
    loadSavedData();
});