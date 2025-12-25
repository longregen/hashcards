// hashcards - Static Site JavaScript

import init, { HashcardsApp, now_timestamp, today_date } from './pkg/hashcards_wasm.js';

// ============================================================================
// State
// ============================================================================

let app = null;
let macros = {};
let currentCollectionId = null;

// Storage keys
const STORAGE_KEYS = {
    collections: 'hashcards_collections',
    performance: 'hashcards_performance',
};

// ============================================================================
// Storage Layer
// ============================================================================

function loadCollections() {
    try {
        const data = localStorage.getItem(STORAGE_KEYS.collections);
        return data ? JSON.parse(data) : {};
    } catch (e) {
        console.error('Failed to load collections:', e);
        return {};
    }
}

function saveCollections(collections) {
    localStorage.setItem(STORAGE_KEYS.collections, JSON.stringify(collections));
}

function getCollection(id) {
    const collections = loadCollections();
    return collections[id] || null;
}

function saveCollection(id, collection) {
    const collections = loadCollections();
    collections[id] = {
        ...collection,
        lastModified: new Date().toISOString(),
    };
    saveCollections(collections);
}

function deleteCollection(id) {
    const collections = loadCollections();
    delete collections[id];
    saveCollections(collections);
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// ============================================================================
// Screen Management
// ============================================================================

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.style.display = 'none';
    });
    document.querySelectorAll('.modal').forEach(modal => {
        modal.style.display = 'none';
    });
    document.getElementById(screenId).style.display = 'flex';
}

function showModal(modalId) {
    document.getElementById(modalId).style.display = 'flex';
}

function hideModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function setLoadingStatus(status) {
    document.getElementById('loading-status').textContent = status;
}

// ============================================================================
// Initialization
// ============================================================================

async function initialize() {
    try {
        setLoadingStatus('Loading WASM module...');
        await init();

        setLoadingStatus('Initializing application...');
        app = new HashcardsApp();

        setupEventListeners();
        renderCollectionsList();
        showScreen('home-screen');
    } catch (error) {
        console.error('Failed to initialize:', error);
        setLoadingStatus('Failed to load: ' + error.message);
    }
}

// ============================================================================
// Event Listeners
// ============================================================================

