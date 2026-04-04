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

    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource}`,
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
  <link rel="stylesheet" href="${styleUri}">
  <title>Markdown Preview</title>
</head>
<body>
  <div id="preview-content"></div>

  <button id="add-comment-btn" class="hidden" aria-label="Add comment">&#x1F4AC; Add Comment</button>

  <div id="comment-form" class="hidden" role="dialog" aria-label="Add comment">
    <div id="comment-form-header">Add Comment</div>
    <textarea id="comment-input" placeholder="Add a comment..." rows="3"></textarea>
    <div class="comment-form-actions">
      <button id="comment-delete" class="hidden">Delete</button>
      <div class="comment-form-actions-right">
        <button id="comment-save">Save</button>
        <button id="comment-cancel">Cancel</button>
      </div>
    </div>
  </div>

  <div id="comments-toggle-wrapper">
    <label class="mc-toggle-switch" title="Show all comments">
      <input type="checkbox" id="comments-toggle-input">
      <span class="mc-toggle-slider"></span>
    </label>
    <span class="mc-toggle-label">Comments</span>
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
