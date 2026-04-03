import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  parseComments,
  insertComment,
  deleteComment,
  generateId,
  stripComments,
  readSource,
  writeSource,
} from './commentStore';
import { WebviewToExtensionMessage } from './types';

export class PreviewPanel {
  public static readonly viewType = 'markdownCommenter.preview';

  // One panel per file path
  private static readonly _panels = new Map<string, PreviewPanel>();

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _fileUri: vscode.Uri;
  private readonly _disposables: vscode.Disposable[] = [];

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  public static createOrShow(
    context: vscode.ExtensionContext,
    fileUri: vscode.Uri
  ): void {
    const key = fileUri.fsPath;
    const existing = PreviewPanel._panels.get(key);
    if (existing) {
      existing._panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      PreviewPanel.viewType,
      `Preview: ${path.basename(fileUri.fsPath)}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
        retainContextWhenHidden: true,
      }
    );

    new PreviewPanel(panel, context.extensionUri, fileUri);
  }

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    fileUri: vscode.Uri
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._fileUri = fileUri;

    PreviewPanel._panels.set(fileUri.fsPath, this);

    // Set the static HTML shell once
    this._panel.webview.html = this._buildHtml();

    // File watcher — re-render when file changes on disk
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(
        vscode.Uri.file(path.dirname(fileUri.fsPath)),
        path.basename(fileUri.fsPath)
      )
    );
    watcher.onDidChange(() => this._update(), null, this._disposables);
    this._disposables.push(watcher);

    // Messages from the webview
    this._panel.webview.onDidReceiveMessage(
      (msg: WebviewToExtensionMessage) => this._handleMessage(msg),
      null,
      this._disposables
    );

    // Cleanup on panel close
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  private _buildHtml(): string {
    const nonce = crypto.randomBytes(16).toString('base64url');
    const webview = this._panel.webview;

    const markedUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'marked.min.js')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'preview.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'preview.css')
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
    <textarea id="comment-input" placeholder="Add a comment..." rows="3"></textarea>
    <div class="comment-form-actions">
      <button id="comment-save">Save</button>
      <button id="comment-cancel">Cancel</button>
    </div>
  </div>

  <div id="tooltip" class="hidden" role="tooltip"></div>

  <script nonce="${nonce}" src="${markedUri}"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private async _update(): Promise<void> {
    try {
      const source = await readSource(this._fileUri);
      const comments = parseComments(source);
      const cleanMarkdown = stripComments(source);
      this._panel.webview.postMessage({
        type: 'update',
        markdown: cleanMarkdown,
        comments,
      });
    } catch (err) {
      this._panel.webview.postMessage({
        type: 'error',
        message: `Failed to read file: ${err}`,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Message handling
  // -------------------------------------------------------------------------

  private async _handleMessage(message: WebviewToExtensionMessage): Promise<void> {
    switch (message.type) {
      case 'ready': {
        await this._update();
        break;
      }

      case 'addComment': {
        try {
          const source = await readSource(this._fileUri);
          const existing = parseComments(source);
          const newComment = {
            id: generateId(existing),
            anchor: message.anchor,
            comment: message.comment,
            line: message.line,
          };
          const updated = insertComment(source, newComment, message.line);
          await writeSource(this._fileUri, updated);
          // File watcher triggers _update() automatically
        } catch (err) {
          vscode.window.showErrorMessage(`MarkdownCommenter: Failed to save comment — ${err}`);
        }
        break;
      }

      case 'deleteComment': {
        try {
          const source = await readSource(this._fileUri);
          const updated = deleteComment(source, message.id);
          await writeSource(this._fileUri, updated);
        } catch (err) {
          vscode.window.showErrorMessage(`MarkdownCommenter: Failed to delete comment — ${err}`);
        }
        break;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  public dispose(): void {
    PreviewPanel._panels.delete(this._fileUri.fsPath);
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables.length = 0;
  }
}
