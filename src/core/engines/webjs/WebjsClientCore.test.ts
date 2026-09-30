import 'reflect-metadata';
import { EventEmitter } from 'events';
import { WebjsClientCore } from './WebjsClientCore';

jest.mock('puppeteer', () => ({}));
jest.mock('whatsapp-web.js/src/structures', () => ({}));
jest.mock('whatsapp-web.js/src/factories/ChatFactory', () => ({}));
jest.mock('whatsapp-web.js', () => ({
  Client: class extends EventEmitter {
    pupPage: any;

    sendMessage(chatId: string, content: any, options: any) {
      return Promise.resolve({
        id: { id: 'sent-id' },
        chatId: chatId,
        content: content,
        options: options,
      });
    }
  },
  Events: { AUTHENTICATED: 'authenticated', READY: 'ready' },
}));

describe('WebjsClientCore upstream adapter', () => {
  const logger = { error: jest.fn(), debug: jest.fn() } as any;

  it('publishes the sent message ID from the upstream send result', async () => {
    const client = new WebjsClientCore({}, false, logger);
    const sent = jest.fn();
    client.events.on('message.id', sent);

    await client.sendMessage('123@c.us', 'hello');

    expect(sent).toHaveBeenCalledWith({ id: 'sent-id' });
  });

  it('reports the ID before sending an API message', async () => {
    const client = new WebjsClientCore({}, false, logger);
    const oldWindow = globalThis.window;
    const messageKey = { newId: jest.fn().mockResolvedValue('new-id') };
    const idReceived = jest.fn();
    const sendMessage = jest.fn(async () => {
      await messageKey.newId();
      expect(idReceived).toHaveBeenCalledWith({ id: 'new-id' });
      return 'sent';
    });
    const wweb: any = { sendMessage: sendMessage };
    (globalThis as any).window = {
      WWebJS: wweb,
      require: (module: string) => {
        if (module === 'WAWebMsgKey') return messageKey;
        if (module === 'WAWebCmd') return { Cmd: { on: jest.fn() } };
        throw new Error(`Unexpected module: ${module}`);
      },
    };
    client.pupPage = {
      evaluate: jest.fn(async (fn, ...args) => fn(...args)),
      exposeFunction: jest.fn(async (name, fn) => {
        (globalThis.window as any)[name] = fn;
      }),
    } as any;
    jest.spyOn(client, 'attachPresenceEvents').mockResolvedValue(undefined);
    client.events.on('message.id', idReceived);

    try {
      await client.attachCustomEventListeners();
      await wweb.sendMessage('123@c.us', 'hello');
      expect(idReceived).toHaveBeenCalledWith({ id: 'new-id' });
      await messageKey.newId();
      expect(idReceived).toHaveBeenCalledTimes(1);
    } finally {
      (globalThis as any).window = oldWindow;
    }
  });

  it('preserves group receipt events when tag listening is enabled', async () => {
    const client = new WebjsClientCore({}, true, logger);
    const oldWindow = globalThis.window;
    const wweb: any = { sendMessage: jest.fn() };
    (globalThis as any).window = {
      WWebJS: wweb,
      require: (module: string) => {
        if (module === 'WAWebMsgKey') return { newId: jest.fn() };
        if (module === 'WAWebCmd') return { Cmd: { on: jest.fn() } };
        throw new Error(`Unexpected module: ${module}`);
      },
    };
    client.pupPage = {
      evaluate: jest.fn(async (fn, ...args) => fn(...args)),
      exposeFunction: jest.fn(async (name, fn) => {
        (globalThis.window as any)[name] = fn;
      }),
    } as any;
    jest.spyOn(client, 'attachPresenceEvents').mockResolvedValue(undefined);
    jest.spyOn(client, 'attachTagsEvents').mockResolvedValue(undefined);
    const onReceipt = jest.fn();
    client.on('tag:receipt', onReceipt);

    try {
      await client.attachCustomEventListeners();
      const receipt = { tag: 'receipt', attrs: { id: 'sent-id' } };
      (globalThis.window as any).onTag(receipt);
      expect(onReceipt).toHaveBeenCalledWith(receipt);
    } finally {
      (globalThis as any).window = oldWindow;
    }
  });

  it('provides serialization for both Wids and message keys inside the page', async () => {
    const client = new WebjsClientCore({}, false, logger);
    const oldWindow = globalThis.window;
    const wweb: any = {};
    (globalThis as any).window = { WWebJS: wweb };
    client.pupPage = {
      evaluate: jest.fn(async (fn) => {
        if (fn.length === 0) return fn();
      }),
    } as any;

    try {
      await client.injectWaha();
      expect(wweb.GetSerialized({ user: '123', server: 'c.us' })).toBe(
        '123@c.us',
      );
      expect(
        wweb.GetSerialized({
          fromMe: true,
          remote: { user: '123', server: 'c.us' },
          id: 'ABC',
        }),
      ).toBe('true_123@c.us_ABC');
    } finally {
      (globalThis as any).window = oldWindow;
    }
  });
});
