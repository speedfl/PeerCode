import * as vscode from "vscode";
import * as fs from "fs";

import { IConfig } from "./config";
import { FileSharer } from "./core/fs/fileSharer";
import { DockerService } from "./runner/dockerService";
import { Session } from "./session/session";
import { SessionManager } from "./session/sessionManager";
import { shareTerminalWithPeers } from "./terminal/rtcTerm/terminal";
import { DockerPortListener, tunnelServer } from "./tunneling/tunnel";
import { DrawingPanel } from "./ui/webviews/panel/paint";
import { input } from "./utils";

export class ApplicationFacade {
  constructor(
    private config: IConfig,
    private sessionManager: SessionManager,
    private fileSharer: FileSharer,
    private dockerService: DockerService,
  ) {}

  async startSession(): Promise<void> {
    if (!this.fileSharer.workspacePath) {
      console.error("open workspace before starting session");
      return;
    }
    const session = await this.sessionManager.createSession(this.dockerService, true);
    await this.fileSharer.shareWorkspace(session);
    this.dockerService.registerListener(new DockerPortListener(session.provider.getProvider()));
  }

  // When joining a session as guest if files already exists, they are simply ignored
  // Probably to avoid conflicting with critical files (imagine if user open home :D)
  // However this result in ignoring all file if using existing path with same tree (example: we cloned the same repository)
  // this results in making all the files not sharable
  // To prevent this issue decision has been taken to request a unique and empty folder
  async joinSession(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;

    if (!folders || folders.length === 0) {
      throw new Error("to join a session please open one unique empty folder");
    }

    if (folders.length > 1) {
      throw new Error(
        `to join a session only one empty folder is allowed, found ${folders.map(f => f.name).join(",")}`,
      );
    }

    const numberOfFiles = fs.readdirSync(folders[0].uri.path).length;

    if (numberOfFiles > 0) {
      throw new Error(
        `to join a session only one empty folder is allowed, found ${numberOfFiles} files`,
      );
    }

    await this.sessionManager.createSession(this.dockerService);
  }

  renderPaint(extensionUri: vscode.Uri, session: Session): void {
    DrawingPanel.render(extensionUri, this.config, session.getRoomName(), session.getUsername());
  }

  async runDocker(session: Session, workspacePath: string | null): Promise<void> {
    if (workspacePath === null) {
      console.error("workspacePath is null");
      return;
    }
    if (session.isOwner) {
      await this.dockerService.runDockerLocallyAndShare(workspacePath, session);
    } else {
      if (session.provider.supportsDocker()) {
        this.dockerService.runDockerRemote(session);
      }
    }
  }

  async sharePort(session: Session): Promise<void> {
    if (!session.provider.supportsTunneling()) {
      throw new Error("does not support tunneling");
    }
    const port = await getPortToShare();
    tunnelServer(session.provider.getProvider(), port);
  }

  async shareTerminal(session: Session, workspacePath: string): Promise<void> {
    shareTerminalWithPeers(session.provider.getProvider(), workspacePath);
  }
}

async function getPortToShare(): Promise<number> {
  const portStr = await input(async () => {
    return vscode.window.showInputBox({
      prompt: "Enter port to share",
      placeHolder: "8080",
    });
  });
  return parseInt(portStr);
}
