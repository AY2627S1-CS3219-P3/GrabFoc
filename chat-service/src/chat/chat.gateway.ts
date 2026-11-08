/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
 * Scope: Generated from the chat plan
 * Author review: Reviewed by Deanson, 2026-11-09.
 */
import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { config } from '../config';
import { describeError, GetHistory, GetMissedMessages, SendMessage } from './chat.schemas';
import { ChatService, Message } from './chat.service';
import { verifyTicket } from './ticket';

interface ChatSocketData {
  userId: string;
  orderId: string;
}
type ChatSocket = Socket<any, any, any, ChatSocketData>;

type Ack<T> = ({ ok: true } & T) | { ok: false; error: string };

const room = (orderId: string) => `order:${orderId}`;

// WebSocket only (the chat plan): no long polling, so no CORS setting is needed.
@WebSocketGateway({
  transports: ['websocket'],
  maxHttpBufferSize: 16_000,
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly access = new Logger('Access');
  private readonly logger = new Logger('Chat');

  constructor(private readonly chat: ChatService) {}

  /** Runs before a connection is accepted. On failure, the client gets 'connect_error'. */
  afterInit(server: Server) {
    server.use((socket, next) => {
      verifyTicket(socket.handshake.auth?.ticket, config.ticketSecret).then(
        ({ userId, orderId }) => {
          // The ticket is only checked here, so a connection outlives it (an accepted gap in the chat plan).
          socket.data.userId = userId;
          socket.data.orderId = orderId;
          next();
        },
        (err: Error) => {
          // Order's UNAUTHORISED_ACCESS format without `status`: a socket refusal has none. [Open]
          this.access.warn(
            JSON.stringify({
              event: 'UNAUTHORISED_ACCESS',
              timestamp: new Date().toISOString(),
              code: 'unauthorized',
              method: 'GET',
              path: '/socket.io/',
              userId: null,
            }),
          );
          next(err);
        },
      );
    });
  }

  async handleConnection(client: ChatSocket) {
    await client.join(room(client.data.orderId));
  }

  // Logging only: Socket.IO removes sockets from rooms itself.
  handleDisconnect(client: ChatSocket) {
    this.logger.debug(`Socket ${client.id} left ${room(client.data.orderId ?? 'none')}`);
  }

  @SubscribeMessage('getHistory')
  getHistory(@ConnectedSocket() client: ChatSocket, @MessageBody() body: unknown) {
    const parsed = GetHistory.safeParse(body ?? {});
    if (!parsed.success) return { ok: false, error: describeError(parsed.error) };
    return this.run('getHistory', async () => ({
      messages: await this.chat.getMessagesBefore(client.data.orderId, parsed.data.beforeId),
    }));
  }

  @SubscribeMessage('getMissedMessages')
  getMissedMessages(@ConnectedSocket() client: ChatSocket, @MessageBody() body: unknown) {
    const parsed = GetMissedMessages.safeParse(body);
    if (!parsed.success) return { ok: false, error: describeError(parsed.error) };
    return this.run('getMissedMessages', async () => ({
      messages: await this.chat.getMessagesAfter(client.data.orderId, parsed.data.afterId),
    }));
  }

  @SubscribeMessage('sendMessage')
  sendMessage(@ConnectedSocket() client: ChatSocket, @MessageBody() body: unknown) {
    const parsed = SendMessage.safeParse(body);
    if (!parsed.success) return { ok: false, error: describeError(parsed.error) };
    // Identity comes from the ticket only, never the message body.
    const { userId, orderId } = client.data;
    return this.run('sendMessage', async () => {
      // Saved before anyone is told about it.
      const message: Message = await this.chat.saveMessage(orderId, userId, parsed.data.clientMsgId, parsed.data.content);
      // Emitted on retries too: the first attempt may have saved without emitting. Clients merge by id.
      client.to(room(orderId)).emit('newMessage', message);
      return { message };
    });
  }

  /**
   * Unexpected failures (e.g. the database is down) send no ack, so the client times out and can
   * retry. Returning undefined makes Nest skip the ack. Only the error's code is logged: never
   * message content or tickets.
   */
  private async run<T extends object>(event: string, work: () => Promise<T>): Promise<Ack<T> | undefined> {
    try {
      return { ok: true, ...(await work()) };
    } catch (err) {
      const code = (err as { code?: string }).code ?? (err as Error).name;
      this.logger.error(`${event} failed (${code})`);
      return undefined;
    }
  }
}
