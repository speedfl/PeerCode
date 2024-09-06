import * as Y from "yjs"; // eslint-disable-line
import * as bc from "lib0/broadcastchannel";
import * as time from "lib0/time";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as syncProtocol from "y-protocols/sync";
import * as authProtocol from "y-protocols/auth";
import * as awarenessProtocol from "y-protocols/awareness";
import { Observable } from "lib0/observable";
import * as math from "lib0/math";
import * as url from "lib0/url";
import * as env from "lib0/environment";

export const messageSync = 0;
export const messageQueryAwareness = 3;
export const messageAwareness = 1;
export const messageAuth = 2;

type MessageHandler = (
  encoder: encoding.Encoder,
  decoder: decoding.Decoder,
  provider: WebsocketProvider,
  emitSynced: boolean,
  messageType: number,
) => void;

const messageHandlers: Array<MessageHandler | undefined> = [];

messageHandlers[messageSync] = (encoder, decoder, provider, emitSynced, messageType) => {
  encoding.writeVarUint(encoder, messageSync);
  const syncMessageType = syncProtocol.readSyncMessage(decoder, encoder, provider.doc, provider);
  if (emitSynced && syncMessageType === syncProtocol.messageYjsSyncStep2 && !provider.synced) {
    provider.synced = true;
  }
};

messageHandlers[messageQueryAwareness] = (
  encoder,
  _decoder,
  provider,
  _emitSynced,
  _messageType,
) => {
  encoding.writeVarUint(encoder, messageAwareness);
  encoding.writeVarUint8Array(
    encoder,
    awarenessProtocol.encodeAwarenessUpdate(
      provider.awareness,
      Array.from(provider.awareness.getStates().keys()),
    ),
  );
};

messageHandlers[messageAwareness] = (_encoder, decoder, provider, _emitSynced, _messageType) => {
  awarenessProtocol.applyAwarenessUpdate(
    provider.awareness,
    decoding.readVarUint8Array(decoder),
    provider,
  );
};

messageHandlers[messageAuth] = (_encoder, decoder, provider, _emitSynced, _messageType) => {
  authProtocol.readAuthMessage(decoder, provider.doc, (_ydoc, reason) =>
    permissionDeniedHandler(provider, reason),
  );
};

const messageReconnectTimeout = 30000;

const permissionDeniedHandler = (provider: WebsocketProvider, reason: string): void => {
  console.warn(`Permission denied to access ${provider.url}.\n${reason}`);
};

const readMessage = (
  provider: WebsocketProvider,
  buf: Uint8Array,
  emitSynced: boolean,
): encoding.Encoder => {
  const decoder = decoding.createDecoder(buf);
  const encoder = encoding.createEncoder();
  const messageType = decoding.readVarUint(decoder);
  const messageHandler = provider.messageHandlers[messageType];
  if (messageHandler) {
    messageHandler(encoder, decoder, provider, emitSynced, messageType);
  } else {
    console.error("Unable to compute message");
  }
  return encoder;
};

const setupWS = (provider: WebsocketProvider): void => {
  if (provider.shouldConnect && provider.ws === null) {
    const websocket = new provider._WS(provider.url, provider.protocols);
    websocket.binaryType = "arraybuffer";
    provider.ws = websocket;
    provider.wsconnecting = true;
    provider.wsconnected = false;
    provider.synced = false;

    websocket.onmessage = (event: MessageEvent) => {
      provider.wsLastMessageReceived = time.getUnixTime();
      const encoder = readMessage(provider, new Uint8Array(event.data), true);
      if (encoding.length(encoder) > 1) {
        websocket.send(encoding.toUint8Array(encoder));
      }
    };
    websocket.onerror = (event: Event) => {
      provider.emit("connection-error", [event, provider]);
    };
    websocket.onclose = (event: CloseEvent) => {
      provider.emit("connection-close", [event, provider]);
      provider.ws = null;
      provider.wsconnecting = false;
      if (provider.wsconnected) {
        provider.wsconnected = false;
        provider.synced = false;
        awarenessProtocol.removeAwarenessStates(
          provider.awareness,
          Array.from(provider.awareness.getStates().keys()).filter(
            client => client !== provider.doc.clientID,
          ),
          provider,
        );
        provider.emit("status", [
          {
            status: "disconnected",
          },
        ]);
      } else {
        provider.wsUnsuccessfulReconnects++;
      }
      setTimeout(
        setupWS,
        math.min(math.pow(2, provider.wsUnsuccessfulReconnects) * 100, provider.maxBackoffTime),
        provider,
      );
    };
    websocket.onopen = () => {
      provider.wsLastMessageReceived = time.getUnixTime();
      provider.wsconnecting = false;
      provider.wsconnected = true;
      provider.wsUnsuccessfulReconnects = 0;
      provider.emit("status", [
        {
          status: "connected",
        },
      ]);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeSyncStep1(encoder, provider.doc);
      websocket.send(encoding.toUint8Array(encoder));
      if (provider.awareness.getLocalState() !== null) {
        const encoderAwarenessState = encoding.createEncoder();
        encoding.writeVarUint(encoderAwarenessState, messageAwareness);
        encoding.writeVarUint8Array(
          encoderAwarenessState,
          awarenessProtocol.encodeAwarenessUpdate(provider.awareness, [provider.doc.clientID]),
        );
        websocket.send(encoding.toUint8Array(encoderAwarenessState));
      }
    };
    provider.emit("status", [
      {
        status: "connecting",
      },
    ]);
  }
};

const broadcastMessage = (provider: WebsocketProvider, buf: ArrayBuffer): void => {
  const ws = provider.ws;
  if (provider.wsconnected && ws && ws.readyState === ws.OPEN) {
    ws.send(buf);
  }
  if (provider.bcconnected) {
    bc.publish(provider.bcChannel, buf, provider);
  }
};