function setupEventListeners() {
    // Home screen - source buttons
    document.getElementById('create-collection-btn').addEventListener('click', createNewCollection);
    document.getElementById('import-url-btn').addEventListener('click', () => showModal('url-modal'));
    document.getElementById('connect-git-btn').addEventListener('click', () => showModal('git-modal'));
    document.getElementById('upload-folder-btn').addEventListener('click', () => {
        document.getElementById('folder-input').click();
    });
    document.getElementById('folder-input').addEventListener('change', handleFolderUpload);

    // Data management
    document.getElementById('export-all-btn').addEventListener('click', exportAllData);
    document.getElementById('import-data-btn').addEventListener('click', () => {
        document.getElementById('import-data-input').click();
    });
    document.getElementById('import-data-input').addEventListener('change', importAllData);

    // URL Modal
    document.getElementById('url-cancel-btn').addEventListener('click', () => hideModal('url-modal'));
    document.getElementById('url-import-btn').addEventListener('click', importFromUrls);

    // Git Modal
    document.getElementById('git-cancel-btn').addEventListener('click', () => hideModal('git-modal'));
    document.getElementById('git-connect-btn').addEventListener('click', connectGitRepo);
    document.getElementById('git-provider').addEventListener('change', (e) => {
        const showInstance = e.target.value === 'gitea';
        document.getElementById('git-instance-label').style.display = showInstance ? 'block' : 'none';
    });

    // Editor screen
    document.getElementById('editor-back-btn').addEventListener('click', editorBack);
    document.getElementById('save-collection-btn').addEventListener('click', saveCurrentCollection);
    document.getElementById('add-deck-btn').addEventListener('click', addNewDeck);
    document.getElementById('markdown-editor').addEventListener('input', debounce(updatePreview, 300));

    // Setup screen
    document.getElementById('setup-back-btn').addEventListener('click', () => showScreen('home-screen'));
    document.getElementById('start-session-btn').addEventListener('click', startSession);
    document.getElementById('edit-collection-btn').addEventListener('click', editCurrentCollection);
    document.getElementById('sync-collection-btn').addEventListener('click', syncCurrentCollection);
    document.getElementById('delete-collection-btn').addEventListener('click', deleteCurrentCollection);

    // Drill screen controls
    document.getElementById('reveal-btn').addEventListener('click', revealCard);
    document.getElementById('forgot-btn').addEventListener('click', () => gradeCard('forgot'));
    document.getElementById('hard-btn').addEventListener('click', () => gradeCard('hard'));
    document.getElementById('good-btn').addEventListener('click', () => gradeCard('good'));
    document.getElementById('easy-btn').addEventListener('click', () => gradeCard('easy'));

    // Finished screen
    document.getElementById('new-session-btn').addEventListener('click', startSession);
    document.getElementById('back-to-home-btn').addEventListener('click', () => {
        renderCollectionsList();
        showScreen('home-screen');
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeydown);
}

// ============================================================================
// Home Screen - Collections List
// ============================================================================

function renderCollectionsList() {
    const collections = loadCollections();
    const list = document.getElementById('collections-list');
    const emptyMsg = document.getElementById('no-collections');

    list.innerHTML = '';

    const ids = Object.keys(collections);
    if (ids.length === 0) {
        emptyMsg.style.display = 'block';
        return;
    }

    emptyMsg.style.display = 'none';

    // Sort by last modified, newest first
    ids.sort((a, b) => {
        const dateA = new Date(collections[a].lastModified || 0);
        const dateB = new Date(collections[b].lastModified || 0);
        return dateB - dateA;
    });

    for (const id of ids) {
        const collection = collections[id];
        const item = document.createElement('div');
        item.className = 'collection-item';
        item.innerHTML = `
            <div class="collection-info">
                <span class="collection-name">${escapeHtml(collection.name)}</span>
                <span class="collection-meta">${getSourceLabel(collection.source)} · ${countDecks(collection)} decks</span>
            </div>
            <button class="btn primary small">Study</button>
        `;
        item.querySelector('button').addEventListener('click', () => openCollection(id));
        item.querySelector('.collection-info').addEventListener('click', () => openCollection(id));
        list.appendChild(item);
    }
}

function getSourceLabel(source) {
    switch (source?.type) {
        case 'local': return 'Local';
        case 'url': return 'URL';
        case 'git': return source.provider || 'Git';
        case 'upload': return 'Uploaded';
        default: return 'Local';
    }
}

function countDecks(collection) {
    return Object.keys(collection.decks || {}).length;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// Create New Collection
// ============================================================================

function createNewCollection() {
    const id = generateId();
    const collection = {
        name: 'New Collection',
        source: { type: 'local' },
        decks: {
            'deck.md': '# My Deck\n\nQ: Sample question?\nA: Sample answer.\n'
        },
    };
    saveCollection(id, collection);
    currentCollectionId = id;
    openEditor(collection, 'deck.md');
}

// ============================================================================
// Folder Upload
// ============================================================================

async function handleFolderUpload(event) {
    const files = event.target.files;
    if (!files.length) return;

    const decks = {};
    let collectionName = 'Uploaded Collection';

    for (const file of files) {
        const path = file.webkitRelativePath || file.name;

        // Get collection name from folder
        if (path.includes('/')) {
            collectionName = path.split('/')[0];
        }

        if (path.endsWith('.md')) {
            try {
                const content = await file.text();
                // Use filename as deck name
                const deckName = path.split('/').pop();
                decks[deckName] = content;
            } catch (e) {
                console.error('Failed to read file:', path, e);
            }
        }
    }

    if (Object.keys(decks).length === 0) {
        alert('No markdown files found in the folder.');
        return;
    }

    const id = generateId();
    const collection = {
        name: collectionName,
        source: { type: 'upload' },
        decks,
    };
    saveCollection(id, collection);
    currentCollectionId = id;
    openSetup(collection);

    // Reset input
    event.target.value = '';
}

// ============================================================================
// URL Import
// ============================================================================

async function importFromUrls() {
    const urlsText = document.getElementById('url-input').value.trim();
    const collectionName = document.getElementById('url-collection-name').value.trim() || 'URL Collection';

    if (!urlsText) {
        alert('Please enter at least one URL.');
        return;
    }

    const urls = urlsText.split('\n').map(u => u.trim()).filter(u => u);
    const decks = {};
    const errors = [];

    for (const url of urls) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const content = await response.text();

            // Extract filename from URL
            const urlPath = new URL(url).pathname;
            let deckName = urlPath.split('/').pop() || 'deck.md';
            if (!deckName.endsWith('.md')) {
                deckName += '.md';
            }

            // Handle duplicates
            let finalName = deckName;
            let counter = 1;
            while (decks[finalName]) {
                finalName = deckName.replace('.md', `_${counter}.md`);
                counter++;
            }

            decks[finalName] = content;
        } catch (e) {
            errors.push(`${url}: ${e.message}`);
        }
    }

    if (Object.keys(decks).length === 0) {
        alert('Failed to fetch any URLs:\n' + errors.join('\n'));
        return;
    }

    const id = generateId();
    const collection = {
        name: collectionName,
        source: {
            type: 'url',
            urls,
        },
        decks,
    };
    saveCollection(id, collection);
    currentCollectionId = id;

    hideModal('url-modal');
    document.getElementById('url-input').value = '';
    document.getElementById('url-collection-name').value = '';

    if (errors.length > 0) {
        alert('Some URLs failed to load:\n' + errors.join('\n'));
    }

    openSetup(collection);
}

