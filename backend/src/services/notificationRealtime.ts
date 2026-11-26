import type { Server as HttpServer, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.ts';
import { User } from '../models/User.ts';
import type { JwtPayload } from '../middleware/auth.ts';

interface AliveWebSocket extends WebSocket {
  isAlive?: boolean;
  userId?: string;
}

const userSockets = new Map<string, Set<AliveWebSocket>>();
let wss: WebSocketServer | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

function isAllowedWsOrigin(req: IncomingMessage): boolean {
  if (!env.isProduction) return true;
  const rawOrigin = typeof req.headers.origin === 'string' ? req.headers.origin.trim().replace(/\/+$/, '') : '';
  if (!rawOrigin) return false;
  return rawOrigin !== '*' && env.corsOrigins.includes(rawOrigin);
}

export async function authenticateWsRequest(req: IncomingMessage): Promise<string | null> {
  try {
    let queryToken = '';
    if (req.url && req.url.includes('?')) {
      try {
        const parsedUrl = new URL(req.url, 'http://localhost');
        queryToken = parsedUrl.searchParams.get('token')?.trim() || '';
      } catch {
        queryToken = '';
      }
    }

    const authHeader =
      typeof req.headers?.authorization === 'string' ? req.headers.authorization : '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    const cookies = parseCookies(req.headers?.cookie);
    const token = queryToken || bearerToken || cookies.zipit_token;
    if (!token) return null;

    const decoded = jwt.verify(token, env.jwtSecret) as JwtPayload;
    const user = await User.findById(decoded.userId).select('_id isActive tokenVersion').lean();
    if (!user || !user.isActive) return null;
    if ((decoded.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
      return null;
    }
    return user._id.toString();
  } catch {
    return null;
  }
}

export function attachNotificationWebSocketServer(server: HttpServer): void {
  if (wss) return;

  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (req, socket, head) => {
    const urlPath = (req.url || '').split('?')[0];
    if (urlPath !== '/ws/notifications') {
      return;
    }

    if (!isAllowedWsOrigin(req)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    const userId = await authenticateWsRequest(req);
    if (!userId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss!.handleUpgrade(req, socket, head, (ws) => {
      wss!.emit('connection', ws, req, userId);
    });
  });

  wss.on('connection', (ws: AliveWebSocket, _req: IncomingMessage, userId: string) => {
    ws.isAlive = true;
    ws.userId = userId;

    let set = userSockets.get(userId);
    if (!set) {
      set = new Set();
      userSockets.set(userId, set);
    }
    set.add(ws);

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('close', () => {
      const current = userSockets.get(userId);
      if (current) {
        current.delete(ws);
        if (current.size === 0) {
          userSockets.delete(userId);
        }
      }
    });

    ws.on('error', () => {
      // Handled safely via close cleanup
    });

    try {
      ws.send(JSON.stringify({ type: 'notifications:ready' }));
    } catch {
      // Ignore closed socket
    }
  });

  heartbeatTimer = setInterval(() => {
    if (!wss) return;
    for (const client of wss.clients) {
      const aliveClient = client as AliveWebSocket;
      if (aliveClient.isAlive === false) {
        aliveClient.terminate();
        continue;
      }
      aliveClient.isAlive = false;
      try {
        aliveClient.ping();
      } catch {
        // Ignore ping errors
      }
    }
  }, 30_000);
}

export function pushNotificationEventToUser(userId: string, payload: Record<string, unknown>): void {
  const sockets = userSockets.get(userId);
  if (!sockets || sockets.size === 0) return;

  const serialized = JSON.stringify(payload);
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(serialized);
      } catch {
        // Ignore transient write errors
      }
    }
  }
}

export function closeNotificationWebSocketServer(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (wss) {
    wss.close();
    wss = null;
  }
  userSockets.clear();
}
