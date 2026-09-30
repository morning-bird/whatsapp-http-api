import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { SendPollInput } from '@waha/apps/mcp/tools/send.zod';
import { WhatsappSessionWebJSCore } from '@waha/core/engines/webjs/session.webjs.core';
import { MessagePollRequest } from '@waha/structures/chatting.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

jest.mock('@waha/core/engines/noweb/session.noweb.core', () => ({
  getDestination: jest.fn(),
  getFromToParticipant: jest.fn(),
}));
jest.mock('@waha/core/engines/webjs/WebjsClientCore', () => ({
  WebjsClientCore: class {},
  WebjsExtraEvents: {
    TAG_RECEIPT: 'tag:receipt',
    REACHOUT_TIMELOCK_UPDATE: 'reachout_timelock_update',
    MESSAGE_CAPPING_UPDATE: 'message_capping_update',
  },
}));
jest.mock('whatsapp-web.js', () => ({
  Poll: require('whatsapp-web.js/src/structures/Poll'),
  Events: {},
  MessageTypes: {},
}));
jest.mock('puppeteer', () => ({
  ProtocolError: class ProtocolError extends Error {},
}));

describe('WEBJS poll endTime', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    (globalThis as any).window = originalWindow;
  });

  function createSession(enabled: boolean) {
    const session = Object.create(WhatsappSessionWebJSCore.prototype) as any;
    const sendMessage = jest.fn().mockResolvedValue({ id: 'sent' });
    const evaluate = jest.fn(async (callback, chatId) => {
      (globalThis as any).window = {
        require: (module: string) => {
          if (module === 'WAWebWidFactory') {
            return { createWid: (id: string) => id };
          }
          if (module === 'WAWebPollsGatingUtils') {
            return {
              isPollEndTimeSendingEnabled: (id: string) =>
                enabled && id === '123@c.us',
            };
          }
          throw new Error(`Unknown module ${module}`);
        },
      };
      return callback(chatId);
    });
    session.whatsapp = {
      sendMessage: sendMessage,
      pupPage: { evaluate: evaluate },
    };
    session.hooks = {
      activity: { promise: jest.fn().mockResolvedValue(undefined) },
      wid: { chat: { promise: jest.fn().mockResolvedValue('123@c.us') } },
    };
    return { session: session, sendMessage: sendMessage, evaluate: evaluate };
  }

  function request(endTime?: number): MessagePollRequest {
    return {
      session: 'default',
      chatId: '123@c.us',
      poll: {
        name: 'Question',
        options: ['Yes', 'No'],
        multipleAnswers: false,
        endTime: endTime,
      },
    } as MessagePollRequest;
  }

  it('sends a regular poll without checking the end-time feature', async () => {
    const { session, sendMessage, evaluate } = createSession(false);

    await session.sendPoll(request());

    expect(evaluate).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(
      '123@c.us',
      expect.objectContaining({ pollName: 'Question' }),
      expect.not.objectContaining({ extra: expect.anything() }),
    );
  });

  it('sends an enabled poll end time in milliseconds', async () => {
    const endTime = Date.now() + 3_600_000;
    const { session, sendMessage } = createSession(true);

    await session.sendPoll(request(endTime));

    expect(sendMessage).toHaveBeenCalledWith(
      '123@c.us',
      expect.objectContaining({ pollName: 'Question' }),
      expect.objectContaining({ extra: { pollEndTime: endTime } }),
    );
  });

  it('rejects an unsupported or expired end time before sending', async () => {
    const { session, sendMessage } = createSession(false);

    await expect(
      session.sendPoll(request(Date.now() + 3_600_000)),
    ).rejects.toThrow(BadRequestException);
    await expect(
      session.sendPoll(request(Date.now() - 1)),
    ).rejects.toThrow(BadRequestException);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('validates an optional millisecond timestamp in HTTP and MCP inputs', async () => {
    const valid = plainToInstance(
      MessagePollRequest,
      request(Date.now() + 3_600_000),
    );
    expect(await validate(valid)).toHaveLength(0);

    const invalid = plainToInstance(MessagePollRequest, request(1.5));
    expect(await validate(invalid)).not.toHaveLength(0);

    const schema = SendPollInput.shape.poll;
    expect(
      schema.safeParse({ name: 'Question', options: ['Yes', 'No'] }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        name: 'Question',
        options: ['Yes', 'No'],
        endTime: 1.5,
      }).success,
    ).toBe(false);
  });
});
