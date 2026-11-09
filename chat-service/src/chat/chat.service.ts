/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
 * Scope: Generated from the chat plan
 * Author review: Reviewed by Deanson, 2026-11-09.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../db/database';

interface MessageRow {
  id: number;
  order_id: string;
  sender_id: string;
  client_msg_id: string;
  content: string;
  created_at: Date;
}

/** A message as clients see it: camelCase, like Order's API. */
export interface Message {
  id: number;
  orderId: string;
  senderId: string;
  clientMsgId: string;
  content: string;
  createdAt: Date;
}

const toMessage = (row: MessageRow): Message => ({
  id: row.id,
  orderId: row.order_id,
  senderId: row.sender_id,
  clientMsgId: row.client_msg_id,
  content: row.content,
  createdAt: row.created_at,
});

export const PAGE_SIZE = 50;

@Injectable()
export class ChatService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Safe to retry: the same clientMsgId returns the original row. */
  async saveMessage(orderId: string, senderId: string, clientMsgId: string, content: string): Promise<Message> {
    const inserted = await this.pool.query<MessageRow>(
      `INSERT INTO messages (order_id, sender_id, client_msg_id, content)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (order_id, sender_id, client_msg_id) DO NOTHING
       RETURNING *`,
      [orderId, senderId, clientMsgId, content],
    );
    if (inserted.rows[0]) return toMessage(inserted.rows[0]);

    const existing = await this.pool.query<MessageRow>(
      `SELECT * FROM messages WHERE order_id = $1 AND sender_id = $2 AND client_msg_id = $3`,
      [orderId, senderId, clientMsgId],
    );
    return toMessage(existing.rows[0]);
  }

  /** One page after afterId, oldest first. Used to catch up after a reconnect. */
  async getMessagesAfter(orderId: string, afterId: number, limit = PAGE_SIZE): Promise<Message[]> {
    const { rows } = await this.pool.query<MessageRow>(
      `SELECT * FROM messages WHERE order_id = $1 AND id > $2 ORDER BY id LIMIT $3`,
      [orderId, afterId, limit],
    );
    return rows.map(toMessage);
  }

  /** The newest page before beforeId (or the newest page overall), returned oldest first. */
  async getMessagesBefore(orderId: string, beforeId?: number, limit = PAGE_SIZE): Promise<Message[]> {
    const { rows } = await this.pool.query<MessageRow>(
      `SELECT * FROM messages
       WHERE order_id = $1 AND ($2::bigint IS NULL OR id < $2)
       ORDER BY id DESC
       LIMIT $3`,
      [orderId, beforeId ?? null, limit],
    );
    return rows.reverse().map(toMessage);
  }
}
