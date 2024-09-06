import { IConfig } from "../config";
import { IConnector } from "./connection";
import { YWebSocketConnector } from "./yjs/YJSConnector";

export class ConnectionFactory {
  constructor(private config: IConfig) {}

  create(): IConnector {
    if (this.config.getParamSting("connector") === "y-websocket") {
      return new YWebSocketConnector(this.config.getParamSting("webSocketServerURL"));
    }
    throw new Error("Connector not found");
  }
}
