// @ts-nocheck
(function () {
  'use strict';

  var vscode = acquireVsCodeApi();

  var contentDiv = document.getElementById('preview-content');
  var addBtn = document.getElementById('add-comment-btn');
  var commentForm = document.getElementById('comment-form');
  var commentInput = document.getElementById('comment-input');
  var saveBtn = document.getElementById('comment-save');
  var cancelBtn = document.getElementById('comment-cancel');
  var sidebar = document.getElementById('mc-sidebar');
  var toggleInput = document.getElementById('comments-toggle-input');
  var settingsBtn = document.getElementById('mc-settings-btn');
  var settingsDropdown = document.getElementById('mc-settings-dropdown');
  var darkModeInput = document.getElementById('dark-mode-input');

  var editModeInput = document.getElementById('edit-mode-input');
  var toolbar = document.getElementById('mc-edit-toolbar');
  var exitEditBtn = document.getElementById('mc-exit-edit');

  var pendingAnchor = '';
  var pendingLine = 0;
  var hoverPopup = null;
  var closeTimer = null;

  // ── Edit mode state ──────────────────────────────────────────────────
  var currentMarkdown = '';
  var editModeActive = false;
  var pendingUpdateData = null;
  var imagePathMap = {};

  function cancelClose() {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  }

  function scheduleClose() {
    cancelClose();
    closeTimer = setTimeout(function () {
      if (hoverPopup && !hoverPopup.contains(document.activeElement)) {
        hoverPopup.classList.add('hidden');
        resetPopupToReadMode(hoverPopup);
        removeConnectors();
        hoverPopup = null;
      }
    }, 250);
  }

  function resetPopupToReadMode(popup) {
    var readBody = popup.querySelector('.mc-pinned-read-body');
    var editBody = popup.querySelector('.mc-pinned-edit-body');
    if (readBody) readBody.classList.remove('hidden');
    if (editBody) editBody.classList.add('hidden');
  }

  // ── Marked configuration ───────────────────────────────────────────────

  marked.use({
    gfm: true,
    breaks: false,
    renderer: {
      paragraph: function (token) {
        var attr = token._mcLine ? ' data-source-line="' + token._mcLine + '"' : '';
        attr += token._mcLineEnd ? ' data-source-line-end="' + token._mcLineEnd + '"' : '';
        return '<p' + attr + '>' + this.parser.parseInline(token.tokens) + '</p>\n';
      },
      heading: function (token) {
        var attr = token._mcLine ? ' data-source-line="' + token._mcLine + '"' : '';
        attr += token._mcLineEnd ? ' data-source-line-end="' + token._mcLineEnd + '"' : '';
        var text = this.parser.parseInline(token.tokens);
        return '<h' + token.depth + attr + '>' + text + '</h' + token.depth + '>\n';
      },
      blockquote: function (token) {
        var attr = token._mcLine ? ' data-source-line="' + token._mcLine + '"' : '';
        attr += token._mcLineEnd ? ' data-source-line-end="' + token._mcLineEnd + '"' : '';
        return '<blockquote' + attr + '>\n' + this.parser.parse(token.tokens) + '</blockquote>\n';
      },
      list: function (token) {
        var attr = token._mcLine ? ' data-source-line="' + token._mcLine + '"' : '';
        attr += token._mcLineEnd ? ' data-source-line-end="' + token._mcLineEnd + '"' : '';
        var tag = token.ordered ? 'ol' : 'ul';
        var self = this;
        var items = token.items
          .map(function (item) { return '<li>' + self.parser.parse(item.tokens) + '</li>\n'; })
          .join('');
        return '<' + tag + attr + '>\n' + items + '</' + tag + '>\n';
      },
      code: function (token) {
        var attr = token._mcLine ? ' data-source-line="' + token._mcLine + '"' : '';
        attr += token._mcLineEnd ? ' data-source-line-end="' + token._mcLineEnd + '"' : '';
        var escaped = token.text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        return '<pre' + attr + '><code>' + escaped + '</code></pre>\n';
      },
      table: function (token) {
        var attr = token._mcLine ? ' data-source-line="' + token._mcLine + '"' : '';
        attr += token._mcLineEnd ? ' data-source-line-end="' + token._mcLineEnd + '"' : '';
        var headerCells = '';
        for (var j = 0; j < token.header.length; j++) {
          var hcell = token.header[j];
          var align = hcell.align ? ' align="' + hcell.align + '"' : '';
          headerCells += '<th' + align + '>' + this.parser.parseInline(hcell.tokens) + '</th>\n';
        }
        var bodyRows = '';
        for (var r = 0; r < token.rows.length; r++) {
          var row = token.rows[r];
          var rowCells = '';
          for (var j = 0; j < row.length; j++) {
            var align = row[j].align ? ' align="' + row[j].align + '"' : '';
            rowCells += '<td' + align + '>' + this.parser.parseInline(row[j].tokens) + '</td>\n';
          }
          bodyRows += '<tr>\n' + rowCells + '</tr>\n';
        }
        var tbody = bodyRows ? '<tbody>' + bodyRows + '</tbody>' : '';
        return '<table' + attr + '>\n<thead>\n<tr>\n' + headerCells + '</tr>\n</thead>\n' + tbody + '</table>\n';
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

  function applyLineMarkersToHtml(html, comments) {
    var result = html;
    for (var i = 0; i < comments.length; i++) {
      var c = comments[i];
      if (c.anchor && c.anchor.trim() !== '') continue;
      if (!c.line) continue;
      var commentAttr = escapeHtmlAttr(c.comment);
      var idAttr = escapeHtmlAttr(c.id);
      var markerSvg = '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2 2h12v8H6.5L3 13.5V10H2V2z"/></svg>';
      result = result.replace(
        new RegExp('(data-source-line="' + c.line + '"[^>]*>)'),
        '$1<span class="mc-line-marker" data-id="' + idAttr + '" data-comment="' + commentAttr + '" title="' + commentAttr + '">' + markerSvg + '</span>'
      );
    }
    return result;
  }

  // Wrap the anchor text in the DOM by walking text nodes. This handles anchors
  // that span inline markdown (code spans, bold, links, etc.) which the rendered
  // HTML splits across multiple elements.
  function wrapAnchorInDOM(anchor, id, comment) {
    if (!anchor || !anchor.trim()) return false;

    var walker = document.createTreeWalker(contentDiv, NodeFilter.SHOW_TEXT, null, false);
    var textNodes = [];
    var offsets = [];
    var fullText = '';
    var node;
    while ((node = walker.nextNode())) {
      var parent = node.parentNode;
      if (parent && parent.closest && parent.closest('.mc-line-marker, script, style')) continue;
      offsets.push(fullText.length);
      textNodes.push(node);
      fullText += node.nodeValue;
    }

    var idx = fullText.indexOf(anchor);
    if (idx < 0) return false;
    var end = idx + anchor.length;

    for (var i = 0; i < textNodes.length; i++) {
      var tn = textNodes[i];
      var tnStart = offsets[i];
      var tnEnd = tnStart + tn.nodeValue.length;

      var overlapStart = Math.max(tnStart, idx);
      var overlapEnd = Math.min(tnEnd, end);
      if (overlapStart >= overlapEnd) continue;

      var localStart = overlapStart - tnStart;
      var localEnd = overlapEnd - tnStart;

      var target = tn;
      if (localStart > 0) {
        target = target.splitText(localStart);
      }
      if (localEnd - localStart < target.nodeValue.length) {
        target.splitText(localEnd - localStart);
      }

      var span = document.createElement('span');
      span.className = 'mc-highlight';
      span.setAttribute('data-id', id);
      span.setAttribute('data-comment', comment);
      target.parentNode.insertBefore(span, target);
      span.appendChild(target);
    }

    return true;
  }

  function applyAnchorHighlights(comments) {
    for (var i = 0; i < comments.length; i++) {
      var c = comments[i];
      if (c.anchor && c.anchor.trim()) {
        wrapAnchorInDOM(c.anchor, c.id, c.comment);
      }
    }
  }

  // ── Line number tagging ────────────────────────────────────────────────

  function parseWithLineNumbers(markdown) {
    var tokens = marked.lexer(markdown);
    var line = 1;
    for (var i = 0; i < tokens.length; i++) {
      tokens[i]._mcLine = line;
      if (tokens[i].raw) {
        line += (tokens[i].raw.match(/\n/g) || []).length;
      }
    }
    // Compute _mcLineEnd for each token
    var totalLines = (markdown.match(/\n/g) || []).length + 1;
    for (var i = 0; i < tokens.length; i++) {
      if (i + 1 < tokens.length) {
        tokens[i]._mcLineEnd = tokens[i + 1]._mcLine - 1;
      } else {
        tokens[i]._mcLineEnd = totalLines;
      }
    }
    return marked.parser(tokens);
  }

  // ── Comment popup management ───────────────────────────────────────────

  function removeConnectors() {
    var old = document.getElementById('mc-connectors');
    if (old) old.remove();
  }

  function drawConnectorForPopup(popup, id) {
    var layout = document.getElementById('mc-layout');
    if (!layout) return;
    var marker = document.querySelector('.mc-highlight[data-id="' + id + '"], .mc-line-marker[data-id="' + id + '"]');
    if (!marker) return;

    removeConnectors();

    var layoutRect = layout.getBoundingClientRect();
    var markerRect = marker.getBoundingClientRect();
    var popupRect = popup.getBoundingClientRect();
    var svgNS = 'http://www.w3.org/2000/svg';

    var svg = document.createElementNS(svgNS, 'svg');
    svg.id = 'mc-connectors';
    svg.setAttribute('height', layout.offsetHeight);

    var line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', markerRect.right - layoutRect.left);
    line.setAttribute('y1', markerRect.top + markerRect.height / 2 - layoutRect.top);
    line.setAttribute('x2', popupRect.left - layoutRect.left);
    line.setAttribute('y2', popupRect.top + 14 - layoutRect.top);
    svg.appendChild(line);

    layout.appendChild(svg);
  }

  function clearPopups() {
    if (!sidebar) return;
    sidebar.querySelectorAll('.mc-pinned-popup').forEach(function (el) { el.remove(); });
    removeConnectors();
    hoverPopup = null;
  }

  function createCommentPopups() {
    clearPopups();
    if (!sidebar) return;

    var markers = [];
    document.querySelectorAll('.mc-highlight, .mc-line-marker').forEach(function (el) {
      var rect = el.getBoundingClientRect();
      markers.push({
        id: el.getAttribute('data-id') || '',
        text: el.getAttribute('data-comment') || '',
        docY: rect.top + window.scrollY
      });
    });
    markers.sort(function (a, b) { return a.docY - b.docY; });

    var sidebarDocTop = sidebar.getBoundingClientRect().top + window.scrollY;

    for (var i = 0; i < markers.length; i++) {
      var m = markers[i];
      var idealY = m.docY - sidebarDocTop;

      var popup = document.createElement('div');
      popup.className = 'mc-pinned-popup hidden';
      popup.setAttribute('data-for', m.id);
      popup.setAttribute('data-ideal-y', String(idealY));
      popup.innerHTML =
        '<div class="mc-pinned-header">Comment</div>' +
        '<div class="mc-pinned-read-body">' +
          '<div class="mc-pinned-text">' + escapeHtml(m.text) + '</div>' +
          '<div class="comment-form-actions">' +
            '<button class="mc-pinned-delete">Delete</button>' +
            '<div class="comment-form-actions-right">' +
              '<button class="mc-pinned-edit">Edit</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="mc-pinned-edit-body hidden">' +
          '<textarea class="mc-pinned-input" rows="3">' + escapeHtml(m.text) + '</textarea>' +
          '<div class="comment-form-actions">' +
            '<div class="comment-form-actions-right">' +
              '<button class="mc-pinned-save">Save</button>' +
              '<button class="mc-pinned-cancel">Cancel</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      popup.style.top = idealY + 'px';

      attachPopupHandlers(popup, m.id);
      sidebar.appendChild(popup);
    }

    if (toggleInput.checked) {
      showAllPopups();
    }
  }

  function attachPopupHandlers(popup, id) {
    var readBody = popup.querySelector('.mc-pinned-read-body');
    var editBody = popup.querySelector('.mc-pinned-edit-body');
    var textarea = popup.querySelector('.mc-pinned-input');

    popup.querySelector('.mc-pinned-edit').addEventListener('click', function (e) {
      e.stopPropagation();
      readBody.classList.add('hidden');
      editBody.classList.remove('hidden');
      textarea.focus();
    });
    popup.querySelector('.mc-pinned-save').addEventListener('click', function (e) {
      e.stopPropagation();
      var newText = textarea.value.trim();
      if (!newText) return;
      vscode.postMessage({ type: 'editComment', id: id, comment: newText });
    });
    popup.querySelector('.mc-pinned-delete').addEventListener('click', function (e) {
      e.stopPropagation();
      vscode.postMessage({ type: 'deleteComment', id: id });
    });
    popup.querySelector('.mc-pinned-cancel').addEventListener('click', function (e) {
      e.stopPropagation();
      editBody.classList.add('hidden');
      readBody.classList.remove('hidden');
    });

    // Hover: keep popup open while mouse is over it
    popup.addEventListener('mouseenter', cancelClose);
    popup.addEventListener('mouseleave', function () {
      if (!toggleInput.checked) {
        scheduleClose();
      }
    });

    // When focus leaves the popup (e.g. clicked outside while editing),
    // schedule close so it doesn't stay stuck open
    popup.addEventListener('focusout', function () {
      if (!toggleInput.checked) {
        scheduleClose();
      }
    });
  }

  function showPopupForId(id) {
    if (toggleInput.checked) return; // all already visible
    if (!sidebar) return;
    var popup = sidebar.querySelector('.mc-pinned-popup[data-for="' + id + '"]');
    if (!popup) return;

    if (hoverPopup && hoverPopup !== popup) {
      hoverPopup.classList.add('hidden');
      resetPopupToReadMode(hoverPopup);
    }

    popup.style.top = popup.getAttribute('data-ideal-y') + 'px';
    popup.classList.remove('hidden');
    hoverPopup = popup;

    // Draw connector line from marker to popup
    drawConnectorForPopup(popup, id);
  }

  function showAllPopups() {
    if (!sidebar) return;
    var layout = document.getElementById('mc-layout');
    if (!layout) return;
    var popups = sidebar.querySelectorAll('.mc-pinned-popup');

    removeConnectors();

    var nextAvailableY = 0;

    popups.forEach(function (popup) {
      var idealY = parseFloat(popup.getAttribute('data-ideal-y'));
      var actualY = Math.max(idealY, nextAvailableY);

      popup.style.top = actualY + 'px';
      popup.classList.remove('hidden');

      nextAvailableY = actualY + Math.max(popup.offsetHeight, 80) + 8;
    });

    // Draw SVG connector lines from each marker to its popup
    var layoutRect = layout.getBoundingClientRect();
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.id = 'mc-connectors';
    svg.setAttribute('height', layout.offsetHeight);

    popups.forEach(function (popup) {
      var id = popup.getAttribute('data-for');
      var marker = document.querySelector('.mc-highlight[data-id="' + id + '"], .mc-line-marker[data-id="' + id + '"]');
      if (!marker) return;

      var markerRect = marker.getBoundingClientRect();
      var popupRect = popup.getBoundingClientRect();

      // Start: right edge of marker, vertical center (relative to layout)
      var x1 = markerRect.right - layoutRect.left;
      var y1 = markerRect.top + markerRect.height / 2 - layoutRect.top;

      // End: left edge of popup, near top (relative to layout)
      var x2 = popupRect.left - layoutRect.left;
      var y2 = popupRect.top + 14 - layoutRect.top;

      var line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', x1);
      line.setAttribute('y1', y1);
      line.setAttribute('x2', x2);
      line.setAttribute('y2', y2);
      svg.appendChild(line);
    });

    layout.appendChild(svg);
    hoverPopup = null;
  }

  function hideAllPopups() {
    if (!sidebar) return;
    sidebar.querySelectorAll('.mc-pinned-popup').forEach(function (popup) {
      popup.classList.add('hidden');
      resetPopupToReadMode(popup);
    });
    removeConnectors();
    hoverPopup = null;
  }

  // ── Message handler ────────────────────────────────────────────────────

  function buildImagePathMap(rewrittenMd, rawMd) {
    var imgRegex = /!\[([^\]]*)\]\(([^)\s]+)/g;
    var rewrittenImages = [];
    var rawImages = [];
    var m;
    while ((m = imgRegex.exec(rewrittenMd)) !== null) {
      rewrittenImages.push(m[2]);
    }
    imgRegex.lastIndex = 0;
    while ((m = imgRegex.exec(rawMd)) !== null) {
      rawImages.push(m[2]);
    }
    imagePathMap = {};
    for (var i = 0; i < rewrittenImages.length && i < rawImages.length; i++) {
      if (rewrittenImages[i] !== rawImages[i]) {
        imagePathMap[rewrittenImages[i]] = rawImages[i];
      }
    }
  }

  function renderUpdate(msg) {
    try {
      currentMarkdown = msg.rawMarkdown || '';
      buildImagePathMap(msg.markdown, msg.rawMarkdown || '');
      var rawHtml = parseWithLineNumbers(msg.markdown);
      var withLineMarkers = applyLineMarkersToHtml(rawHtml, msg.comments);
      contentDiv.innerHTML = withLineMarkers;
      applyAnchorHighlights(msg.comments);
      attachTooltipListeners();
      attachClickListeners();
      createCommentPopups();
    } catch (err) {
      contentDiv.innerHTML = '<pre class="mc-error">Render error: ' + escapeHtmlAttr(String(err)) + '</pre>';
    }
  }

  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (msg.type === 'update') {
      // Defer re-render if user is mid-edit to avoid losing work
      if (editModeActive) {
        pendingUpdateData = msg;
        return;
      }
      renderUpdate(msg);
    } else if (msg.type === 'error') {
      contentDiv.innerHTML = '<pre class="mc-error">' + escapeHtmlAttr(msg.message) + '</pre>';
    }
  });

  // ── Hover on existing comments ─────────────────────────────────────────

  function attachTooltipListeners() {
    document.querySelectorAll('.mc-highlight, .mc-line-marker').forEach(function (el) {
      el.addEventListener('mouseenter', function () {
        cancelClose();
        var id = el.getAttribute('data-id') || '';
        showPopupForId(id);
      });
      el.addEventListener('mouseleave', function () {
        if (!toggleInput.checked) {
          scheduleClose();
        }
      });
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        cancelClose();
      });
    });
  }

  // ── Line click → add comment ───────────────────────────────────────────

  function attachClickListeners() {
    document.querySelectorAll('[data-source-line]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        // In edit mode, clicks are handled by contentEditable
        if (editModeActive) return;
        if (window.getSelection && window.getSelection().toString().trim()) return;
        var line = parseInt(el.getAttribute('data-source-line') || '0', 10);
        pendingAnchor = '';
        pendingLine = line;
        showCommentForm(e.clientY + window.scrollY);
        e.stopPropagation();
      });
    });
  }

  // ── Text selection → floating button ──────────────────────────────────

  document.addEventListener('mouseup', function (e) {
    if (addBtn.contains(e.target) || commentForm.contains(e.target)) return;
    // Don't show add-comment button when in edit mode
    if (editModeActive) return;

    var selection = window.getSelection();
    var text = selection ? selection.toString().trim() : '';

    if (!text) {
      addBtn.classList.add('hidden');
      return;
    }

    var node = selection.anchorNode;
    var block = null;
    while (node && node !== document.body) {
      if (node.nodeType === 1 && node.dataset && node.dataset.sourceLine) {
        block = node;
        break;
      }
      node = node.parentNode;
    }

    pendingAnchor = text;
    pendingLine = block ? parseInt(block.dataset.sourceLine, 10) : 0;

    var range = selection.getRangeAt(0);
    var rect = range.getBoundingClientRect();
    addBtn.style.top = (rect.bottom + window.scrollY + 6) + 'px';
    addBtn.style.left = (rect.left + window.scrollX) + 'px';
    addBtn.classList.remove('hidden');
  });

  addBtn.addEventListener('click', function () {
    addBtn.classList.add('hidden');
    showCommentForm(parseInt(addBtn.style.top, 10) + 30);
  });

  // ── New-comment form ───────────────────────────────────────────────────

  function getSidebarLeft() {
    if (sidebar) {
      return sidebar.getBoundingClientRect().left + window.scrollX;
    }
    return contentDiv.getBoundingClientRect().right + window.scrollX + 16;
  }

  function showCommentForm(scrollY) {
    commentInput.value = '';
    commentForm.classList.remove('hidden');
    commentForm.style.top = scrollY + 'px';
    commentForm.style.left = getSidebarLeft() + 'px';
    commentForm.style.transform = '';
    commentInput.focus();
  }

  saveBtn.addEventListener('click', function () {
    var text = commentInput.value.trim();
    if (!text) return;
    vscode.postMessage({
      type: 'addComment',
      anchor: pendingAnchor,
      comment: text,
      line: pendingLine,
    });
    commentForm.classList.add('hidden');
    addBtn.classList.add('hidden');
    pendingAnchor = '';
    pendingLine = 0;
  });

  cancelBtn.addEventListener('click', function () {
    commentForm.classList.add('hidden');
    addBtn.classList.add('hidden');
    pendingAnchor = '';
    pendingLine = 0;
  });

  document.addEventListener('mousedown', function (e) {
    if (!commentForm.contains(e.target) && !addBtn.contains(e.target)) {
      commentForm.classList.add('hidden');
    }
  });

  commentInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveBtn.click();
    } else if (e.key === 'Escape') {
      cancelBtn.click();
    }
  });

  // ── HTML → Markdown converter ───────────────────────────────────────────

  function htmlToMarkdown(node) {
    if (node.nodeType === 3) { // Text node
      return node.textContent || '';
    }
    if (node.nodeType !== 1) return '';

    var el = node;
    var tag = el.tagName.toLowerCase();

    // Skip MC line markers (SVG speech bubble icons)
    if (tag === 'span' && el.classList.contains('mc-line-marker')) return '';

    // Collect children markdown
    var childMd = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      childMd += htmlToMarkdown(el.childNodes[i]);
    }

    switch (tag) {
      case 'p':
      case 'div':
        return childMd.trim() + '\n\n';
      case 'h1': return '# ' + childMd.trim() + '\n\n';
      case 'h2': return '## ' + childMd.trim() + '\n\n';
      case 'h3': return '### ' + childMd.trim() + '\n\n';
      case 'h4': return '#### ' + childMd.trim() + '\n\n';
      case 'h5': return '##### ' + childMd.trim() + '\n\n';
      case 'h6': return '###### ' + childMd.trim() + '\n\n';
      case 'strong':
      case 'b':
        return '**' + childMd + '**';
      case 'em':
      case 'i':
        return '*' + childMd + '*';
      case 'code':
        // If inside a <pre>, handled by the pre case
        if (el.parentNode && el.parentNode.tagName && el.parentNode.tagName.toLowerCase() === 'pre') {
          return el.textContent || '';
        }
        return '`' + (el.textContent || '') + '`';
      case 'pre':
        var codeEl = el.querySelector('code');
        var codeText = codeEl ? (codeEl.textContent || '') : (el.textContent || '');
        return '```\n' + codeText + '\n```\n\n';
      case 'a':
        var href = el.getAttribute('href') || '';
        return '[' + childMd + '](' + href + ')';
      case 'img':
        var src = el.getAttribute('src') || '';
        // Map webview URIs back to original paths
        if (imagePathMap[src]) src = imagePathMap[src];
        var alt = el.getAttribute('alt') || '';
        return '![' + alt + '](' + src + ')';
      case 'ul':
        return convertListToMd(el, false);
      case 'ol':
        return convertListToMd(el, true);
      case 'li':
        return childMd.trim();
      case 'blockquote':
        var bqLines = childMd.trim().split('\n');
        return bqLines.map(function (l) {
          // Don't double-prefix lines already starting with >
          return '> ' + l;
        }).join('\n') + '\n\n';
      case 'hr':
        return '---\n\n';
      case 'br':
        return '\n';
      case 'table':
        return convertTableToMd(el);
      case 'span':
        // MC highlights and other spans — just return content
        return childMd;
      default:
        return childMd;
    }
  }

  function convertListToMd(listEl, ordered) {
    var result = [];
    var idx = 1;
    for (var i = 0; i < listEl.childNodes.length; i++) {
      var child = listEl.childNodes[i];
      if (child.nodeType !== 1 || child.tagName.toLowerCase() !== 'li') continue;
      var content = htmlToMarkdown(child).trim();
      var prefix = ordered ? (idx + '. ') : '- ';
      // Handle multi-line list items: indent continuation lines
      var lines = content.split('\n');
      var indented = lines.map(function (l, j) {
        return j === 0 ? prefix + l : '  ' + l;
      }).join('\n');
      result.push(indented);
      idx++;
    }
    return result.join('\n') + '\n\n';
  }

  function convertTableToMd(tableEl) {
    var rows = tableEl.querySelectorAll('tr');
    if (!rows.length) return '';
    var lines = [];
    for (var r = 0; r < rows.length; r++) {
      var cells = rows[r].querySelectorAll('th, td');
      var cols = [];
      for (var c = 0; c < cells.length; c++) {
        cols.push(htmlToMarkdown(cells[c]).trim());
      }
      lines.push('| ' + cols.join(' | ') + ' |');
      // Add separator after header row
      if (r === 0) {
        var sep = cols.map(function () { return '---'; });
        lines.push('| ' + sep.join(' | ') + ' |');
      }
    }
    return lines.join('\n') + '\n\n';
  }

  // ── WYSIWYG editing ───────────────────────────────────────────────────

  function enterDocumentEditMode() {
    if (editModeActive) return;
    editModeActive = true;

    // Remove MC comment markers from displayed HTML (visual clutter during editing)
    contentDiv.querySelectorAll('.mc-line-marker').forEach(function (el) { el.remove(); });

    contentDiv.setAttribute('contenteditable', 'true');
    contentDiv.classList.add('mc-edit-mode');
    if (toolbar) toolbar.classList.remove('hidden');

    // Sync settings toggle
    if (editModeInput) editModeInput.checked = true;

    // Focus at the click point (browser handles cursor placement in contentEditable)
    contentDiv.focus();
  }

  function exitDocumentEditMode(save) {
    if (!editModeActive) return;
    editModeActive = false;

    contentDiv.setAttribute('contenteditable', 'false');
    contentDiv.classList.remove('mc-edit-mode');
    if (toolbar) toolbar.classList.add('hidden');

    if (save) {
      // Convert current HTML back to markdown
      var newMarkdown = htmlToMarkdown(contentDiv).trim() + '\n';

      if (newMarkdown.trim() !== currentMarkdown.trim()) {
        vscode.postMessage({
          type: 'updateDocument',
          markdown: newMarkdown,
        });
      }
    }

    // Apply any deferred update
    if (pendingUpdateData) {
      var data = pendingUpdateData;
      pendingUpdateData = null;
      renderUpdate(data);
    }

    // Uncheck the toggle if it was on
    if (editModeInput) editModeInput.checked = false;
  }

  // Auto-render markdown on Enter: parse the current block through marked
  contentDiv.addEventListener('keydown', function (e) {
    if (!editModeActive) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      exitDocumentEditMode(false); // cancel
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey && !(e.ctrlKey || e.metaKey)) {
      var sel = window.getSelection();
      if (!sel || !sel.anchorNode) return;

      // Find the block-level element containing the cursor
      var block = sel.anchorNode;
      if (block.nodeType === 3) block = block.parentNode;
      while (block && block !== contentDiv) {
        var blockTag = block.tagName ? block.tagName.toLowerCase() : '';
        if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'blockquote', 'li', 'pre'].indexOf(blockTag) !== -1) {
          break;
        }
        block = block.parentNode;
      }
      if (!block || block === contentDiv) return;

      // For <pre> blocks, let Enter insert newlines normally
      if (block.tagName && block.tagName.toLowerCase() === 'pre') return;

      // Get the raw text of this block
      var rawText = block.textContent || '';

      // Check for markdown patterns that should be rendered
      var hasMarkdownPattern = /^#{1,6}\s/.test(rawText) ||
                               /\*\*[^*]+\*\*/.test(rawText) ||
                               /\*[^*]+\*/.test(rawText) ||
                               /`[^`]+`/.test(rawText) ||
                               /\[([^\]]+)\]\(([^)]+)\)/.test(rawText) ||
                               /^[-*+]\s/.test(rawText) ||
                               /^\d+\.\s/.test(rawText) ||
                               /^>\s/.test(rawText) ||
                               /^---\s*$/.test(rawText) ||
                               /^```/.test(rawText);

      if (hasMarkdownPattern) {
        e.preventDefault();

        // Parse the raw text through marked to get rendered HTML
        var rendered = marked.parse(rawText).trim();

        // Create a temp container to get the rendered elements
        var temp = document.createElement('div');
        temp.innerHTML = rendered;

        // Replace the current block with the rendered content
        var parent = block.parentNode;
        while (temp.firstChild) {
          parent.insertBefore(temp.firstChild, block);
        }
        parent.removeChild(block);

        // Create a new empty paragraph for the cursor and place it after the rendered content
        var newP = document.createElement('p');
        newP.innerHTML = '<br>';
        // Find where to insert: after the last inserted element
        var lastInserted = sel.anchorNode;
        while (lastInserted && lastInserted.parentNode !== contentDiv) {
          lastInserted = lastInserted.parentNode;
        }
        if (lastInserted && lastInserted.nextSibling) {
          contentDiv.insertBefore(newP, lastInserted.nextSibling);
        } else {
          contentDiv.appendChild(newP);
        }

        // Place cursor in the new paragraph
        var range = document.createRange();
        range.setStart(newP, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }

    // Ctrl/Cmd + S to save and exit edit mode
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      exitDocumentEditMode(true);
    }
  });

  // Double-click to enter document edit mode
  contentDiv.addEventListener('dblclick', function (e) {
    if (editModeActive) return; // already editing
    // Don't enter edit mode when double-clicking on comment highlights
    if (e.target.closest && e.target.closest('.mc-highlight')) return;
    enterDocumentEditMode();
  });

  // ── Toolbar actions (contentEditable) ──────────────────────────────────

  function execFormatCommand(command, value) {
    contentDiv.focus();
    document.execCommand(command, false, value || null);
  }

  function wrapSelectionWithTag(before, after) {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    var range = sel.getRangeAt(0);
    var text = range.toString();
    range.deleteContents();
    var textNode = document.createTextNode(before + text + after);
    range.insertNode(textNode);
    // Place cursor after
    range.setStartAfter(textNode);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function setHeadingLevel(level) {
    var sel = window.getSelection();
    if (!sel || !sel.anchorNode) return;

    // Find the block element
    var block = sel.anchorNode;
    if (block.nodeType === 3) block = block.parentNode;
    while (block && block !== contentDiv && block.parentNode !== contentDiv) {
      block = block.parentNode;
    }
    if (!block || block === contentDiv) return;

    var text = block.textContent || '';
    var tag = 'h' + level;
    var newEl = document.createElement(tag);
    newEl.textContent = text;
    block.parentNode.replaceChild(newEl, block);

    // Place cursor at end
    var range = document.createRange();
    range.selectNodeContents(newEl);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function insertListFromToolbar(ordered) {
    var sel = window.getSelection();
    if (!sel || !sel.anchorNode) return;

    var block = sel.anchorNode;
    if (block.nodeType === 3) block = block.parentNode;
    while (block && block !== contentDiv && block.parentNode !== contentDiv) {
      block = block.parentNode;
    }
    if (!block || block === contentDiv) return;

    var text = block.textContent || '';
    var lines = text.split('\n').filter(function (l) { return l.trim(); });
    if (!lines.length) lines = [''];

    var listTag = ordered ? 'ol' : 'ul';
    var listEl = document.createElement(listTag);
    lines.forEach(function (line) {
      var li = document.createElement('li');
      li.textContent = line;
      listEl.appendChild(li);
    });

    block.parentNode.replaceChild(listEl, block);

    var range = document.createRange();
    range.selectNodeContents(listEl.lastChild || listEl);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function insertBlockquoteFromToolbar() {
    var sel = window.getSelection();
    if (!sel || !sel.anchorNode) return;

    var block = sel.anchorNode;
    if (block.nodeType === 3) block = block.parentNode;
    while (block && block !== contentDiv && block.parentNode !== contentDiv) {
      block = block.parentNode;
    }
    if (!block || block === contentDiv) return;

    var bq = document.createElement('blockquote');
    var p = document.createElement('p');
    p.textContent = block.textContent || '';
    bq.appendChild(p);
    block.parentNode.replaceChild(bq, block);

    var range = document.createRange();
    range.selectNodeContents(p);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function insertCodeBlockFromToolbar() {
    var sel = window.getSelection();
    if (!sel || !sel.anchorNode) return;

    var block = sel.anchorNode;
    if (block.nodeType === 3) block = block.parentNode;
    while (block && block !== contentDiv && block.parentNode !== contentDiv) {
      block = block.parentNode;
    }
    if (!block || block === contentDiv) return;

    var pre = document.createElement('pre');
    var code = document.createElement('code');
    code.textContent = block.textContent || '';
    pre.appendChild(code);
    block.parentNode.replaceChild(pre, block);

    var range = document.createRange();
    range.selectNodeContents(code);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function insertLink() {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    var range = sel.getRangeAt(0);
    var text = range.toString() || 'link text';

    var a = document.createElement('a');
    a.href = 'url';
    a.textContent = text;

    range.deleteContents();
    range.insertNode(a);

    // Select the href value for easy editing — place cursor after the link
    var newRange = document.createRange();
    newRange.setStartAfter(a);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }

  if (toolbar) {
    toolbar.addEventListener('mousedown', function (e) {
      // Prevent stealing focus from contentEditable
      e.preventDefault();
    });

    toolbar.addEventListener('click', function (e) {
      var btn = e.target.closest('.mc-toolbar-btn');
      if (!btn || !editModeActive) return;

      var action = btn.getAttribute('data-action');
      switch (action) {
        case 'h1': setHeadingLevel(1); break;
        case 'h2': setHeadingLevel(2); break;
        case 'h3': setHeadingLevel(3); break;
        case 'bold': execFormatCommand('bold'); break;
        case 'italic': execFormatCommand('italic'); break;
        case 'code':
          wrapSelectionWithTag('`', '`');
          break;
        case 'link': insertLink(); break;
        case 'ul': insertListFromToolbar(false); break;
        case 'ol': insertListFromToolbar(true); break;
        case 'blockquote': insertBlockquoteFromToolbar(); break;
        case 'codeblock': insertCodeBlockFromToolbar(); break;
      }
    });
  }

  // ── Edit mode toggle & exit button ─────────────────────────────────────

  if (editModeInput) {
    editModeInput.addEventListener('change', function () {
      if (editModeInput.checked) {
        enterDocumentEditMode();
      } else {
        exitDocumentEditMode(true); // save on toggle off
      }
    });
  }

  if (exitEditBtn) {
    exitEditBtn.addEventListener('click', function () {
      exitDocumentEditMode(true); // save on exit
    });
  }

  // ── Settings menu ───────────────────────────────────────────────────────

  settingsBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    settingsDropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', function (e) {
    var settings = document.getElementById('mc-settings');
    if (settings && !settings.contains(e.target)) {
      settingsDropdown.classList.add('hidden');
    }
  });

  // ── Comments toggle ────────────────────────────────────────────────────

  toggleInput.addEventListener('change', function () {
    if (toggleInput.checked) {
      showAllPopups();
    } else {
      hideAllPopups();
    }
  });

  // ── Dark mode ──────────────────────────────────────────────────────────

  function applyDarkMode(dark) {
    if (dark) {
      document.body.classList.add('mc-dark');
    } else {
      document.body.classList.remove('mc-dark');
    }
  }

  function detectVsCodeDark() {
    return document.body.classList.contains('vscode-dark') ||
           document.body.classList.contains('vscode-high-contrast');
  }

  // Set initial state from VS Code theme
  var isDark = detectVsCodeDark();
  darkModeInput.checked = isDark;
  applyDarkMode(isDark);

  darkModeInput.addEventListener('change', function () {
    applyDarkMode(darkModeInput.checked);
  });

  // Watch for VS Code theme changes (class mutations on body).
  // Track last known state so our own mc-dark class changes don't re-trigger.
  var lastVsCodeDark = isDark;
  var themeObserver = new MutationObserver(function () {
    var nowDark = detectVsCodeDark();
    if (nowDark !== lastVsCodeDark) {
      lastVsCodeDark = nowDark;
      darkModeInput.checked = nowDark;
      applyDarkMode(nowDark);
    }
  });
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // ── Signal ready ───────────────────────────────────────────────────────

  function signalReady() {
    vscode.postMessage({ type: 'ready' });
  }

  if (document.readyState === 'complete') {
    signalReady();
  } else {
    window.addEventListener('load', signalReady);
  }
})();
