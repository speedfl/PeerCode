import * as vscode from 'vscode';
import { input } from '../utils';
import { BaseObservable } from '../core/observable';
import { IConnector } from '../connector/conn';
import { Session, SessionListener } from './session';

export class SessionManager extends BaseObservable<SessionListener> {
    
    private sessions: Session[] = [];

    constructor(private connector: IConnector) {
        super();
     }


    async createSession() : Promise<Session> {
        let { username, roomname } = await getSessionInfo();

        let conn = await this.connector.connect(username, roomname);
        const session = conn.getSession();
        this.addSession(session);
        return session;
    }

    addSession(session: Session) {
        this.sessions.push(session);
        this.notify(async (listener) => listener.onAddSession(session));
    }

    getConnections(): Session[] {
        return this.sessions;
    }
    
    async joinSession() {
        await this.createSession();
    }

}


async function getSessionInfo() {
    let roomname = await input(async () => {
        return vscode.window.showInputBox(
            { prompt: 'Enter Room' }
        );
    });

    let username = await input(async () => {
        return vscode.window.showInputBox(
            { prompt: 'Enter your username' }
        );
    });
    return { username, roomname };
}
