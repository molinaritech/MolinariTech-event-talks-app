document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const btnRefresh = document.getElementById('btn-refresh');
    const refreshIcon = btnRefresh.querySelector('i');
    const feedStatus = document.getElementById('feed-status');
    const statusText = feedStatus.querySelector('.status-text');
    const searchInput = document.getElementById('search-input');
    const searchClear = document.getElementById('search-clear');
    const filterButtons = document.querySelectorAll('.filter-btn');
    const resultsCount = document.getElementById('results-count');
    const loadingSpinner = document.getElementById('loading-spinner');
    const errorContainer = document.getElementById('error-container');
    const errorMessage = document.getElementById('error-message');
    const btnRetry = document.getElementById('btn-retry');
    const releaseFeed = document.getElementById('release-feed');
    
    // Selection Bar Elements
    const selectionBar = document.getElementById('selection-bar');
    const selectionCount = document.getElementById('selection-count');
    const btnTweetSelected = document.getElementById('btn-tweet-selected');
    const btnClearSelection = document.getElementById('btn-clear-selection');
    const btnExportCsv = document.getElementById('btn-export-csv');
    
    // Modal Elements
    const tweetModal = document.getElementById('tweet-modal');
    const tweetTextarea = document.getElementById('tweet-textarea');
    const charCounter = document.getElementById('char-counter');
    const btnModalCancel = document.getElementById('btn-modal-cancel');
    const btnModalSubmit = document.getElementById('btn-modal-submit');
    const modalCloseBtn = document.getElementById('modal-close-btn');

    // App State
    let allUpdates = [];      // Parsed individual updates
    let filteredUpdates = []; // Current filtered view
    let selectedUpdates = []; // List of selected update objects
    let currentFilterType = 'all';
    let searchQuery = '';

    // Initialize
    const themeButtons = document.querySelectorAll('.theme-btn');
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);
    
    themeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.getAttribute('data-theme');
            setTheme(theme);
        });
    });
    
    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        themeButtons.forEach(btn => {
            if (btn.getAttribute('data-theme') === theme) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    fetchReleaseNotes();

    // Event Listeners
    btnRefresh.addEventListener('click', fetchReleaseNotes);
    btnRetry.addEventListener('click', fetchReleaseNotes);
    btnExportCsv.addEventListener('click', exportToCsv);
    
    // Search Handlers
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim().toLowerCase();
        if (searchQuery) {
            searchClear.style.display = 'flex';
        } else {
            searchClear.style.display = 'none';
        }
        applyFilters();
    });
    
    searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        searchClear.style.display = 'none';
        searchInput.focus();
        applyFilters();
    });

    // Filter Type Buttons
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilterType = btn.getAttribute('data-type');
            applyFilters();
        });
    });

    // Selection Bar Clear Button
    btnClearSelection.addEventListener('click', clearAllSelections);

    // Modal Action Handlers
    modalCloseBtn.addEventListener('click', closeTweetModal);
    btnModalCancel.addEventListener('click', closeTweetModal);
    
    tweetTextarea.addEventListener('input', updateCharCounter);
    
    btnModalSubmit.addEventListener('click', () => {
        const text = tweetTextarea.value;
        const twitterUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(twitterUrl, '_blank', 'noopener,noreferrer');
        closeTweetModal();
    });

    // Close modal when clicking outside contents
    window.addEventListener('click', (e) => {
        if (e.target === tweetModal) {
            closeTweetModal();
        }
    });

    // Main Fetch Function
    async function fetchReleaseNotes() {
        showLoading();
        setConnectionStatus('checking');
        
        try {
            const response = await fetch('/api/releases');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            
            if (data.status === 'success') {
                processEntries(data.entries);
                setConnectionStatus(data.source);
                showContent();
                applyFilters();
            } else {
                throw new Error(data.message || 'Unknown server error');
            }
        } catch (error) {
            console.error('Error fetching releases:', error);
            setConnectionStatus('error');
            showError(error.message);
        }
    }

    // Process Raw Entries into Individual Update Blocks
    function processEntries(entries) {
        allUpdates = [];
        
        entries.forEach(entry => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(entry.content, 'text/html');
            
            let currentType = 'Update';
            let currentHTML = [];
            let index = 0;
            
            // Loop through children of the parsed body
            Array.from(doc.body.children).forEach(child => {
                if (child.tagName === 'H3') {
                    // Save preceding section if it exists
                    if (currentHTML.length > 0) {
                        allUpdates.push({
                            id: `${entry.id}-${index++}`,
                            date: entry.title,
                            link: entry.link,
                            type: currentType,
                            htmlContent: currentHTML.join('')
                        });
                        currentHTML = [];
                    }
                    currentType = child.textContent.trim();
                } else {
                    currentHTML.push(child.outerHTML);
                }
            });
            
            // Push the last remaining section
            if (currentHTML.length > 0) {
                allUpdates.push({
                    id: `${entry.id}-${index++}`,
                    date: entry.title,
                    link: entry.link,
                    type: currentType,
                    htmlContent: currentHTML.join('')
                });
            }
            
            // If no H3 was found but there is text content, keep as general update
            if (index === 0 && entry.content.trim()) {
                allUpdates.push({
                    id: entry.id,
                    date: entry.title,
                    link: entry.link,
                    type: 'Update',
                    htmlContent: entry.content
                });
            }
        });
        
        // Reset selections on fresh data fetch
        selectedUpdates = [];
        updateSelectionUI();
    }

    // Apply Search and Type Filters
    function applyFilters() {
        filteredUpdates = allUpdates.filter(item => {
            const matchesType = currentFilterType === 'all' || item.type.toLowerCase() === currentFilterType.toLowerCase();
            
            // Text search matches date, type, or HTML contents
            const cleanText = getCleanText(item.htmlContent).toLowerCase();
            const matchesSearch = !searchQuery || 
                item.type.toLowerCase().includes(searchQuery) ||
                item.date.toLowerCase().includes(searchQuery) ||
                cleanText.includes(searchQuery);
                
            return matchesType && matchesSearch;
        });
        
        renderUpdates();
    }

    // Render Cards in DOM
    function renderUpdates() {
        releaseFeed.innerHTML = '';
        
        if (filteredUpdates.length === 0) {
            resultsCount.textContent = 'No updates match your filters';
            releaseFeed.innerHTML = `
                <div class="loading-container" style="border-style: solid; padding: 3rem;">
                    <i class="fa-solid fa-folder-open" style="font-size: 2.5rem; color: var(--text-muted);"></i>
                    <p>No release notes found for the current search/filters.</p>
                </div>
            `;
            return;
        }

        resultsCount.textContent = `Showing ${filteredUpdates.length} release note updates`;
        
        filteredUpdates.forEach(item => {
            const card = document.createElement('article');
            const isChecked = selectedUpdates.some(s => s.id === item.id);
            const normalizedType = getNormalizedTypeClass(item.type);
            
            card.className = `release-card category-${normalizedType}`;
            card.dataset.id = item.id;
            
            card.innerHTML = `
                <div class="card-select-area">
                    <label class="checkbox-container" title="Select this update to tweet">
                        <input type="checkbox" class="card-checkbox" ${isChecked ? 'checked' : ''}>
                        <span class="checkmark"></span>
                    </label>
                </div>
                <div class="card-content-area">
                    <div class="card-header">
                        <div class="badge-and-date">
                            <span class="type-badge">${item.type}</span>
                            <time class="date-text">${item.date}</time>
                        </div>
                        <div class="card-actions-top">
                            <button class="btn-card-action btn-copy" title="Copy text to clipboard">
                                <i class="fa-regular fa-copy"></i>
                            </button>
                            <button class="btn-card-action btn-single-tweet" title="Tweet this specific update">
                                <i class="fa-brands fa-x-twitter"></i>
                            </button>
                        </div>
                    </div>
                    <div class="release-description">
                        ${item.htmlContent}
                    </div>
                </div>
            `;
            
            // Checkbox event
            const checkbox = card.querySelector('.card-checkbox');
            checkbox.addEventListener('change', (e) => {
                toggleSelection(item, e.target.checked);
            });
            
            // Single Tweet Button event
            const btnSingleTweet = card.querySelector('.btn-single-tweet');
            btnSingleTweet.addEventListener('click', () => {
                draftSingleTweet(item);
            });
            
            // Copy Button event
            const btnCopy = card.querySelector('.btn-copy');
            btnCopy.addEventListener('click', () => {
                copyToClipboard(item, btnCopy);
            });
            
            releaseFeed.appendChild(card);
        });
    }

    // Toggle Item Selection
    function toggleSelection(item, isSelected) {
        if (isSelected) {
            if (!selectedUpdates.some(s => s.id === item.id)) {
                selectedUpdates.push(item);
            }
        } else {
            selectedUpdates = selectedUpdates.filter(s => s.id !== item.id);
        }
        updateSelectionUI();
    }

    // Clear all checked checkboxes and app state
    function clearAllSelections() {
        selectedUpdates = [];
        updateSelectionUI();
        
        // Uncheck all in the DOM
        const checkboxes = document.querySelectorAll('.card-checkbox');
        checkboxes.forEach(cb => cb.checked = false);
    }

    // Update Floating Selection Bar and Header clear button
    function updateSelectionUI() {
        const count = selectedUpdates.length;
        selectionCount.textContent = count;
        
        if (count > 0) {
            selectionBar.classList.add('active');
            btnClearSelection.style.display = 'flex';
        } else {
            selectionBar.classList.remove('active');
            btnClearSelection.style.display = 'none';
        }
    }

    // Draft Tweet for a Single Update
    function draftSingleTweet(item) {
        const date = item.date;
        const type = item.type;
        const cleanContent = getCleanText(item.htmlContent);
        const link = item.link;
        
        const intro = `🚀 BigQuery Update (${date}):\n\n[${type}] `;
        const outro = `\n\nRead more: ${link}\n#BigQuery #GCP`;
        
        // Calculate max allowed content length
        const maxLen = 280;
        const reservedLen = intro.length + outro.length;
        const allowedContentLen = maxLen - reservedLen;
        
        let displayContent = cleanContent;
        if (displayContent.length > allowedContentLen) {
            displayContent = displayContent.substring(0, allowedContentLen - 3) + '...';
        }
        
        const tweetText = `${intro}${displayContent}${outro}`;
        openTweetModal(tweetText);
    }

    // Draft Tweet for Multiple Selected Updates (Summary Format)
    btnTweetSelected.addEventListener('click', () => {
        if (selectedUpdates.length === 0) return;
        
        if (selectedUpdates.length === 1) {
            draftSingleTweet(selectedUpdates[0]);
            return;
        }
        
        // Multi-tweet generation
        const header = `🔍 BigQuery Releases Summary:\n\n`;
        const footer = `\n\nMore details: https://cloud.google.com/bigquery/docs/release-notes\n#BigQuery #GCP`;
        
        // Build list items
        let listItems = [];
        selectedUpdates.forEach((item, index) => {
            const cleanContent = getCleanText(item.htmlContent);
            const shortContent = cleanContent.length > 50 ? cleanContent.substring(0, 47) + '...' : cleanContent;
            listItems.push(`${index + 1}. [${item.type}] ${shortContent} (${item.date.split(',')[0]})`);
        });
        
        // Assemble text and check bounds
        let assembledText = header + listItems.join('\n') + footer;
        
        // If exceeds length, truncate and try to fit
        if (assembledText.length > 280) {
            // Re-draft with extremely concise versions
            listItems = [];
            selectedUpdates.forEach((item, index) => {
                const cleanContent = getCleanText(item.htmlContent);
                const maxBodyLength = Math.max(10, Math.floor((280 - header.length - footer.length) / selectedUpdates.length) - 20);
                const shortContent = cleanContent.length > maxBodyLength ? cleanContent.substring(0, maxBodyLength - 3) + '...' : cleanContent;
                listItems.push(`${index + 1}. [${item.type}] ${shortContent}`);
            });
            assembledText = header + listItems.join('\n') + footer;
        }
        
        // Absolute fallback to fit character limits
        if (assembledText.length > 280) {
            assembledText = `📢 I selected ${selectedUpdates.length} BigQuery release updates from ${selectedUpdates[selectedUpdates.length - 1].date} to ${selectedUpdates[0].date}.\n\nCheck out the release notes here: https://cloud.google.com/bigquery/docs/release-notes\n#BigQuery #GCP`;
        }
        
        openTweetModal(assembledText);
    });

    // Modal Control Functions
    function openTweetModal(text) {
        tweetTextarea.value = text;
        tweetModal.classList.add('active');
        updateCharCounter();
        tweetTextarea.focus();
    }

    function closeTweetModal() {
        tweetModal.classList.remove('active');
    }

    function updateCharCounter() {
        const len = tweetTextarea.value.length;
        charCounter.textContent = `${len} / 280`;
        
        // Visual warning formatting
        if (len > 280) {
            charCounter.className = 'error';
            btnModalSubmit.disabled = true;
        } else if (len > 250) {
            charCounter.className = 'warning';
            btnModalSubmit.disabled = false;
        } else {
            charCounter.className = '';
            btnModalSubmit.disabled = false;
        }
    }

    // Helper functions
    function getCleanText(htmlString) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlString;
        
        // Clean out links text or other specific markups if necessary
        let text = tempDiv.textContent || tempDiv.innerText || '';
        
        // Remove duplicate spaces and linebreaks
        return text.replace(/\s+/g, ' ').trim();
    }
    
    function getNormalizedTypeClass(type) {
        const t = type.toLowerCase();
        if (t.includes('feature')) return 'feature';
        if (t.includes('change')) return 'change';
        if (t.includes('announcement')) return 'announcement';
        if (t.includes('issue')) return 'issue';
        return 'general';
    }

    function setConnectionStatus(status) {
        feedStatus.className = 'status-indicator';
        
        if (status === 'checking') {
            statusText.textContent = 'Updating...';
        } else if (status === 'live') {
            feedStatus.classList.add('live');
            statusText.textContent = 'Live Feed Connected';
        } else if (status === 'cached') {
            feedStatus.classList.add('cached');
            statusText.textContent = 'Cached Data (Offline)';
        } else {
            feedStatus.classList.add('error');
            statusText.textContent = 'Connection Error';
        }
    }

    // View States Toggling
    function showLoading() {
        loadingSpinner.style.display = 'flex';
        errorContainer.style.display = 'none';
        releaseFeed.style.display = 'none';
        btnRefresh.disabled = true;
        refreshIcon.classList.add('spinning');
    }

    function showContent() {
        loadingSpinner.style.display = 'none';
        errorContainer.style.display = 'none';
        releaseFeed.style.display = 'flex';
        btnRefresh.disabled = false;
        refreshIcon.classList.remove('spinning');
    }

    function showError(msg) {
        loadingSpinner.style.display = 'none';
        errorContainer.style.display = 'flex';
        releaseFeed.style.display = 'none';
        btnRefresh.disabled = false;
        refreshIcon.classList.remove('spinning');
        errorMessage.textContent = msg || 'An error occurred while fetching release notes.';
    }

    // Copy single update clean text to clipboard
    function copyToClipboard(item, btnElement) {
        const cleanContent = getCleanText(item.htmlContent);
        const copyText = `[${item.type}] BigQuery Update (${item.date}):\n\n${cleanContent}\n\nRead more: ${item.link}`;
        
        navigator.clipboard.writeText(copyText).then(() => {
            const icon = btnElement.querySelector('i');
            // Visual feedback
            icon.className = 'fa-solid fa-check';
            btnElement.style.color = 'var(--color-feature)';
            
            setTimeout(() => {
                icon.className = 'fa-regular fa-copy';
                btnElement.style.color = '';
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            alert('Could not copy to clipboard. Please try again.');
        });
    }

    // Export current filtered updates list to CSV format
    function exportToCsv() {
        if (filteredUpdates.length === 0) {
            alert('No data to export.');
            return;
        }

        // CSV Headers
        const headers = ['Date', 'Type', 'Description', 'Link'];
        
        // Helper to format/escape cell value for CSV formatting
        const escapeCsvValue = (val) => {
            if (val === null || val === undefined) return '';
            let formatted = val.toString().replace(/"/g, '""'); // Escape double quotes
            if (formatted.includes(',') || formatted.includes('\n') || formatted.includes('"')) {
                formatted = `"${formatted}"`;
            }
            return formatted;
        };

        const rows = filteredUpdates.map(item => [
            item.date,
            item.type,
            getCleanText(item.htmlContent),
            item.link
        ]);

        // Build CSV content
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(escapeCsvValue).join(','))
        ].join('\r\n');

        // Create Blob and Download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        
        // Clean filename string with timestamp
        const timestamp = new Date().toISOString().slice(0, 10);
        link.setAttribute('href', url);
        link.setAttribute('download', `bigquery_releases_${timestamp}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
});