export class WebsocketProvider extends Observable<string> {
  serverUrl: string;
  bcChannel: string;
  maxBackoffTime: number;
  params: Record<string, string>;
  protocols: Array<string>;
  roomname: string;
  doc: Y.Doc;
  _WS: typeof WebSocket;
  awareness: awarenessProtocol.Awareness;
  wsconnected: boolean;
  wsconnecting: boolean;
  bcconnected: boolean;
  disableBc: boolean;
  wsUnsuccessfulReconnects: number;
  messageHandlers: Array<MessageHandler | undefined>;
  private _synced: boolean;
  ws: WebSocket | null;
  wsLastMessageReceived: number;
  shouldConnect: boolean;
  private _resyncInterval: NodeJS.Timeout | number;
  private _bcSubscriber: (data: ArrayBuffer, origin: any) => void;
  private _updateHandler: (update: Uint8Array, origin: any) => void;
  private _awarenessUpdateHandler: (
    event: { added: any[]; updated: any[]; removed: any[] },
    origin: any,
  ) => void;
  private _exitHandler: () => void;

  constructor(
    serverUrl: string,
    roomname: string,
    doc: Y.Doc,
    {
      connect = true,
      awareness = new awarenessProtocol.Awareness(doc),
      params = {},
      protocols = [],
      WebSocketPolyfill = WebSocket,
      resyncInterval = -1,
      maxBackoffTime = 2500,
      disableBc = false,
    }: {
      connect?: boolean;
      awareness?: awarenessProtocol.Awareness;
      params?: Record<string, string>;
      protocols?: Array<string>;
      WebSocketPolyfill?: typeof WebSocket;
      resyncInterval?: number;
      maxBackoffTime?: number;
      disableBc?: boolean;
    } = {},
  ) {
    super();
    while (serverUrl[serverUrl.length - 1] === "/") {
      serverUrl = serverUrl.slice(0, -1);
    }
    this.serverUrl = serverUrl;
    this.bcChannel = serverUrl + "/" + roomname;
    this.maxBackoffTime = maxBackoffTime;
    this.params = params;
    this.protocols = protocols;
    this.roomname = roomname;
    this.doc = doc;
    this._WS = WebSocketPolyfill;
    this.awareness = awareness;
    this.wsconnected = false;
    this.wsconnecting = false;
    this.bcconnected = false;
    this.disableBc = disableBc;
    this.wsUnsuccessfulReconnects = 0;
    this.messageHandlers = messageHandlers.slice();
    this._synced = false;
    this.ws = null;
    this.wsLastMessageReceived = 0;
    this.shouldConnect = connect;

    this._resyncInterval = 0;
    if (resyncInterval > 0) {
      this._resyncInterval = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, messageSync);
          syncProtocol.writeSyncStep1(encoder, doc);
          this.ws.send(encoding.toUint8Array(encoder));
        }
      }, resyncInterval);
    }

    this._bcSubscriber = (data: ArrayBuffer, origin: any) => {
      if (origin !== this) {
        const encoder = readMessage(this, new Uint8Array(data), false);
        if (encoding.length(encoder) > 1 && this.wsconnected) {
          broadcastMessage(this, encoding.toUint8Array(encoder));
        }
      }
    };
    this._updateHandler = (update: Uint8Array, origin: any) => {
      if (origin !== this) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.writeUpdate(encoder, update);
        broadcastMessage(this, encoding.toUint8Array(encoder));
      }
    };
    this._awarenessUpdateHandler = (
      { added, updated, removed }: { added: any[]; updated: any[]; removed: any[] },
      origin: any,
    ) => {
      const changedClients = added.concat(updated).concat(removed);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients),
      );
      broadcastMessage(this, encoding.toUint8Array(encoder));
    };
    this._exitHandler = () => {
      awarenessProtocol.removeAwarenessStates(this.awareness, [doc.clientID], "window unload");
    };
    if (!disableBc) {
      bc.subscribe(this.bcChannel, this._bcSubscriber);
      this.bcconnected = true;
    } else {
      this.bcconnected = false;
    }
    doc.on("update", this._updateHandler);
    awareness.on("update", this._awarenessUpdateHandler);

    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", this._exitHandler);
    }

    if (connect) {
      this.connect();
    }
  }

  get url(): string {
    const encodedParams = url.encodeQueryParams(this.params);
    return (
      this.serverUrl + "/" + this.roomname + (encodedParams.length === 0 ? "" : "?" + encodedParams)
    );
  }

  get synced(): boolean {
    return this._synced;
  }

  set synced(state: boolean) {
    if (this._synced !== state) {
      this._synced = state;
      this.emit("synced", [state]);
      this.emit("sync", [state]);
    }
  }

  connect(): void {
    this.shouldConnect = true;
    if (!this.wsconnected && !this.wsconnecting) {
      setupWS(this);
    }
  }

  disconnect(): void {
    this.shouldConnect = false;
    if (this.ws !== null) {
      this.ws.close();
    }
    if (this.bcconnected) {
      bc.unsubscribe(this.bcChannel, this._bcSubscriber);
      this.bcconnected = false;
    }
  }

  destroy(): void {
    this.disconnect();
    if (typeof window !== "undefined") {
      window.removeEventListener("beforeunload", this._exitHandler);
    }
    if (this._resyncInterval !== 0) {
      clearInterval(this._resyncInterval);
    }
    this.doc.off("update", this._updateHandler);
    this.awareness.off("update", this._awarenessUpdateHandler);
    awarenessProtocol.removeAwarenessStates(this.awareness, [this.doc.clientID], "destroy");
  }
}

export default WebsocketProvider;
