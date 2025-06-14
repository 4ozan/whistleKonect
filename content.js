// content.js

function findLinkedInPosts() {
    // Updated selectors for better LinkedIn post detection
    const postSelector = '.feed-shared-update-v2, .feed-shared-post, .feed-shared-article';
    const textSelectorCandidates = [
        '[data-attributed-text]', // Primary text content
        '.feed-shared-update-v2__description-wrapper',
        '.feed-shared-text-view',
        '.feed-shared-update-v2__commentary',
        '.update-components-text',
        '.update-components-text__text-view',
        '.feed-shared-inline-show-more-text',
        '.feed-shared-text',
        '.break-words'
    ];
    const actionBarSelector = '.social-details-social-counts, .feed-shared-social-action-bar';

    const posts = document.querySelectorAll(postSelector);
    console.log(`Found ${posts.length} potential posts`);

    posts.forEach((post, index) => {
        // Only process top-level posts, not comments or posts with existing buttons.
        if (post.querySelector('.insight-generator-btn') || post.closest('[data-testid="comment"]')) {
            return;
        }

        let postText = '';
        
        // First try: Look for the main text content
        for (const selector of textSelectorCandidates) {
            const textElements = post.querySelectorAll(selector);
            textElements.forEach(el => {
                // Try multiple ways to get the text content
                let text = '';
                if (el.hasAttribute('data-attributed-text')) {
                    text = el.getAttribute('data-attributed-text');
                } else if (el.querySelector('[aria-label]')) {
                    text = el.querySelector('[aria-label]').getAttribute('aria-label');
                } else {
                    text = el.textContent;
                }
                
                text = text?.trim();
                if (text && !postText.includes(text)) {
                    postText += text + '\n';
                }
            });
        }

        // Second try: If no text found, try expanding "see more" if present
        if (postText.trim().length < 50) {
            const seeMoreBtn = post.querySelector('button.feed-shared-inline-show-more-text__see-more-less-btn');
            if (seeMoreBtn) {
                try {
                    seeMoreBtn.click();
                    // Give it a moment to expand and try again
                    setTimeout(() => {
                        postText = '';
                        for (const selector of textSelectorCandidates) {
                            const textElements = post.querySelectorAll(selector);
                            textElements.forEach(el => {
                                const text = el.textContent?.trim();
                                if (text && !postText.includes(text)) {
                                    postText += text + '\n';
                                }
                            });
                        }
                    }, 100);
                } catch (e) {
                    console.warn('Failed to expand see more:', e);
                }
            }
        }

        // Third try: Just get all text content from the post
        if (postText.trim().length < 50) {
            const mainContent = post.querySelector('.feed-shared-update-v2__content, .update-components-update-v2__commentary');
            if (mainContent) {
                postText = Array.from(mainContent.childNodes)
                    .filter(node => node.nodeType === Node.TEXT_NODE || node.nodeType === Node.ELEMENT_NODE)
                    .map(node => node.textContent?.trim())
                    .filter(text => text)
                    .join('\n');
            }
        }

        postText = postText.trim();

        if (!postText) {
            console.warn(`Post ${index} has no text content`, post);
            return;
        }

        const btn = document.createElement('button');
        btn.innerHTML = '✨ Gen Insights';
        btn.className = 'insight-generator-btn';

        btn.onclick = (event) => {
            event.stopPropagation();
            event.preventDefault();

            console.log("Content.js: Button clicked. Extracted text:", postText.substring(0, 100) + '...');
            const originalText = btn.innerHTML;
            btn.textContent = '⏳ Sending...';
            btn.disabled = true;

            chrome.runtime.sendMessage({ type: "ANALYZE_LINKEDIN_POST", text: postText }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Content.js: Error sending message:", chrome.runtime.lastError.message);
                    btn.textContent = '⚠️ Error';
                    setTimeout(() => { btn.innerHTML = originalText; btn.disabled = false; }, 3000);
                } else if (response && response.status === "received") {
                    console.log("Content.js: Message sent, response:", response.status);
                    btn.textContent = '✅ready'; // Indicate success & next step
                    setTimeout(() => { btn.innerHTML = originalText; btn.disabled = false; }, 3000);
                } else {
                     console.warn("Content.js: No response or unexpected status.", response);
                     btn.textContent = '⚠️ Error';
                     setTimeout(() => { btn.innerHTML = originalText; btn.disabled = false; }, 3000);
                }
            });
        };

        const actionBar = post.querySelector(actionBarSelector);
        if (actionBar) {
            // Check if our button group already exists to avoid duplicates
             if (!actionBar.querySelector('.insight-btn-wrapper')) {
                const wrapperDiv = document.createElement('div');
                wrapperDiv.style.display = 'inline-block';
                wrapperDiv.className = 'insight-btn-wrapper'; // Add a class for identification
                wrapperDiv.appendChild(btn);
                actionBar.appendChild(wrapperDiv);
             }
        } else {
             const fallbackBar = post.querySelector('.feed-shared-social-action-bar');
             if(fallbackBar && !fallbackBar.querySelector('.insight-generator-btn')){
                 fallbackBar.appendChild(btn);
             } else {
                console.warn("Content.js: Could not find action bar for post.", post);
             }
        }
    });
}

// REMOVED the chrome.runtime.onMessage listener - it's handled by the popup now.

const observer = new MutationObserver((mutationsList, observer) => {
    // A simple check - look for added nodes. More complex checks can be added
    // if performance becomes an issue.
    for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            // Use a debounce/throttle to avoid running too often during heavy DOM changes
            clearTimeout(window.linkedInInsightDebounce);
            window.linkedInInsightDebounce = setTimeout(findLinkedInPosts, 750); // Slightly longer delay
            return; // Exit once a relevant mutation is found
        }
    }
});

// Observe the whole body, but be mindful of performance on infinite scroll pages.
observer.observe(document.body, { childList: true, subtree: true });

// Run it once after a delay when the page initially loads.
setTimeout(findLinkedInPosts, 2000);
console.log("Content.js loaded and observing.");