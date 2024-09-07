import * as vscode from "vscode";

import { Position, TextChange, TextChangeType } from "../../dataStructs";
import { createRange } from "../textUtil";
import { DocumentChannel } from "./documentChannel";

export interface DocumentChannelListener {
  onRemoteInitText(text: string): Promise<void>;

  onRemoteTextChanges(changes: TextChange[]): Promise<void>;

  onSave(): Promise<void>;
}

export default class DocumentBinding implements DocumentChannelListener {
  public mutexLock = false;

  constructor(
    public document: vscode.TextDocument,
    public documentChannel: DocumentChannel,
  ) {
    documentChannel.addListener(this);
  }

  async onRemoteInitText(text: string): Promise<void> {
    console.log("onRemoteInitText - text:" + text);
    const textEdit = new vscode.TextEdit(
      new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)),
      text,
    );
    // When initializing a project, lot of files comes. It is done in two steps:
    // Step one: the file is created without anything
    // Step two: the file is edited with the full content, this results in opening the file in a tab
    // When 100s to 1000s of files are opened in the editor, vscode freeze
    // Therefore we let the possibility to force save the file on remoteTextChange when file is empty
    await this.applyWorkspaceEdits(
      this.document,
      [textEdit],
      this.document.getText().length === 0 && text?.length > 0,
    );
  }

  async onRemoteTextChanges(changes: TextChange[]): Promise<void> {
    console.log("onRemoteTextChanges- changes length:" + changes.length);
    const textEdits = changes.map(change => {
      return new vscode.TextEdit(createRange(change.start, change.end), change.text);
    });
    await this.applyWorkspaceEdits(this.document, textEdits);
  }

  async onSave(): Promise<void> {
    await this.document.save();
  }

  onDidChangeDocument(changes: readonly vscode.TextDocumentContentChangeEvent[]): void {
    console.log("DocumentBinding: onDidChangeBuffer- mutexLock: " + this.mutexLock);
    if (!this.mutexLock) {
      // prevent multiple updates
      [...changes]
        .sort((change1, change2) => change2.rangeOffset - change1.rangeOffset)
        .map(change => {
          return new TextChange(
            TextChangeType.UPDATE,
            new Position(change.range.start.line, change.range.start.character),
            new Position(change.range.end.line, change.range.end.character),
            change.text,
          );
        })
        .forEach(change => {
          this.documentChannel.sendChangeToRemote(change);
        });
    }
  }

  private async update(edit: vscode.WorkspaceEdit): Promise<boolean> {
    this.mutexLock = true;
    const res = await vscode.workspace.applyEdit(edit);
    this.mutexLock = false;
    return res;
  }

  private async tryApplyChanges(edit: vscode.WorkspaceEdit): Promise<void> {
    try {
      while (!(await this.update(edit))) {
        console.warn("tryApplyChanges: retrying");
      }
      console.info("success Applying Changes");
    } catch (err) {
      console.error("error", err);
    }
  }

  requestSavePromise(): Promise<void> {
    this.documentChannel.saveToRemote();
    return Promise.resolve();
  }

  async applyWorkspaceEdits(
    document: vscode.TextDocument,
    edits: vscode.TextEdit[],
    forceSave?: boolean,
  ): Promise<void> {
    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.set(document.uri, edits);
    await this.tryApplyChanges(workspaceEdit);
    if (forceSave) {
      console.log("force saving " + document.uri.fsPath);
      await document.save();
    }
  }
}
