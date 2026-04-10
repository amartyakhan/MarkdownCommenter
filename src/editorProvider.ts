import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as path from 'path';
import {
  parseComments,
  insertComment,
  deleteComment,
  updateComment,
  generateId,
  stripComments,
  isTableLine,
} from './commentStore';
import { WebviewToExtensionMessage } from './types';

export class MarkdownCommenterEditorProvider
  implements vscode.CustomTextEditorProvider
{
  public static readonly viewType = 'markdownCommenter.editor';

  constructor(private readonly extensionUri: vscode.Uri) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    // The document's directory must be in localResourceRoots so images load
    const documentDir = vscode.Uri.file(path.dirname(document.uri.fsPath));

    // Configure webview
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'media'),
        documentDir,
      ],
    };

    // Set the static HTML shell
    webviewPanel.webview.html = this.buildHtml(webviewPanel.webview);

    // Send current document state to the webview
    function updateWebview() {
      const source = document.getText();
      const comments = parseComments(source);
      const cleanMarkdown = stripComments(source);
      const rewrittenMarkdown = rewriteImagePaths(
        cleanMarkdown,
        document.uri,
        webviewPanel.webview
      );
      webviewPanel.webview.postMessage({
        type: 'update',
        markdown: rewrittenMarkdown,
        rawMarkdown: cleanMarkdown,
        comments,
      });
    }

    // Re-render when the underlying document changes (from any source)
    const changeSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        updateWebview();
      }
    });

    // Re-send data when the panel becomes visible again
    const viewStateSubscription = webviewPanel.onDidChangeViewState(() => {
      if (webviewPanel.visible) {
        updateWebview();
      }
    });

    // Handle messages from the webview
    const messageSubscription = webviewPanel.webview.onDidReceiveMessage(
      async (message: WebviewToExtensionMessage) => {
        switch (message.type) {
          case 'ready': {
            updateWebview();
            break;
          }

          case 'addComment': {
            const source = document.getText();
            const existing = parseComments(source);
            const newComment = {
              id: generateId(existing),
              anchor: message.anchor,
              comment: message.comment,
              line: message.line,
            };
            const updated = insertComment(source, newComment, message.line);
            const edit = new vscode.WorkspaceEdit();
            edit.replace(
              document.uri,
              new vscode.Range(
                document.positionAt(0),
                document.positionAt(source.length)
              ),
              updated
            );
            await vscode.workspace.applyEdit(edit);
            break;
          }

          case 'editComment': {
            const source = document.getText();
            const updated = updateComment(source, message.id, message.comment);
            const edit = new vscode.WorkspaceEdit();
            edit.replace(
              document.uri,
              new vscode.Range(
                document.positionAt(0),
                document.positionAt(source.length)
              ),
              updated
            );
            await vscode.workspace.applyEdit(edit);
            break;
          }

          case 'deleteComment': {
            const source = document.getText();
            const updated = deleteComment(source, message.id);
            const edit = new vscode.WorkspaceEdit();
            edit.replace(
              document.uri,
              new vscode.Range(
                document.positionAt(0),
                document.positionAt(source.length)
              ),
              updated
            );
            await vscode.workspace.applyEdit(edit);
            break;
          }

          case 'updateDocument': {
            const source = document.getText();
            const existingComments = parseComments(source);

            // Re-insert MC comments into the new markdown.
            // For anchor-based comments: find the anchor text in the new markdown
            // and insert after the line where it appears.
            // For line-based comments: insert at the same line (clamped to doc length).
            const newLines = message.markdown.split('\n');
            // Track insertions as (lineIndex, commentTag) pairs, sorted from bottom up
            const insertions: { line: number; tag: string }[] = [];

            for (const comment of existingComments) {
              const tag = `<!-- MC:${JSON.stringify(comment)} -->`;
              let targetLine: number;
              if (comment.anchor && comment.anchor.trim()) {
                // Find anchor text in the new markdown
                let foundLine = -1;
                for (let i = 0; i < newLines.length; i++) {
                  if (newLines[i].includes(comment.anchor)) {
                    foundLine = i;
                    break;
                  }
                }
                targetLine = foundLine >= 0 ? foundLine : newLines.length - 1;
              } else {
                // Line-based comment — use original line, clamped
                targetLine = Math.min((comment.line || 1) - 1, newLines.length - 1);
              }

              // If target is inside a table block, move past the table end
              while (targetLine + 1 < newLines.length && isTableLine(newLines[targetLine + 1])) {
                targetLine++;
              }
              insertions.push({ line: targetLine, tag });
            }

            // Sort insertions from bottom to top so indices stay valid
            insertions.sort((a, b) => b.line - a.line);

            const resultLines = [...newLines];
            for (const ins of insertions) {
              resultLines.splice(ins.line + 1, 0, ins.tag);
            }

            const updated = resultLines.join('\n');
            const edit = new vscode.WorkspaceEdit();
            edit.replace(
              document.uri,
              new vscode.Range(
                document.positionAt(0),
                document.positionAt(source.length)
              ),
              updated
            );
            await vscode.workspace.applyEdit(edit);
            break;
          }
        }
      }
    );

    // Cleanup
    webviewPanel.onDidDispose(() => {
      changeSubscription.dispose();
      viewStateSubscription.dispose();
      messageSubscription.dispose();
    });
  }

  private buildHtml(webview: vscode.Webview): string {

    const nonce = crypto.randomBytes(16).toString('base64url');

    const markedUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'marked.min.js')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'preview.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'preview.css')
    );

    // Font URIs must be resolved via asWebviewUri — relative paths in CSS don't work in webviews
    const fontRegular = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'fonts', 'Inter-Regular.woff2')
    );
    const fontMedium = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'fonts', 'Inter-Medium.woff2')
    );
    const fontSemiBold = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'fonts', 'Inter-SemiBold.woff2')
    );
    const fontBold = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'fonts', 'Inter-Bold.woff2')
    );

    const fontFaces = `
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 400; font-display: swap; src: url("${fontRegular}") format('woff2'); }
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 500; font-display: swap; src: url("${fontMedium}") format('woff2'); }
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 600; font-display: swap; src: url("${fontSemiBold}") format('woff2'); }
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 700; font-display: swap; src: url("${fontBold}") format('woff2'); }
`;

    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'nonce-${nonce}'`,
      `script-src 'nonce-${nonce}'`,
      `img-src ${webview.cspSource} https: data:`,
      `font-src ${webview.cspSource}`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style nonce="${nonce}">${fontFaces}</style>
  <link rel="stylesheet" href="${styleUri}">
  <title>Markdown Preview</title>
</head>
<body>
  <div id="mc-layout">
    <div id="mc-edit-toolbar" class="hidden">
      <span class="mc-toolbar-label">Edit mode</span>
      <span class="mc-toolbar-sep"></span>
      <button class="mc-toolbar-btn" data-action="h1" title="Heading 1">H1</button>
      <button class="mc-toolbar-btn" data-action="h2" title="Heading 2">H2</button>
      <button class="mc-toolbar-btn" data-action="h3" title="Heading 3">H3</button>
      <span class="mc-toolbar-sep"></span>
      <button class="mc-toolbar-btn" data-action="bold" title="Bold">Bold</button>
      <button class="mc-toolbar-btn" data-action="italic" title="Italic">Italic</button>
      <button class="mc-toolbar-btn" data-action="code" title="Inline code">Code</button>
      <span class="mc-toolbar-sep"></span>
      <button class="mc-toolbar-btn" data-action="link" title="Link">Link</button>
      <button class="mc-toolbar-btn" data-action="ul" title="Unordered list">List</button>
      <button class="mc-toolbar-btn" data-action="ol" title="Ordered list">Numbered</button>
      <button class="mc-toolbar-btn" data-action="blockquote" title="Blockquote">Quote</button>
      <button class="mc-toolbar-btn" data-action="codeblock" title="Code block">Code block</button>
      <span class="mc-toolbar-spacer"></span>
      <button class="mc-toolbar-btn mc-toolbar-exit" id="mc-exit-edit" title="Exit edit mode">Exit</button>
    </div>
    <div id="preview-content"></div>
    <div id="mc-sidebar"></div>
  </div>

  <button id="add-comment-btn" class="hidden" aria-label="Add comment"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style="vertical-align:-2px;margin-right:4px"><path d="M2 2h12v8H6.5L3 13.5V10H2V2z"/></svg>Add Comment</button>

  <div id="comment-form" class="hidden" role="dialog" aria-label="Add comment">
    <div id="comment-form-header">Add Comment</div>
    <textarea id="comment-input" placeholder="Add a comment..." rows="3"></textarea>
    <div class="comment-form-actions">
      <div class="comment-form-actions-right">
        <button id="comment-save">Save</button>
        <button id="comment-cancel">Cancel</button>
      </div>
    </div>
  </div>

  <div id="mc-settings">
    <button id="mc-settings-btn" aria-label="Settings" title="Settings">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M7 1h2v1.8a5.5 5.5 0 012.1.9L12.8 2l1.4 1.4-1.7 1.7c.4.6.7 1.3.9 2.1H15v2h-1.6c-.2.8-.5 1.5-.9 2.1l1.7 1.7-1.4 1.4-1.7-1.7c-.6.4-1.3.7-2.1.9V15H7v-1.6a5.5 5.5 0 01-2.1-.9L3.2 14 1.8 12.6l1.7-1.7A5.5 5.5 0 012.6 9H1V7h1.6c.2-.8.5-1.5.9-2.1L1.8 3.2 3.2 1.8l1.7 1.7c.6-.4 1.3-.7 2.1-.9V1zM8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z"/></svg>
    </button>
    <div id="mc-settings-dropdown" class="hidden">
      <label class="mc-settings-item">
        <span class="mc-settings-item-label">Show all comments</span>
        <span class="mc-toggle-switch">
          <input type="checkbox" id="comments-toggle-input">
          <span class="mc-toggle-slider"></span>
        </span>
      </label>
      <label class="mc-settings-item">
        <span class="mc-settings-item-label">Edit mode</span>
        <span class="mc-toggle-switch">
          <input type="checkbox" id="edit-mode-input">
          <span class="mc-toggle-slider"></span>
        </span>
      </label>
      <label class="mc-settings-item">
        <span class="mc-settings-item-label">Dark mode</span>
        <span class="mc-toggle-switch">
          <input type="checkbox" id="dark-mode-input">
          <span class="mc-toggle-slider"></span>
        </span>
      </label>
    </div>
  </div>

  <script nonce="${nonce}" src="${markedUri}"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

/**
 * Rewrites relative image paths in markdown to webview-compatible URIs.
 * This must happen on the extension side where asWebviewUri() is available.
 */
function rewriteImagePaths(
  markdown: string,
  documentUri: vscode.Uri,
  webview: vscode.Webview
): string {
  const docDir = path.dirname(documentUri.fsPath);
  return markdown.replace(/!\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g, (match, alt, src, title = '') => {
    // Leave absolute URLs and data URIs untouched
    if (/^(https?:|data:|vscode-)/i.test(src)) {
      return match;
    }
    const absolutePath = path.isAbsolute(src)
      ? src
      : path.join(docDir, src);
    const webviewUri = webview.asWebviewUri(vscode.Uri.file(absolutePath));
    return `![${alt}](${webviewUri.toString()}${title})`;
  });
}
