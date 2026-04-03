import * as vscode from 'vscode';
import { MarkdownCommenterEditorProvider } from './editorProvider';

export function activate(context: vscode.ExtensionContext): void {
  // Register the custom editor provider
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      MarkdownCommenterEditorProvider.viewType,
      new MarkdownCommenterEditorProvider(context.extensionUri),
      { supportsMultipleEditorsPerDocument: false }
    )
  );

  // Command for context menus / editor title button — opens the custom editor
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
        vscode.commands.executeCommand(
          'vscode.openWith',
          targetUri,
          MarkdownCommenterEditorProvider.viewType
        );
      }
    )
  );
}

export function deactivate(): void {}
