export interface MCComment {
  id: string;
  anchor: string;   // selected text; empty string for line-based comments
  comment: string;
  line?: number;    // 1-indexed source line
}

export type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'addComment'; anchor: string; comment: string; line: number }
  | { type: 'editComment'; id: string; comment: string }
  | { type: 'deleteComment'; id: string }
  | { type: 'updateDocument'; markdown: string };

export type ExtensionToWebviewMessage =
  | { type: 'update'; markdown: string; rawMarkdown: string; comments: MCComment[] };