// ============================================================================
// Git Integration
// ============================================================================

async function connectGitRepo() {
    const provider = document.getElementById('git-provider').value;
    const repo = document.getElementById('git-repo').value.trim();
    const branch = document.getElementById('git-branch').value.trim() || 'main';
    const path = document.getElementById('git-path').value.trim();
    const token = document.getElementById('git-token').value.trim();
    const instance = document.getElementById('git-instance').value.trim();

    if (!repo) {
        alert('Please enter a repository (owner/repo).');
        return;
    }

    // Build API URL based on provider
    let apiBase, contentsUrl, headers = {};

    switch (provider) {
        case 'github':
            apiBase = 'https://api.github.com';
            contentsUrl = `${apiBase}/repos/${repo}/contents/${path}?ref=${branch}`;
            if (token) headers['Authorization'] = `Bearer ${token}`;
            break;
        case 'gitlab':
            apiBase = 'https://gitlab.com/api/v4';
            const encodedPath = encodeURIComponent(path || '');
            contentsUrl = `${apiBase}/projects/${encodeURIComponent(repo)}/repository/tree?ref=${branch}&path=${encodedPath}`;
            if (token) headers['PRIVATE-TOKEN'] = token;
            break;
        case 'codeberg':
            apiBase = 'https://codeberg.org/api/v1';
            contentsUrl = `${apiBase}/repos/${repo}/contents/${path}?ref=${branch}`;
            if (token) headers['Authorization'] = `token ${token}`;
            break;
        case 'gitea':
            if (!instance) {
                alert('Please enter your Forgejo/Gitea instance URL.');
                return;
            }
            apiBase = instance.replace(/\/$/, '') + '/api/v1';
            contentsUrl = `${apiBase}/repos/${repo}/contents/${path}?ref=${branch}`;
            if (token) headers['Authorization'] = `token ${token}`;
            break;
    }

    headers['Accept'] = 'application/json';

    try {
        const decks = await fetchGitContents(provider, contentsUrl, headers, repo, branch, path, apiBase);

        if (Object.keys(decks).length === 0) {
            alert('No markdown files found in the repository.');
            return;
        }

        const id = generateId();
        const collection = {
            name: repo.split('/').pop(),
            source: {
                type: 'git',
                provider,
                repo,
                branch,
                path,
                token,
                instance: provider === 'gitea' ? instance : undefined,
            },
            decks,
        };
        saveCollection(id, collection);
        currentCollectionId = id;

        hideModal('git-modal');
        // Clear form
        document.getElementById('git-repo').value = '';
        document.getElementById('git-path').value = '';
        document.getElementById('git-token').value = '';

        openSetup(collection);
    } catch (e) {
        console.error('Git fetch error:', e);
        alert('Failed to connect to repository: ' + e.message);
    }
}

