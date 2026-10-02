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
  function createSession(chatId = '123@c.us') {
    const session = Object.create(WhatsappSessionWebJSCore.prototype) as any;
    const sendMessage = jest.fn().mockResolvedValue({ id: 'sent' });
    const evaluate = jest
      .fn()
      .mockRejectedValue(
        new Error('Internal feature-support pre-check must not run'),
      );
    session.whatsapp = {
      sendMessage: sendMessage,
      pupPage: { evaluate: evaluate },
    };
    session.hooks = {
      activity: { promise: jest.fn().mockResolvedValue(undefined) },
      wid: { chat: { promise: jest.fn().mockResolvedValue(chatId) } },
    };
    return { session: session, sendMessage: sendMessage, evaluate: evaluate };
  }

  function request(endTime?: number, chatId = '123@c.us'): MessagePollRequest {
    return {
      session: 'default',
      chatId: chatId,
      poll: {
        name: 'Question',
        options: ['Yes', 'No'],
        multipleAnswers: false,
        endTime: endTime,
      },
    } as MessagePollRequest;
  }

  it('sends a regular poll without checking the end-time feature', async () => {
    const { session, sendMessage, evaluate } = createSession();

    await session.sendPoll(request());

    expect(evaluate).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(
      '123@c.us',
      expect.objectContaining({ pollName: 'Question' }),
      expect.not.objectContaining({ extra: expect.anything() }),
    );
  });

  it('sends a group poll end time in milliseconds without a feature pre-check', async () => {
    const endTime = Date.now() + 3_600_000;
    const { session, sendMessage, evaluate } = createSession('123@g.us');

    await session.sendPoll(request(endTime, '123@g.us'));

    expect(evaluate).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(
      '123@g.us',
      expect.objectContaining({ pollName: 'Question' }),
      expect.objectContaining({ extra: { pollEndTime: endTime } }),
    );
  });

  it.each(['123@c.us', '123@lid', '123@newsletter', 'status@broadcast'])(
    'rejects an end time for non-group destination %s before sending',
    async (chatId) => {
      const { session, sendMessage, evaluate } = createSession(chatId);

      await expect(
        session.sendPoll(request(Date.now() + 3_600_000, chatId)),
      ).rejects.toThrow('poll.endTime is only allowed for group chats (@g.us)');
      expect(sendMessage).not.toHaveBeenCalled();
      expect(evaluate).not.toHaveBeenCalled();
    },
  );

  it('validates the resolved destination before sending an end time', async () => {
    const { session, sendMessage } = createSession('123@c.us');

    await expect(
      session.sendPoll(request(Date.now() + 3_600_000, '123@g.us')),
    ).rejects.toThrow('poll.endTime is only allowed for group chats (@g.us)');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('rejects an expired end time for a group before sending', async () => {
    const { session, sendMessage } = createSession('123@g.us');

    await expect(
      session.sendPoll(request(Date.now() - 1, '123@g.us')),
    ).rejects.toThrow(BadRequestException);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('propagates the original sending error for a group poll with an end time', async () => {
    const { session, sendMessage } = createSession('123@g.us');
    const error = new Error('WhatsApp rejected the poll');
    sendMessage.mockRejectedValue(error);

    await expect(
      session.sendPoll(request(Date.now() + 3_600_000, '123@g.us')),
    ).rejects.toBe(error);
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
