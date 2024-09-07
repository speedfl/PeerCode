import { BaseObservable } from "../core/observable";

export class Peer {
  constructor(public peerName: string) {}
}

export interface PeerConnectionListener {
  onPeerAdded(peer: Peer): void;
  onPeerRemoved(peer: Peer): void;
}

export class PeerManager extends BaseObservable<PeerConnectionListener> {
  private peers: Peer[] = [];

  peerJoined(peer: Peer): void {
    console.log("peer joined: " + peer.peerName);
    this.peers.push(peer);
    this.notify(async (listener: PeerConnectionListener): Promise<void> => {
      listener.onPeerAdded(peer);
    });
  }

  peerLeft(peer: Peer): void {
    console.log("peer joined: " + peer);
    this.peers = this.peers.filter(p => p !== peer);
    this.notify(async (listener: PeerConnectionListener): Promise<void> => {
      listener.onPeerRemoved(peer);
    });
  }

  getPeers(): Peer[] {
    return this.peers.slice();
  }
}