async function fetchGitContents(provider, contentsUrl, headers, repo, branch, path, apiBase) {
    const decks = {};

    if (provider === 'gitlab') {
        // GitLab has different API structure
        const response = await fetch(contentsUrl, { headers });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const items = await response.json();

        for (const item of items) {
            if (item.type === 'blob' && item.name.endsWith('.md')) {
                const fileUrl = `${apiBase}/projects/${encodeURIComponent(repo)}/repository/files/${encodeURIComponent(item.path)}/raw?ref=${branch}`;
                const fileResponse = await fetch(fileUrl, { headers });
                if (fileResponse.ok) {
                    decks[item.name] = await fileResponse.text();
                }
            }
        }
    } else {
        // GitHub, Gitea, Codeberg have similar APIs
        const response = await fetch(contentsUrl, { headers });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const items = await response.json();

        // Handle single file response
        const fileList = Array.isArray(items) ? items : [items];

        for (const item of fileList) {
            if (item.type === 'file' && item.name.endsWith('.md')) {
                // Fetch file content
                const fileResponse = await fetch(item.download_url || item.url, {
                    headers: item.download_url ? {} : headers
                });
                if (fileResponse.ok) {
                    let content;
                    if (item.download_url) {
                        content = await fileResponse.text();
                    } else {
                        const data = await fileResponse.json();
                        content = atob(data.content);
                    }
                    decks[item.name] = content;
                }
            }
        }
    }

    return decks;
}

async function syncCurrentCollection() {
    const collection = getCollection(currentCollectionId);
    if (!collection || collection.source?.type !== 'git') return;

    const { provider, repo, branch, path, token, instance } = collection.source;

    let apiBase, contentsUrl, headers = {};

    switch (provider) {
        case 'github':
            apiBase = 'https://api.github.com';
            contentsUrl = `${apiBase}/repos/${repo}/contents/${path}?ref=${branch}`;
            if (token) headers['Authorization'] = `Bearer ${token}`;
            break;
        case 'gitlab':
            apiBase = 'https://gitlab.com/api/v4';
            const encodedPath = encodeURIComponent(path || '');
            contentsUrl = `${apiBase}/projects/${encodeURIComponent(repo)}/repository/tree?ref=${branch}&path=${encodedPath}`;
            if (token) headers['PRIVATE-TOKEN'] = token;
            break;
        case 'codeberg':
            apiBase = 'https://codeberg.org/api/v1';
            contentsUrl = `${apiBase}/repos/${repo}/contents/${path}?ref=${branch}`;
            if (token) headers['Authorization'] = `token ${token}`;
            break;
        case 'gitea':
            apiBase = instance.replace(/\/$/, '') + '/api/v1';
            contentsUrl = `${apiBase}/repos/${repo}/contents/${path}?ref=${branch}`;
            if (token) headers['Authorization'] = `token ${token}`;
            break;
    }

    headers['Accept'] = 'application/json';

    try {
        const decks = await fetchGitContents(provider, contentsUrl, headers, repo, branch, path, apiBase);
        collection.decks = decks;
        saveCollection(currentCollectionId, collection);
        openSetup(collection);
        alert('Collection synced successfully!');
    } catch (e) {
        alert('Failed to sync: ' + e.message);
    }
}

