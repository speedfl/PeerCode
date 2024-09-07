import * as vscode from "vscode";

import { Session } from "../../session/session";
import { getAllFiles } from "./fileSystemManager";

export class FileSharer {
  constructor(public workspacePath: string | null) {}

  async shareWorkspace(session: Session): Promise<void> {
    if (!this.workspacePath) {
      console.error("open workspace!");
      return;
    }
    const files = await getAllFiles(this.workspacePath);
    console.log("files to Share: " + files);
    for (const file of files) {
      try {
        await session.shareLocalFile(file);
      } catch (error) {
        console.log("error sharing file: " + file);
      }
    }
  }

  async shareFile(session: Session, filePath: vscode.Uri): Promise<void> {
    await session.shareLocalFile(filePath);
  }
}
