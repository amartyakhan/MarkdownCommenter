// @ts-nocheck
(function () {
  'use strict';

  const vscode = acquireVsCodeApi();

  const contentDiv = document.getElementById('preview-content');
  const addBtn = document.getElementById('add-comment-btn');
  const commentForm = document.getElementById('comment-form');
  const commentFormHeader = document.getElementById('comment-form-header');
  const commentInput = document.getElementById('comment-input');
  const saveBtn = document.getElementById('comment-save');
  const cancelBtn = document.getElementById('comment-cancel');
  const deleteBtn = document.getElementById('comment-delete');

  let pendingAnchor = '';
  let pendingLine = 0;
  let currentEditId = null;
  let closeTimer = null;

  function cancelClose() {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  }

  function scheduleClose() {
    cancelClose();
    closeTimer = setTimeout(() => {
      if (!commentForm.contains(document.activeElement)) {
        commentForm.classList.add('hidden');
        currentEditId = null;
      }
    }, 250);
  }

  commentForm.addEventListener('mouseenter', cancelClose);
  commentForm.addEventListener('mouseleave', scheduleClose);

  // ── Marked configuration ───────────────────────────────────────────────

  // token.loc is not available in marked v17 UMD — compute line numbers from
  // token.raw instead, by tagging each top-level token with _mcLine before parsing.

  marked.use({
    gfm: true,
    breaks: false,
    renderer: {
      paragraph(token) {
        const attr = token._mcLine ? ` data-source-line="${token._mcLine}"` : '';
        return `<p${attr}>${this.parser.parseInline(token.tokens)}</p>\n`;
      },
      heading(token) {
        const attr = token._mcLine ? ` data-source-line="${token._mcLine}"` : '';
        const text = this.parser.parseInline(token.tokens);
        return `<h${token.depth}${attr}>${text}</h${token.depth}>\n`;
      },
      blockquote(token) {
        const attr = token._mcLine ? ` data-source-line="${token._mcLine}"` : '';
        return `<blockquote${attr}>\n${this.parser.parse(token.tokens)}</blockquote>\n`;
      },
      list(token) {
        const attr = token._mcLine ? ` data-source-line="${token._mcLine}"` : '';
        const tag = token.ordered ? 'ol' : 'ul';
        const items = token.items
          .map((item) => `<li>${this.parser.parse(item.tokens)}</li>\n`)
          .join('');
        return `<${tag}${attr}>\n${items}</${tag}>\n`;
      },
      code(token) {
        const attr = token._mcLine ? ` data-source-line="${token._mcLine}"` : '';
        const escaped = token.text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        return `<pre${attr}><code>${escaped}</code></pre>\n`;
      },
    },
  });

  // ── Comment post-processing ────────────────────────────────────────────

  function escapeHtmlAttr(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function applyComments(html, comments) {
    let result = html;
    for (const c of comments) {
      const commentAttr = escapeHtmlAttr(c.comment);
      const idAttr = escapeHtmlAttr(c.id);
      if (c.anchor && c.anchor.trim() !== '') {
        // Wrap the first occurrence of anchor text in a highlight span
        const escapedAnchor = escapeRegex(c.anchor);
        result = result.replace(
          new RegExp(`(${escapedAnchor})`),
          `<span class="mc-highlight" data-id="${idAttr}" data-comment="${commentAttr}">$1</span>`
        );
      } else if (c.line) {
        // Inject a marker icon inside the block that starts at this source line
        result = result.replace(
          new RegExp(`(data-source-line="${c.line}"[^>]*>)`),
          `$1<span class="mc-line-marker" data-id="${idAttr}" data-comment="${commentAttr}" title="${commentAttr}">&#x1F4AC;</span>`
        );
      }
    }
    return result;
  }

  // ── Line number tagging ────────────────────────────────────────────────

  function parseWithLineNumbers(markdown) {
    const tokens = marked.lexer(markdown);
    let line = 1;
    for (const token of tokens) {
      token._mcLine = line;
      if (token.raw) {
        line += (token.raw.match(/\n/g) || []).length;
      }
    }
    return marked.parser(tokens);
  }

  // ── Message handler ────────────────────────────────────────────────────

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'update') {
      try {
        const rawHtml = parseWithLineNumbers(msg.markdown);
        const annotated = applyComments(rawHtml, msg.comments);
        contentDiv.innerHTML = annotated;
        attachTooltipListeners();
        attachClickListeners();
        if (toggleInput.checked) {
          showAllPinnedPopups();
        }
      } catch (err) {
        contentDiv.innerHTML = '<pre class="mc-error">Render error: ' + escapeHtmlAttr(String(err)) + '</pre>';
      }
    } else if (msg.type === 'error') {
      contentDiv.innerHTML = '<pre class="mc-error">' + escapeHtmlAttr(msg.message) + '</pre>';
    }
  });

  // ── Hover popover on existing comments ────────────────────────────────

  function attachTooltipListeners() {
    document.querySelectorAll('.mc-highlight, .mc-line-marker').forEach((el) => {
      el.addEventListener('mouseenter', () => {
        cancelClose();
        const id = el.getAttribute('data-id') || '';
        const text = el.getAttribute('data-comment') || '';
        const rect = el.getBoundingClientRect();
        showViewForm(id, text, rect.bottom + window.scrollY + 8);
      });
      el.addEventListener('mouseleave', scheduleClose);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        cancelClose();
      });
    });
  }

  // ── Line click → add comment ───────────────────────────────────────────

  function attachClickListeners() {
    document.querySelectorAll('[data-source-line]').forEach((el) => {
      el.addEventListener('click', (e) => {
        // Skip if user is just finishing a text selection
        if (window.getSelection && window.getSelection().toString().trim()) return;
        const line = parseInt(el.getAttribute('data-source-line') || '0', 10);
        pendingAnchor = '';
        pendingLine = line;
        showCommentForm(e.clientY + window.scrollY);
        e.stopPropagation();
      });
    });
  }

  // ── Text selection → floating button ──────────────────────────────────

  document.addEventListener('mouseup', (e) => {
    // Don't trigger if clicking our own UI
    if (
      addBtn.contains(e.target) ||
      commentForm.contains(e.target)
    ) return;

    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : '';

    if (!text) {
      addBtn.classList.add('hidden');
      return;
    }

    // Find the nearest block element with data-source-line
    let node = selection.anchorNode;
    let block = null;
    while (node && node !== document.body) {
      if (node.nodeType === 1 && node.dataset && node.dataset.sourceLine) {
        block = node;
        break;
      }
      node = node.parentNode;
    }

    pendingAnchor = text;
    pendingLine = block ? parseInt(block.dataset.sourceLine, 10) : 0;

    // Position button below selection
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    addBtn.style.top = `${rect.bottom + window.scrollY + 6}px`;
    addBtn.style.left = `${rect.left + window.scrollX}px`;
    addBtn.classList.remove('hidden');
  });

  addBtn.addEventListener('click', () => {
    addBtn.classList.add('hidden');
    showCommentForm(parseInt(addBtn.style.top, 10) + 30);
  });

  // ── Comment form ───────────────────────────────────────────────────────

  function showCommentForm(scrollY) {
    currentEditId = null;
    commentFormHeader.textContent = 'Add Comment';
    commentInput.value = '';
    deleteBtn.classList.add('hidden');
    commentForm.classList.remove('hidden');
    commentForm.style.top = `${scrollY}px`;
    commentForm.style.left = '50%';
    commentForm.style.transform = 'translateX(-50%)';
    commentInput.focus();
  }

  function showViewForm(id, text, scrollY) {
    currentEditId = id;
    commentFormHeader.textContent = 'Edit Comment';
    commentInput.value = text;
    deleteBtn.classList.remove('hidden');
    commentForm.classList.remove('hidden');
    commentForm.style.top = `${scrollY}px`;
    commentForm.style.left = '50%';
    commentForm.style.transform = 'translateX(-50%)';
    commentInput.focus();
  }

  saveBtn.addEventListener('click', () => {
    const text = commentInput.value.trim();
    if (!text) return;
    if (currentEditId) {
      vscode.postMessage({
        type: 'editComment',
        id: currentEditId,
        comment: text,
      });
    } else {
      vscode.postMessage({
        type: 'addComment',
        anchor: pendingAnchor,
        comment: text,
        line: pendingLine,
      });
    }
    commentForm.classList.add('hidden');
    addBtn.classList.add('hidden');
    currentEditId = null;
    pendingAnchor = '';
    pendingLine = 0;
  });

  deleteBtn.addEventListener('click', () => {
    if (currentEditId) {
      vscode.postMessage({ type: 'deleteComment', id: currentEditId });
    }
    commentForm.classList.add('hidden');
    currentEditId = null;
  });

  cancelBtn.addEventListener('click', () => {
    commentForm.classList.add('hidden');
    addBtn.classList.add('hidden');
    currentEditId = null;
    pendingAnchor = '';
    pendingLine = 0;
  });

  // Close form / button when clicking outside
  document.addEventListener('mousedown', (e) => {
    if (
      !commentForm.contains(e.target) &&
      !addBtn.contains(e.target)
    ) {
      commentForm.classList.add('hidden');
      // Keep addBtn visible in case user wants to click it
    }
  });

  // Keyboard shortcut: Enter to save (Shift+Enter for newline), Escape to cancel
  commentInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveBtn.click();
    } else if (e.key === 'Escape') {
      cancelBtn.click();
    }
  });

  // ── Comments toggle (pin all popups open) ─────────────────────────────

  const toggleInput = document.getElementById('comments-toggle-input');

  function showAllPinnedPopups() {
    hideAllPinnedPopups();
    document.querySelectorAll('.mc-highlight, .mc-line-marker').forEach((el) => {
      const id = el.getAttribute('data-id') || '';
      const text = el.getAttribute('data-comment') || '';
      const rect = el.getBoundingClientRect();

      const popup = document.createElement('div');
      popup.className = 'mc-pinned-popup';
      popup.setAttribute('data-for', id);
      popup.innerHTML =
        '<div class="mc-pinned-header">Edit Comment</div>' +
        '<textarea class="mc-pinned-input" rows="3">' + escapeHtml(text) + '</textarea>' +
        '<div class="comment-form-actions">' +
          '<button class="mc-pinned-delete">Delete</button>' +
          '<div class="comment-form-actions-right">' +
            '<button class="mc-pinned-save">Save</button>' +
            '<button class="mc-pinned-cancel">Cancel</button>' +
          '</div>' +
        '</div>';
      popup.style.top = (rect.bottom + window.scrollY + 6) + 'px';
      popup.style.left = (rect.left + window.scrollX) + 'px';

      const textarea = popup.querySelector('.mc-pinned-input');
      popup.querySelector('.mc-pinned-save').addEventListener('click', (e) => {
        e.stopPropagation();
        const newText = textarea.value.trim();
        if (!newText) return;
        vscode.postMessage({ type: 'editComment', id, comment: newText });
      });
      popup.querySelector('.mc-pinned-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'deleteComment', id });
      });
      popup.querySelector('.mc-pinned-cancel').addEventListener('click', (e) => {
        e.stopPropagation();
        popup.remove();
      });

      document.body.appendChild(popup);
    });
  }

  function hideAllPinnedPopups() {
    document.querySelectorAll('.mc-pinned-popup').forEach((el) => el.remove());
  }

  toggleInput.addEventListener('change', () => {
    if (toggleInput.checked) {
      showAllPinnedPopups();
    } else {
      hideAllPinnedPopups();
    }
  });

  // ── Signal ready ───────────────────────────────────────────────────────
  // In VS Code webviews the 'load' event may already have fired by the time
  // this script executes, so also fire immediately as a fallback.

  function signalReady() {
    vscode.postMessage({ type: 'ready' });
  }

  if (document.readyState === 'complete') {
    signalReady();
  } else {
    window.addEventListener('load', signalReady);
  }
})();
