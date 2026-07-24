import { Injectable, Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { JwtService } from "@nestjs/jwt";

interface SyncPayload {
  type: string;
  entityType: "resource" | "folder";
  entityId: string;
  data?: unknown;
}

@WebSocketGateway({
  namespace: "/sync",
  cors: { origin: "*", credentials: true },
})
@Injectable()
export class SyncGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SyncGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.headers?.authorization as string)?.replace("Bearer ", "");

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const userId = payload.sub;
      const orgId = payload.orgId;

      client.data.userId = userId;
      client.data.orgId = orgId;

      client.join(`user:${userId}`);
      client.join(`org:${orgId}`);

      this.logger.log(`Client connected: user=${userId}`);
    } catch {
      this.logger.warn("Unauthorized WebSocket connection rejected");
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    if (client.data.userId) {
      this.logger.log(`Client disconnected: user=${client.data.userId}`);
    }
  }

  emitToUser(userId: string, payload: SyncPayload) {
    this.server.to(`user:${userId}`).emit("sync", payload);
  }

  emitToOrg(orgId: string, payload: SyncPayload) {
    this.server.to(`org:${orgId}`).emit("sync", payload);
  }

  emitToUsers(userIds: string[], payload: SyncPayload) {
    if (userIds.length === 0) return;
    const rooms = userIds.map((id) => `user:${id}`);
    this.server.to(rooms).emit("sync", payload);
  }

  @SubscribeMessage("ping")
  handlePing(@ConnectedSocket() client: Socket, @MessageBody() data: unknown) {
    return { pong: data };
  }
}