// ============================================================================
// Editor
// ============================================================================

let editorState = {
    decks: {},
    currentDeck: null,
    collectionName: '',
    returnTo: 'home',
};

function openEditor(collection, deckName) {
    editorState.decks = { ...collection.decks };
    editorState.collectionName = collection.name;
    editorState.currentDeck = deckName || Object.keys(collection.decks)[0];

    document.getElementById('collection-name-input').value = collection.name;
    renderDeckList();
    loadDeckIntoEditor(editorState.currentDeck);
    showScreen('editor-screen');
}

function renderDeckList() {
    const list = document.getElementById('deck-list');
    list.innerHTML = '';

    for (const deckName of Object.keys(editorState.decks)) {
        const li = document.createElement('li');
        li.className = 'deck-item' + (deckName === editorState.currentDeck ? ' active' : '');

        const nameSpan = document.createElement('span');
        nameSpan.className = 'deck-item-name';
        nameSpan.textContent = deckName.replace('.md', '');
        nameSpan.addEventListener('click', () => switchDeck(deckName));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'deck-delete-btn';
        deleteBtn.textContent = '×';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteDeck(deckName);
        });

        li.appendChild(nameSpan);
        li.appendChild(deleteBtn);
        list.appendChild(li);
    }
}

function loadDeckIntoEditor(deckName) {
    editorState.currentDeck = deckName;
    document.getElementById('markdown-editor').value = editorState.decks[deckName] || '';
    document.getElementById('current-deck-name').textContent = deckName.replace('.md', '');
    updatePreview();
    renderDeckList();
}

function switchDeck(deckName) {
    // Save current deck first
    if (editorState.currentDeck) {
        editorState.decks[editorState.currentDeck] = document.getElementById('markdown-editor').value;
    }
    loadDeckIntoEditor(deckName);
}

function addNewDeck() {
    const baseName = 'new-deck';
    let name = baseName + '.md';
    let counter = 1;
    while (editorState.decks[name]) {
        name = `${baseName}-${counter}.md`;
        counter++;
    }
    editorState.decks[name] = '# New Deck\n\nQ: Question?\nA: Answer.\n';
    loadDeckIntoEditor(name);
}

function deleteDeck(deckName) {
    if (Object.keys(editorState.decks).length <= 1) {
        alert('Cannot delete the last deck.');
        return;
    }
    if (!confirm(`Delete deck "${deckName}"?`)) return;

    delete editorState.decks[deckName];
    const remaining = Object.keys(editorState.decks);
    loadDeckIntoEditor(remaining[0]);
}

function saveCurrentCollection() {
    // Save current deck content
    if (editorState.currentDeck) {
        editorState.decks[editorState.currentDeck] = document.getElementById('markdown-editor').value;
    }

    const collection = getCollection(currentCollectionId);
    collection.name = document.getElementById('collection-name-input').value || 'Untitled';
    collection.decks = editorState.decks;
    saveCollection(currentCollectionId, collection);

    alert('Collection saved!');
}

function editorBack() {
    // Save current state
    if (editorState.currentDeck) {
        editorState.decks[editorState.currentDeck] = document.getElementById('markdown-editor').value;
    }

    const collection = getCollection(currentCollectionId);
    collection.name = document.getElementById('collection-name-input').value || 'Untitled';
    collection.decks = editorState.decks;
    saveCollection(currentCollectionId, collection);

    if (editorState.returnTo === 'setup') {
        openSetup(collection);
    } else {
        renderCollectionsList();
        showScreen('home-screen');
    }
}

