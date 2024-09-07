import * as vscode from "vscode";
import { YjsProviderWrapper } from "../connector/yjs/provider";

import { IShareLocalToRemote } from "../core/bind/listeners";
import { Peer, PeerManager } from "../peer/peer";

export interface SessionListener {
  onAddSession(session: Session): void;

  onRemoveSession(session: Session): void;
}

export class Session {
  constructor(
    public readonly roomName: string,
    private readonly username: string,
    private peerManager: PeerManager,
    private shareLocalToRemote: IShareLocalToRemote,
    public readonly provider: YjsProviderWrapper,
    public readonly isOwner: boolean,
    // Request a path if user is not owner
    public readonly path?: string,
  ) {}

  public getPeerManager(): PeerManager {
    return this.peerManager;
  }

  public getSessionPeers(): Peer[] {
    return this.peerManager.getPeers();
  }

  public getRoomName(): string {
    return this.roomName;
  }

  public shareLocalFile(file: vscode.Uri): Promise<void> {
    return this.shareLocalToRemote.shareFile(file);
  }

  public getUsername(): string {
    return this.username;
  }

  public getPath(): string | undefined {
    return this.path;
  }
}
