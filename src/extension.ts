import * as vscode from 'vscode';
import { PreviewPanel } from './previewPanel';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdownCommenter.openPreview',
      (uri?: vscode.Uri) => {
        const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (!targetUri || !targetUri.fsPath.endsWith('.md')) {
          vscode.window.showErrorMessage(
            'MarkdownCommenter: Please open a Markdown (.md) file first.'
          );
          return;
        }
        PreviewPanel.createOrShow(context, targetUri);
      }
    )
  );
}

export function deactivate(): void {}