function updatePreview() {
    const markdown = document.getElementById('markdown-editor').value;
    const preview = document.getElementById('markdown-preview');
    const countEl = document.getElementById('card-count-preview');

    try {
        // Use WASM to parse and count cards
        const tempApp = new HashcardsApp();
        const files = [[editorState.currentDeck || 'preview.md', markdown]];
        const cardCount = tempApp.load_cards(JSON.stringify(files));

        countEl.textContent = `${cardCount} card${cardCount !== 1 ? 's' : ''}`;

        // Simple markdown preview (not full card rendering)
        preview.innerHTML = simpleMarkdownPreview(markdown);
    } catch (e) {
        countEl.textContent = 'Error parsing';
        preview.innerHTML = `<p style="color: red;">Parse error: ${escapeHtml(e.message)}</p>`;
    }
}

function simpleMarkdownPreview(markdown) {
    // Very basic markdown to HTML for preview
    let html = escapeHtml(markdown);

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Bold and italic
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Q/A highlighting
    html = html.replace(/^(Q:)/gm, '<span class="qa-label q">$1</span>');
    html = html.replace(/^(A:)/gm, '<span class="qa-label a">$1</span>');

    // Cloze highlighting
    html = html.replace(/\{\{(.+?)\}\}/g, '<span class="cloze-preview">$1</span>');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    return html;
}

function editCurrentCollection() {
    const collection = getCollection(currentCollectionId);
    editorState.returnTo = 'setup';
    openEditor(collection, Object.keys(collection.decks)[0]);
}

// ============================================================================
// Setup Screen (Collection View)
// ============================================================================

function openCollection(id) {
    currentCollectionId = id;
    const collection = getCollection(id);
    if (!collection) {
        alert('Collection not found.');
        renderCollectionsList();
        return;
    }
    openSetup(collection);
}

function openSetup(collection) {
    document.getElementById('setup-collection-name').textContent = collection.name;
    document.getElementById('setup-source').textContent = getSourceLabel(collection.source);

    // Load cards into WASM app
    const files = Object.entries(collection.decks).map(([name, content]) => [name, content]);
    const cardCount = app.load_cards(JSON.stringify(files));

    const deckNames = JSON.parse(app.deck_names());
    document.getElementById('total-cards').textContent = cardCount;
    document.getElementById('deck-count').textContent = deckNames.length;
    document.getElementById('due-today').textContent = app.collection_size();

    // Show/hide sync button for git sources
    const syncBtn = document.getElementById('sync-collection-btn');
    syncBtn.style.display = collection.source?.type === 'git' ? 'inline-block' : 'none';

    // Show/hide edit button (not for git sources)
    const editBtn = document.getElementById('edit-collection-btn');
    editBtn.style.display = collection.source?.type !== 'git' ? 'inline-block' : 'none';

    showScreen('setup-screen');
}

function deleteCurrentCollection() {
    if (!confirm('Are you sure you want to delete this collection? This cannot be undone.')) {
        return;
    }
    deleteCollection(currentCollectionId);
    currentCollectionId = null;
    renderCollectionsList();
    showScreen('home-screen');
}

// ============================================================================
// Drilling Session
// ============================================================================

function startSession() {
    const shuffle = document.getElementById('shuffle-cards').checked;
    const cardLimitInput = document.getElementById('card-limit').value;
    const newCardLimitInput = document.getElementById('new-card-limit').value;

    const cardLimit = cardLimitInput ? parseInt(cardLimitInput) : null;
    const newCardLimit = newCardLimitInput ? parseInt(newCardLimitInput) : null;

    try {
        const today = today_date();
        const dueCount = app.start_session(today, shuffle, cardLimit, newCardLimit);

        if (dueCount === 0) {
            alert('No cards due today!');
            return;
        }

        showScreen('drill-screen');
        renderCard();
    } catch (error) {
        console.error('Failed to start session:', error);
        alert('Failed to start session: ' + error);
    }
}

