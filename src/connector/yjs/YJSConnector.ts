import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

import { ConnAuthInfo, IConnection, IConnector } from "../connection";
import { SocketProvider } from "./provider";
import { YjsConnection } from "./YJSConnection";

export abstract class YjsConnector implements IConnector {
  supportsPassword(): boolean {
    return false;
  }

  abstract connect(authInfo: ConnAuthInfo, isOwner: boolean): Promise<IConnection>;
}

export class YWebSocketConnector extends YjsConnector {
  constructor(private wsServerUrl: string) {
    super();
  }

  async connect(authInfo: ConnAuthInfo, isOwner: boolean): Promise<IConnection> {
    console.debug(
      "connecting via websocket to " +
        this.wsServerUrl +
        " room: " +
        authInfo.room +
        " username: " +
        authInfo.username,
    );
    const ydoc = new Y.Doc();
    const provider = new WebsocketProvider(this.wsServerUrl, authInfo.room, ydoc, {
      WebSocketPolyfill: require("ws"), // eslint-disable-line
    });

    await this.awaitConnection(provider);

    console.debug("Connected to:" + authInfo.room);

    return new YjsConnection(
      new SocketProvider(provider),
      ydoc,
      authInfo.username,
      authInfo.room,
      isOwner,
    );
  }

  private awaitConnection(provider: WebsocketProvider): Promise<void> {
    return new Promise<void>((resolve, _reject) => {
      provider.on("status", (event: { status: string }) => {
        const status = event.status;
        console.debug("status on ws connect:" + status);
        if (status === "connected") {
          resolve();
        }
      });
    });
  }

  supportsPassword(): boolean {
    return true;
  }
}
