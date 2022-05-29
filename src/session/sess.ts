import * as vscode from "vscode";

import { IShareLocalToRemote } from "../core/bind/listeners";
import { Peer, PeerManager } from "../peer/peer";

export interface SessionListener {

    onAddSession(session: Sess): void;

    onRemoveSession(session: Sess): void;
}

export class Sess {

    constructor(private roomname: string,
        private username: string,
        private peerManager: PeerManager,
        private shareLocalToRemote: IShareLocalToRemote) {

    }

    public getPeerManager(): PeerManager {
        return this.peerManager;
    }

    public getSessionPeers(): Peer[] {
        return this.peerManager.getPeers();
    }

    public getRoomName(): string {
        return this.roomname;
    }

    public shareLocalFile(file: vscode.Uri) {
        return this.shareLocalToRemote.shareFile(file);
    }
    public getUsername(): string {
        return this.username;
    }
}