function renderCard() {
    if (!app.has_cards()) {
        finishSession();
        return;
    }

    const deckName = app.current_deck_name() || 'Unknown Deck';
    document.getElementById('deck-name').textContent = deckName;

    try {
        const frontHtml = app.current_front_html();
        document.getElementById('question').innerHTML = frontHtml;

        if (app.is_revealed()) {
            const backHtml = app.current_back_html();
            document.getElementById('answer').innerHTML = backHtml;
            document.getElementById('answer').style.display = 'block';
            document.getElementById('reveal-controls').style.display = 'none';
            document.getElementById('grade-controls').style.display = 'flex';
        } else {
            document.getElementById('answer').style.display = 'none';
            document.getElementById('reveal-controls').style.display = 'flex';
            document.getElementById('grade-controls').style.display = 'none';
        }

        // Update progress
        const total = app.total_cards();
        const remaining = app.remaining_cards();
        const reviewed = total - remaining;
        const progress = app.progress() * 100;

        document.getElementById('progress-fill').style.width = progress + '%';
        document.getElementById('progress-text').textContent = reviewed + ' / ' + total;

        // Render math
        renderMath();

        document.getElementById('card-content').style.opacity = '1';
    } catch (error) {
        console.error('Failed to render card:', error);
    }
}

function revealCard() {
    app.reveal();
    renderCard();
}

function gradeCard(grade) {
    try {
        const now = now_timestamp();
        app.grade_card(grade, now);
        renderCard();
    } catch (error) {
        console.error('Failed to grade card:', error);
        alert('Failed to grade card: ' + error);
    }
}

function finishSession() {
    document.getElementById('reviewed-count').textContent = app.total_cards();
    showScreen('finished-screen');
}

// ============================================================================
// Keyboard Handling
// ============================================================================

function handleKeydown(event) {
    // Ignore if typing in an input
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        return;
    }

    // Ignore with modifiers
    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
        return;
    }

    const drillScreen = document.getElementById('drill-screen');
    if (drillScreen.style.display === 'none') {
        return;
    }

    switch (event.key) {
        case ' ':
            event.preventDefault();
            if (!app.is_revealed()) {
                revealCard();
            }
            break;
        case '1':
            if (app.is_revealed()) gradeCard('forgot');
            break;
        case '2':
            if (app.is_revealed()) gradeCard('hard');
            break;
        case '3':
            if (app.is_revealed()) gradeCard('good');
            break;
        case '4':
            if (app.is_revealed()) gradeCard('easy');
            break;
    }
}

// ============================================================================
// Math Rendering
// ============================================================================

function renderMath() {
    if (typeof renderMathInElement === 'function') {
        renderMathInElement(document.getElementById('card-content'), {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false },
                { left: '\\(', right: '\\)', display: false },
                { left: '\\[', right: '\\]', display: true },
            ],
            macros: macros,
            throwOnError: false,
        });
    }
}

// ============================================================================
// Data Export/Import
// ============================================================================

function exportAllData() {
    const data = {
        collections: loadCollections(),
        performance: app.export_performance(),
        exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'hashcards-backup.json';
    a.click();

    URL.revokeObjectURL(url);
}

function importAllData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);

            if (data.collections) {
                const existing = loadCollections();
                const merged = { ...existing, ...data.collections };
                saveCollections(merged);
            }

            if (data.performance) {
                app.import_performance(typeof data.performance === 'string'
                    ? data.performance
                    : JSON.stringify(data.performance));
            }

            renderCollectionsList();
            alert('Data imported successfully!');
        } catch (error) {
            console.error('Failed to import data:', error);
            alert('Failed to import data: ' + error.message);
        }
    };
    reader.readAsText(file);

    // Reset input
    event.target.value = '';
}

// ============================================================================
// Utilities
// ============================================================================

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ============================================================================
// Start Application
// ============================================================================

initialize();
