import * as vscode from "vscode";
import * as fs from "fs";
import { ConnAuthInfo, IConnector } from "../connector/connection";
import { BaseObservable } from "../core/observable";
import { DockerService } from "../runner/dockerService";
import { input } from "../utils";
import { Session, SessionListener } from "./session";

/**
 * Manage peer code session by initiating connection using the provided IConnector
 */
export class SessionManager extends BaseObservable<SessionListener> {
  private sessions: Session[] = [];

  constructor(private connector: IConnector) {
    super();
  }

  /**
   * Create peer code session by initiating connection to the provided connector
   * @param dockerService
   * @param isSessionOwner whereas the user is owner of the session
   * @returns the created session
   */
  async createSession(
    dockerService: DockerService,
    isSessionOwner: boolean = false,
  ): Promise<Session> {
    const authInfo = await getSessionInfo(this.connector.supportsPassword());
    const conn = await this.connector.connect(authInfo, isSessionOwner);
    const session = conn.getSession();
    dockerService.listenToDockerRun(session.provider.getProvider(), session);

    // Add the session in the session list
    this.sessions.push(session);
    this.notify(listener => listener.onAddSession(session));
    return session;
  }

  getSessions(): Session[] {
    return this.sessions;
  }
}

async function getSessionInfo(needPassword: boolean): Promise<ConnAuthInfo> {
  const roomName = await input(async () => {
    return vscode.window.showInputBox({ prompt: "Enter Room" });
  });

  const username = await input(async () => {
    return vscode.window.showInputBox({ prompt: "Enter your username" });
  });

  if (needPassword) {
    const password = await input(async () => {
      return vscode.window.showInputBox({
        prompt: "Enter room password",
        password: true,
      });
    });
    return new ConnAuthInfo(username, roomName, password);
  }

  return new ConnAuthInfo(username, roomName);
}
