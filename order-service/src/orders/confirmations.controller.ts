/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated the /orders/:orderId/confirmations routes from order-service-plan.md §3 (Phase C).
 * Author review: Reviewed
 */
import { Body, Controller, Get, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { Caller, CurrentUser } from '../common/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ConfirmationsService } from './confirmations.service';
import { OrderIdParam, ProposeBody, RespondBody } from './orders.schemas';

const uuid = new ZodValidationPipe(OrderIdParam);

@Controller('orders/:orderId/confirmations')
export class ConfirmationsController {
  constructor(private readonly confirmations: ConfirmationsService) {}

  /** Pending and resolved proposals, oldest first. */
  @Get()
  async list(@CurrentUser() caller: Caller, @Param('orderId', uuid) orderId: string) {
    return { items: await this.confirmations.list(caller, orderId) };
  }

  @Post()
  propose(
    @CurrentUser() caller: Caller,
    @Headers('authorization') authorization: string,
    @Param('orderId', uuid) orderId: string,
    @Body(new ZodValidationPipe(ProposeBody)) body: ProposeBody,
  ) {
    return this.confirmations.propose(caller, authorization, orderId, body);
  }

  @Post(':confirmationId/respond')
  @HttpCode(200)
  respond(
    @CurrentUser() caller: Caller,
    @Param('orderId', uuid) orderId: string,
    @Param('confirmationId', uuid) confirmationId: string,
    @Body(new ZodValidationPipe(RespondBody)) { response }: RespondBody,
  ) {
    return this.confirmations.respond(caller, orderId, confirmationId, response);
  }
}
