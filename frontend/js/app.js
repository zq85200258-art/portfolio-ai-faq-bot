(() => {
  'use strict';

  const API = {
    health: '/api/health',
    knowledge: '/api/knowledge',
    chat: '/api/chat',
  };

  const MAX_MESSAGE_LENGTH = 2000;

  const state = {
    provider: null,
    sessionId: null,
    turnCount: 0,
    articles: [],
    filterQuery: '',
    selectedArticleId: null,
    isSending: false,
    lastFailedMessage: null,
    drawerOpen: false,
  };

  // DOM References
  const el = {
    providerBadge: document.getElementById('provider-badge'),
    providerLabel: document.getElementById('provider-label'),
    newThreadBtn: document.getElementById('new-thread-btn'),
    handbookToggle: document.getElementById('handbook-toggle'),
    handbookClose: document.getElementById('handbook-close'),
    drawerBackdrop: document.getElementById('drawer-backdrop'),
    sidebar: document.getElementById('knowledge-sidebar'),
    articleCount: document.getElementById('article-count'),
    mobileArticleCount: document.getElementById('mobile-article-count'),
    knowledgeFilter: document.getElementById('knowledge-filter'),
    knowledgeBody: document.getElementById('knowledge-body'),
    healthAlert: document.getElementById('health-alert'),
    healthAlertText: document.getElementById('health-alert-text'),
    healthRetryBtn: document.getElementById('health-retry-btn'),
    chatThread: document.getElementById('chat-thread'),
    emptyState: document.getElementById('empty-state'),
    messagesList: document.getElementById('messages-list'),
    chatError: document.getElementById('chat-error'),
    chatErrorText: document.getElementById('chat-error-text'),
    chatErrorRetry: document.getElementById('chat-error-retry'),
    chatErrorDismiss: document.getElementById('chat-error-dismiss'),
    draftHint: document.getElementById('draft-hint'),
    draftHintText: document.getElementById('draft-hint-text'),
    draftHintClear: document.getElementById('draft-hint-clear'),
    chatForm: document.getElementById('chat-form'),
    chatInput: document.getElementById('chat-input'),
    charCount: document.getElementById('char-count'),
    sendButton: document.getElementById('send-button'),
    sendButtonLabel: document.getElementById('send-button-label'),
    sessionIndicator: document.getElementById('session-indicator'),
    srStatus: document.getElementById('sr-status'),
  };

  /* ========================================================================
     Utilities
     ======================================================================== */

  function announce(text) {
    el.srStatus.textContent = '';
    requestAnimationFrame(() => {
      el.srStatus.textContent = text;
    });
  }

  function formatTime(date = new Date()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatIndex(index) {
    return String(index + 1).padStart(2, '0');
  }

  function providerDisplay(providerName) {
    if (providerName === 'mock') {
      return {
        state: 'mock',
        label: 'Offline Mock',
        chipClass: 'provider-chip--mock',
        title: 'Offline mock provider active — answers from bundled handbook without an API key.',
      };
    }
    if (providerName === 'openai_compat') {
      return {
        state: 'live',
        label: 'Live Model',
        chipClass: 'provider-chip--live',
        title: 'OpenAI-compatible live provider active on the server.',
      };
    }
    return {
      state: 'live',
      label: providerName || 'Connected',
      chipClass: 'provider-chip--live',
      title: `Active provider: ${providerName || 'unknown'}`,
    };
  }

  function setProviderBadge(mode, customText) {
    if (mode === 'loading') {
      el.providerBadge.dataset.state = 'loading';
      el.providerLabel.textContent = 'Checking…';
      el.providerBadge.title = 'Checking backend answer provider';
      return;
    }

    if (mode === 'error') {
      el.providerBadge.dataset.state = 'error';
      el.providerLabel.textContent = customText || 'Unavailable';
      el.providerBadge.title = 'Could not reach /api/health';
      return;
    }

    const info = providerDisplay(mode);
    state.provider = mode;
    el.providerBadge.dataset.state = info.state;
    el.providerLabel.textContent = info.label;
    el.providerBadge.title = info.title;
  }

  function updateSessionIndicator() {
    if (!state.sessionId) {
      el.sessionIndicator.textContent = 'No active session';
      return;
    }
    const label = state.turnCount === 1 ? '1 turn' : `${state.turnCount} turns`;
    el.sessionIndicator.textContent = `Session active · ${label}`;
  }

  function scrollThreadToBottom() {
    el.chatThread.scrollTop = el.chatThread.scrollHeight;
  }

  /* ========================================================================
     Health & Knowledge Loading
     ======================================================================== */

  async function fetchHealth() {
    setProviderBadge('loading');
    el.healthAlert.hidden = true;

    try {
      const response = await fetch(API.health, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!data || typeof data.provider !== 'string') {
        throw new Error('Unexpected health response');
      }

      setProviderBadge(data.provider);
      el.healthAlert.hidden = true;
    } catch (_error) {
      setProviderBadge('error', 'Unavailable');
      el.healthAlertText.textContent =
        'Unable to reach the LumenDesk Help API (/api/health). Ensure the local server is running, then retry.';
      el.healthAlert.hidden = false;
    }
  }

  async function fetchKnowledge() {
    renderKnowledgeLoading();

    try {
      const response = await fetch(API.knowledge, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!data || !Array.isArray(data.articles)) {
        throw new Error('Unexpected knowledge payload');
      }

      state.articles = data.articles;
      const count = state.articles.length;
      el.articleCount.textContent = String(count);
      el.mobileArticleCount.textContent = String(count);
      el.mobileArticleCount.hidden = false;

      renderKnowledgeList();
    } catch (_error) {
      el.articleCount.textContent = '!';
      el.mobileArticleCount.hidden = true;
      renderKnowledgeError();
    }
  }

  function renderKnowledgeLoading() {
    el.knowledgeBody.textContent = '';
    const stack = document.createElement('div');
    stack.className = 'skeleton-stack';
    stack.setAttribute('aria-label', 'Loading handbook articles');

    for (let i = 0; i < 4; i += 1) {
      const card = document.createElement('div');
      card.className = 'skeleton-card';

      const s1 = document.createElement('div');
      s1.className = 'skeleton-line skeleton-short';
      const s2 = document.createElement('div');
      s2.className = 'skeleton-line skeleton-title';
      const s3 = document.createElement('div');
      s3.className = 'skeleton-line';

      card.append(s1, s2, s3);
      stack.appendChild(card);
    }

    el.knowledgeBody.appendChild(stack);
  }

  function renderKnowledgeError() {
    el.knowledgeBody.textContent = '';

    const card = document.createElement('div');
    card.className = 'sidebar-state-card is-error';
    card.setAttribute('role', 'alert');

    const title = document.createElement('p');
    title.className = 'sidebar-state-title';
    title.textContent = 'Could not load handbook articles';

    const copy = document.createElement('p');
    copy.className = 'sidebar-state-copy';
    copy.textContent = 'The request to /api/knowledge failed. Check that the backend server is running and try again.';

    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'btn-secondary';
    retryBtn.textContent = 'Retry loading';
    retryBtn.addEventListener('click', () => {
      fetchKnowledge();
    });

    card.append(title, copy, retryBtn);
    el.knowledgeBody.appendChild(card);
  }

  function buildArticleQuestion(article) {
    const cleanTitle = (article.title || '').trim();
    if (!cleanTitle) {
      return 'Can you summarize this handbook article?';
    }
    if (cleanTitle.endsWith('?')) {
      return cleanTitle;
    }
    return `Tell me about ${cleanTitle}.`;
  }

  function renderKnowledgeList() {
    el.knowledgeBody.textContent = '';

    const query = state.filterQuery.trim().toLowerCase();
    const filtered = state.articles.filter((article) => {
      if (!query) return true;
      const haystack = `${article.title || ''} ${article.summary || ''}`.toLowerCase();
      return haystack.includes(query);
    });

    if (state.articles.length === 0) {
      const card = document.createElement('div');
      card.className = 'sidebar-state-card';

      const title = document.createElement('p');
      title.className = 'sidebar-state-title';
      title.textContent = 'No handbook articles found';

      const copy = document.createElement('p');
      copy.className = 'sidebar-state-copy';
      copy.textContent = 'The knowledge base returned an empty list.';

      card.append(title, copy);
      el.knowledgeBody.appendChild(card);
      return;
    }

    if (filtered.length === 0) {
      const card = document.createElement('div');
      card.className = 'sidebar-state-card';

      const title = document.createElement('p');
      title.className = 'sidebar-state-title';
      title.textContent = 'No matching articles';

      const copy = document.createElement('p');
      copy.className = 'sidebar-state-copy';
      copy.textContent = `No handbook topics matched "${state.filterQuery.trim()}".`;

      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'btn-secondary';
      clearBtn.textContent = 'Clear filter';
      clearBtn.addEventListener('click', () => {
        state.filterQuery = '';
        el.knowledgeFilter.value = '';
        renderKnowledgeList();
        el.knowledgeFilter.focus();
      });

      card.append(title, copy, clearBtn);
      el.knowledgeBody.appendChild(card);
      return;
    }

    const list = document.createElement('ul');
    list.className = 'article-list';

    filtered.forEach((article, idx) => {
      const item = document.createElement('li');
      item.className = 'article-item';
      if (article.id === state.selectedArticleId) {
        item.classList.add('is-selected');
      }

      const draftBtn = document.createElement('button');
      draftBtn.type = 'button';
      draftBtn.className = 'article-draft-btn';
      draftBtn.setAttribute('aria-label', `Draft question about ${article.title}`);

      const meta = document.createElement('span');
      meta.className = 'article-meta';

      const num = document.createElement('span');
      num.className = 'article-num';
      num.textContent = formatIndex(idx);

      const cue = document.createElement('span');
      cue.className = 'article-cue';
      cue.textContent = 'Draft in box';

      meta.append(num, cue);

      const titleSpan = document.createElement('span');
      titleSpan.className = 'article-title';
      titleSpan.textContent = article.title;

      const summarySpan = document.createElement('span');
      summarySpan.className = 'article-summary';
      summarySpan.textContent = article.summary;

      draftBtn.append(meta, titleSpan, summarySpan);
      draftBtn.addEventListener('click', () => {
        draftArticleQuestion(article);
      });

      const actions = document.createElement('div');
      actions.className = 'article-actions';

      const hint = document.createElement('span');
      hint.className = 'article-action-hint';
      hint.textContent = 'Click title to draft';

      const askBtn = document.createElement('button');
      askBtn.type = 'button';
      askBtn.className = 'article-ask-btn';
      askBtn.textContent = 'Ask →';
      askBtn.disabled = state.isSending;
      askBtn.setAttribute('aria-label', `Ask immediately about ${article.title}`);
      askBtn.addEventListener('click', () => {
        if (state.isSending) return;
        state.selectedArticleId = article.id;
        renderKnowledgeList();
        closeDrawer(false);
        hideDraftHint();
        sendMessage(buildArticleQuestion(article));
      });

      actions.append(hint, askBtn);
      item.append(draftBtn, actions);
      list.appendChild(item);
    });

    el.knowledgeBody.appendChild(list);
  }

  function draftArticleQuestion(article) {
    state.selectedArticleId = article.id;
    renderKnowledgeList();
    closeDrawer(false);

    const drafted = buildArticleQuestion(article);
    el.chatInput.value = drafted;
    autoResizeTextarea();
    updateComposerState();

    el.draftHintText.textContent = `Drafted from "${article.title}" — press Enter to send or edit below.`;
    el.draftHint.hidden = false;

    el.chatInput.focus();
    el.chatInput.setSelectionRange(drafted.length, drafted.length);
    announce(`Drafted question about ${article.title} in message box.`);
  }

  function hideDraftHint() {
    el.draftHint.hidden = true;
    el.draftHintText.textContent = '';
  }

  /* ========================================================================
     Composer Helpers
     ======================================================================== */

  function autoResizeTextarea() {
    el.chatInput.style.height = 'auto';
    const maxPx = 168;
    const nextHeight = Math.min(el.chatInput.scrollHeight, maxPx);
    el.chatInput.style.height = `${nextHeight}px`;
  }

  function updateComposerState() {
    const raw = el.chatInput.value;
    const trimmed = raw.trim();
    const length = raw.length;

    el.charCount.textContent = `${length.toLocaleString()} / ${MAX_MESSAGE_LENGTH.toLocaleString()}`;
    el.charCount.classList.toggle('is-warning', length >= 1800 && length <= MAX_MESSAGE_LENGTH);
    el.charCount.classList.toggle('is-over', length > MAX_MESSAGE_LENGTH);

    const canSend = !state.isSending && trimmed.length >= 1 && trimmed.length <= MAX_MESSAGE_LENGTH;
    el.sendButton.disabled = !canSend;
  }

  function setSendingState(sending) {
    state.isSending = sending;
    el.chatForm.classList.toggle('is-sending', sending);
    el.chatInput.disabled = sending;
    el.sendButton.setAttribute('aria-busy', sending ? 'true' : 'false');
    el.sendButtonLabel.textContent = sending ? 'Sending…' : 'Send';
    updateComposerState();

    // Disable starter prompts & sidebar direct Ask buttons while sending
    document.querySelectorAll('.starter-card, .article-ask-btn').forEach((btn) => {
      btn.disabled = sending;
    });
  }

  function showChatError(message, { allowRetry = false } = {}) {
    el.chatErrorText.textContent = message;
    el.chatErrorRetry.hidden = !allowRetry;
    el.chatError.hidden = false;
    announce(`Error: ${message}`);
  }

  function hideChatError() {
    el.chatError.hidden = true;
    el.chatErrorText.textContent = '';
    el.chatErrorRetry.hidden = true;
  }

  /* ========================================================================
     Safe Message & Citation Rendering
     ======================================================================== */

  function renderFormattedAnswer(container, rawText) {
    const text = String(rawText || '').replace(/\r\n/g, '\n').trim();
    if (!text) {
      const p = document.createElement('p');
      p.textContent = 'No answer text was returned.';
      container.appendChild(p);
      return;
    }

    const blocks = text.split(/\n{2,}/);
    blocks.forEach((block) => {
      const lines = block.split('\n').map((line) => line.trimEnd());
      const isBulletList = lines.length > 0 && lines.every((line) => /^[-*•]\s+/.test(line.trim()));

      if (isBulletList) {
        const ul = document.createElement('ul');
        lines.forEach((line) => {
          const li = document.createElement('li');
          li.textContent = line.trim().replace(/^[-*•]\s+/, '');
          ul.appendChild(li);
        });
        container.appendChild(ul);
        return;
      }

      const p = document.createElement('p');
      lines.forEach((line, index) => {
        if (index > 0) {
          p.appendChild(document.createElement('br'));
        }
        p.appendChild(document.createTextNode(line));
      });
      container.appendChild(p);
    });
  }

  function createUserMessageElement(text) {
    const wrapper = document.createElement('article');
    wrapper.className = 'message message--user';

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.textContent = `You · ${formatTime()}`;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = text;

    wrapper.append(meta, bubble);
    return wrapper;
  }

  function createPendingAssistantElement() {
    const wrapper = document.createElement('article');
    wrapper.className = 'message message--assistant';
    wrapper.setAttribute('aria-label', 'Assistant is generating a response');

    const card = document.createElement('div');
    card.className = 'assistant-card';

    const header = document.createElement('div');
    header.className = 'assistant-header';

    const identity = document.createElement('div');
    identity.className = 'assistant-identity';

    const mark = document.createElement('span');
    mark.className = 'assistant-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = 'L';

    const name = document.createElement('span');
    name.className = 'assistant-name';
    name.textContent = 'LumenDesk Assistant';

    identity.append(mark, name);
    header.appendChild(identity);

    const body = document.createElement('div');
    body.className = 'pending-body';

    const dots = document.createElement('span');
    dots.className = 'thinking-dots';
    dots.setAttribute('aria-hidden', 'true');
    dots.append(document.createElement('span'), document.createElement('span'), document.createElement('span'));

    const statusText = document.createElement('span');
    statusText.textContent = 'Searching studio handbook…';

    body.append(dots, statusText);
    card.append(header, body);
    wrapper.appendChild(card);
    return wrapper;
  }

  function createAssistantMessageElement(data) {
    const wrapper = document.createElement('article');
    wrapper.className = 'message message--assistant';

    const card = document.createElement('div');
    card.className = 'assistant-card';

    // Header
    const header = document.createElement('div');
    header.className = 'assistant-header';

    const identity = document.createElement('div');
    identity.className = 'assistant-identity';

    const mark = document.createElement('span');
    mark.className = 'assistant-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = 'L';

    const name = document.createElement('span');
    name.className = 'assistant-name';
    name.textContent = 'LumenDesk Assistant';

    identity.append(mark, name);

    const right = document.createElement('div');
    right.className = 'assistant-header-right';

    if (data.provider) {
      const pInfo = providerDisplay(data.provider);
      const chip = document.createElement('span');
      chip.className = `provider-chip ${pInfo.chipClass}`;
      chip.textContent = pInfo.label;
      right.appendChild(chip);
    }

    const time = document.createElement('span');
    time.className = 'message-time';
    time.textContent = formatTime();
    right.appendChild(time);

    header.append(identity, right);

    // Answer Body
    const body = document.createElement('div');
    body.className = 'assistant-body';
    renderFormattedAnswer(body, data.answer);

    card.append(header, body);

    // Sources Section
    const sources = Array.isArray(data.sources) ? data.sources : [];
    if (sources.length > 0) {
      const sourcesBox = document.createElement('section');
      sourcesBox.className = 'sources-section';
      sourcesBox.setAttribute('aria-label', 'Referenced documentation');

      const heading = document.createElement('h3');
      heading.className = 'sources-heading';
      const headingLabel = document.createElement('span');
      headingLabel.textContent = 'Referenced documentation';
      const headingCount = document.createElement('span');
      headingCount.textContent = sources.length === 1 ? '1 excerpt' : `${sources.length} excerpts`;
      heading.append(headingLabel, headingCount);

      const list = document.createElement('ul');
      list.className = 'sources-list';

      sources.forEach((source, index) => {
        const li = document.createElement('li');
        li.className = 'source-item';

        const head = document.createElement('div');
        head.className = 'source-head';

        const titleWrap = document.createElement('div');
        titleWrap.className = 'source-title-wrap';

        const idxEl = document.createElement('span');
        idxEl.className = 'source-index';
        idxEl.textContent = formatIndex(index);

        const titleEl = document.createElement('span');
        titleEl.className = 'source-title';
        titleEl.textContent = source.title || source.id || 'Handbook article';

        titleWrap.append(idxEl, titleEl);
        head.appendChild(titleWrap);

        if (typeof source.score === 'number' && Number.isFinite(source.score) && source.score > 0) {
          const scoreEl = document.createElement('span');
          scoreEl.className = 'source-score';
          scoreEl.textContent = `relevance ${source.score.toFixed(2)}`;
          head.appendChild(scoreEl);
        }

        const excerpt = document.createElement('blockquote');
        excerpt.className = 'source-excerpt';
        excerpt.textContent = source.excerpt || '';

        li.append(head, excerpt);
        list.appendChild(li);
      });

      sourcesBox.append(heading, list);
      card.appendChild(sourcesBox);
    } else {
      const emptySources = document.createElement('div');
      emptySources.className = 'sources-empty';
      emptySources.textContent = 'No matching handbook excerpts were cited for this response.';
      card.appendChild(emptySources);
    }

    wrapper.appendChild(card);
    return wrapper;
  }

  /* ========================================================================
     Chat Request Flow
     ======================================================================== */

  function mapErrorMessage(status, code) {
    if (status === 413 || code === 'payload_too_large') {
      return {
        text: 'Your message exceeds the 32 KiB request limit. Please shorten it and try again.',
        allowRetry: false,
      };
    }

    if (status === 400) {
      if (code === 'invalid_message') {
        return {
          text: 'Please enter a message between 1 and 2,000 characters.',
          allowRetry: false,
        };
      }
      if (code === 'invalid_session_id') {
        state.sessionId = null;
        updateSessionIndicator();
        return {
          text: 'The previous session ID was rejected. Your session has been reset — click Retry to send again.',
          allowRetry: true,
        };
      }
      return {
        text: 'The request could not be validated by the server (400). Please check your input and try again.',
        allowRetry: false,
      };
    }

    if (status === 502 || code === 'upstream_unavailable') {
      return {
        text: 'The live model provider is temporarily unavailable (502). Please retry in a moment.',
        allowRetry: true,
      };
    }

    return {
      text: `The help service returned an unexpected error (HTTP ${status}). Please try again.`,
      allowRetry: true,
    };
  }

  async function sendMessage(rawMessage) {
    if (state.isSending) return;

    const trimmed = String(rawMessage || '').trim();
    if (!trimmed) {
      showChatError('Please enter a question before sending.');
      el.chatInput.focus();
      return;
    }

    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      showChatError(`Questions must be ${MAX_MESSAGE_LENGTH.toLocaleString()} characters or fewer.`);
      el.chatInput.focus();
      return;
    }

    hideChatError();
    hideDraftHint();

    // Reveal conversation list if this is the first turn
    const wasEmpty = el.messagesList.hidden;
    el.emptyState.hidden = true;
    el.messagesList.hidden = false;

    const userMsgEl = createUserMessageElement(trimmed);
    const pendingEl = createPendingAssistantElement();
    el.messagesList.append(userMsgEl, pendingEl);
    scrollThreadToBottom();

    // Clear composer right away for responsive feel
    el.chatInput.value = '';
    autoResizeTextarea();
    setSendingState(true);
    announce('Sending question to LumenDesk Help…');

    const payload = { message: trimmed };
    if (state.sessionId) {
      payload.session_id = state.sessionId;
    }

    try {
      const response = await fetch(API.chat, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      let data = null;
      try {
        data = await response.json();
      } catch (_parseErr) {
        data = null;
      }

      if (!response.ok) {
        const errorCode = data && typeof data.error === 'string' ? data.error : '';
        const mapped = mapErrorMessage(response.status, errorCode);
        throw Object.assign(new Error(mapped.text), { allowRetry: mapped.allowRetry });
      }

      if (!data || typeof data.answer !== 'string') {
        throw Object.assign(new Error('Received an unexpected response from /api/chat.'), { allowRetry: true });
      }

      if (typeof data.session_id === 'string' && data.session_id.trim()) {
        state.sessionId = data.session_id.trim();
      }

      if (typeof data.provider === 'string' && data.provider) {
        setProviderBadge(data.provider);
        el.healthAlert.hidden = true;
      }

      state.turnCount += 1;
      state.lastFailedMessage = null;
      updateSessionIndicator();
      el.newThreadBtn.disabled = false;

      const assistantEl = createAssistantMessageElement(data);
      pendingEl.replaceWith(assistantEl);
      scrollThreadToBottom();
      announce('Answer received from LumenDesk Assistant.');
    } catch (error) {
      // Remove optimistic bubbles since the backend did not record the turn
      pendingEl.remove();
      userMsgEl.remove();

      if (wasEmpty && el.messagesList.children.length === 0) {
        el.emptyState.hidden = false;
        el.messagesList.hidden = true;
      }

      state.lastFailedMessage = trimmed;
      if (!el.chatInput.value.trim()) {
        el.chatInput.value = trimmed;
        autoResizeTextarea();
      }

      const isNetworkError = error instanceof TypeError;
      const message = isNetworkError
        ? 'Network error — could not reach /api/chat. Check that the local server is running and retry.'
        : error.message || 'Something went wrong while sending your question.';

      showChatError(message, { allowRetry: isNetworkError || Boolean(error.allowRetry) });
    } finally {
      setSendingState(false);
      el.chatInput.focus();
    }
  }

  function resetThread() {
    if (state.isSending) return;

    state.sessionId = null;
    state.turnCount = 0;
    state.lastFailedMessage = null;
    state.selectedArticleId = null;

    el.messagesList.textContent = '';
    el.messagesList.hidden = true;
    el.emptyState.hidden = false;
    el.newThreadBtn.disabled = true;

    hideChatError();
    hideDraftHint();
    updateSessionIndicator();
    renderKnowledgeList();

    el.chatInput.focus();
    announce('Started a new conversation thread.');
  }

  /* ========================================================================
     Mobile Handbook Drawer
     ======================================================================== */

  function openDrawer() {
    state.drawerOpen = true;
    el.sidebar.classList.add('is-open');
    el.drawerBackdrop.hidden = false;
    requestAnimationFrame(() => {
      el.drawerBackdrop.classList.add('is-visible');
    });
    el.handbookToggle.setAttribute('aria-expanded', 'true');
    el.knowledgeFilter.focus();
  }

  function closeDrawer(restoreFocus = true) {
    if (!state.drawerOpen) return;
    state.drawerOpen = false;
    el.sidebar.classList.remove('is-open');
    el.drawerBackdrop.classList.remove('is-visible');
    el.handbookToggle.setAttribute('aria-expanded', 'false');

    setTimeout(() => {
      if (!state.drawerOpen) {
        el.drawerBackdrop.hidden = true;
      }
    }, 260);

    if (restoreFocus) {
      el.handbookToggle.focus();
    }
  }

  /* ========================================================================
     Event Wiring
     ======================================================================== */

  function bindEvents() {
    // Composer submit
    el.chatForm.addEventListener('submit', (event) => {
      event.preventDefault();
      sendMessage(el.chatInput.value);
    });

    // Enter to send, Shift+Enter for newline (IME-safe)
    el.chatInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.isComposing || event.keyCode === 229) return;

      event.preventDefault();
      if (!state.isSending && el.chatInput.value.trim().length > 0) {
        sendMessage(el.chatInput.value);
      }
    });

    el.chatInput.addEventListener('input', () => {
      autoResizeTextarea();
      updateComposerState();
      if (!el.chatInput.value.trim()) {
        hideDraftHint();
      }
    });

    // Starter prompt cards
    document.querySelectorAll('.starter-card').forEach((card) => {
      card.addEventListener('click', () => {
        const prompt = card.getAttribute('data-prompt');
        if (prompt && !state.isSending) {
          sendMessage(prompt);
        }
      });
    });

    // Sidebar filter
    el.knowledgeFilter.addEventListener('input', (event) => {
      state.filterQuery = event.target.value;
      renderKnowledgeList();
    });

    // Draft hint clear
    el.draftHintClear.addEventListener('click', () => {
      el.chatInput.value = '';
      state.selectedArticleId = null;
      autoResizeTextarea();
      updateComposerState();
      hideDraftHint();
      renderKnowledgeList();
      el.chatInput.focus();
    });

    // Error actions
    el.chatErrorRetry.addEventListener('click', () => {
      const candidate = state.lastFailedMessage || el.chatInput.value;
      if (candidate && candidate.trim()) {
        sendMessage(candidate);
      }
    });

    el.chatErrorDismiss.addEventListener('click', () => {
      hideChatError();
      el.chatInput.focus();
    });

    // Health retry
    el.healthRetryBtn.addEventListener('click', () => {
      fetchHealth();
    });

    // New thread
    el.newThreadBtn.addEventListener('click', () => {
      resetThread();
    });

    // Mobile drawer controls
    el.handbookToggle.addEventListener('click', () => {
      if (state.drawerOpen) {
        closeDrawer(true);
      } else {
        openDrawer();
      }
    });

    el.handbookClose.addEventListener('click', () => {
      closeDrawer(true);
    });

    el.drawerBackdrop.addEventListener('click', () => {
      closeDrawer(true);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.drawerOpen) {
        closeDrawer(true);
      }
    });
  }

  /* ========================================================================
     Bootstrap
     ======================================================================== */

  function init() {
    bindEvents();
    autoResizeTextarea();
    updateComposerState();
    updateSessionIndicator();

    // Load health and knowledge base concurrently on startup
    fetchHealth();
    fetchKnowledge();
  }

  init();
})();
