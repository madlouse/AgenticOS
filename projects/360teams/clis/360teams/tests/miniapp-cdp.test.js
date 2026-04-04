import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cdpFactory = vi.fn();
cdpFactory.List = vi.fn();

const ensureDebugMode = vi.fn();

vi.mock('chrome-remote-interface', () => ({
  default: cdpFactory,
}));

vi.mock('../launcher.js', () => ({
  ensureDebugMode,
}));

const miniapp = await import('../miniapp-cdp.js');

function makeRuntimeClient(runtimeResponses = [{ result: { value: null } }]) {
  const Runtime = {
    enable: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn(),
  };
  for (const response of runtimeResponses) {
    if (response instanceof Error || typeof response === 'string') {
      Runtime.evaluate.mockRejectedValueOnce(response);
    } else {
      Runtime.evaluate.mockResolvedValueOnce(response);
    }
  }
  const client = {
    Runtime,
    close: vi.fn().mockResolvedValue(undefined),
  };
  return { client, Runtime };
}

function makeIframeClient({
  frameTrees = [],
  createIsolatedWorld = [{ executionContextId: 42 }],
  runtimeResponses = [{ result: { value: 'main' } }, { result: { value: 'iframe' } }],
} = {}) {
  const Page = {
    enable: vi.fn().mockResolvedValue(undefined),
    getFrameTree: vi.fn(),
    createIsolatedWorld: vi.fn(),
  };
  for (const frameTree of frameTrees) {
    Page.getFrameTree.mockResolvedValueOnce({ frameTree });
  }
  if (!frameTrees.length) {
    Page.getFrameTree.mockResolvedValue({
      frameTree: { frame: { id: 'root', url: 'https://root' }, childFrames: [] },
    });
  }
  for (const response of createIsolatedWorld) {
    Page.createIsolatedWorld.mockResolvedValueOnce(response);
  }

  const Runtime = {
    enable: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn(),
  };
  for (const response of runtimeResponses) {
    if (response instanceof Error || typeof response === 'string') {
      Runtime.evaluate.mockRejectedValueOnce(response);
    } else {
      Runtime.evaluate.mockResolvedValueOnce(response);
    }
  }

  const client = {
    Page,
    Runtime,
    close: vi.fn().mockResolvedValue(undefined),
  };
  return { client, Page, Runtime };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('connectToTarget', () => {
  it('evaluates expressions through Runtime and returns the client', async () => {
    const { client, Runtime } = makeRuntimeClient([{ result: { value: 'ok' } }]);
    cdpFactory.mockResolvedValueOnce(client);

    const connected = await miniapp.connectToTarget('target-1');
    await expect(connected.page.evaluate('1 + 1')).resolves.toBe('ok');
    expect(Runtime.enable).toHaveBeenCalledTimes(1);
    expect(cdpFactory).toHaveBeenCalledWith({ host: 'localhost', port: 9234, target: 'target-1' });
    expect(connected._client).toBe(client);
  });

  it('throws the CDP exception message when evaluation fails', async () => {
    const { client } = makeRuntimeClient([{ result: {}, exceptionDetails: { text: 'Boom' } }]);
    cdpFactory.mockResolvedValueOnce(client);

    const connected = await miniapp.connectToTarget('target-2');
    await expect(connected.page.evaluate('bad()')).rejects.toThrow('Boom');
  });

  it('prefers exception descriptions from CDP evaluation failures', async () => {
    const { client } = makeRuntimeClient([
      { result: {}, exceptionDetails: { exception: { description: 'Detailed boom' } } },
    ]);
    cdpFactory.mockResolvedValueOnce(client);

    const connected = await miniapp.connectToTarget('target-3');
    await expect(connected.page.evaluate('bad()')).rejects.toThrow('Detailed boom');
  });

  it('falls back to Unknown CDP error when no error detail exists', async () => {
    const { client } = makeRuntimeClient([{ result: {}, exceptionDetails: {} }]);
    cdpFactory.mockResolvedValueOnce(client);

    const connected = await miniapp.connectToTarget('target-4');
    await expect(connected.page.evaluate('bad()')).rejects.toThrow('Unknown CDP error');
  });
});

describe('findMiniappTarget', () => {
  it('prefers webview targets over page targets', async () => {
    cdpFactory.List.mockResolvedValueOnce([
      { id: 'page-1', type: 'page', url: 'https://app.example.com/foo' },
      { id: 'webview-1', type: 'webview', url: 'https://app.example.com/foo' },
    ]);

    const target = await miniapp.findMiniappTarget('foo');
    expect(target.id).toBe('webview-1');
  });

  it('returns null when nothing matches', async () => {
    cdpFactory.List.mockResolvedValueOnce([
      { id: 'other', type: 'page', url: 'https://app.example.com/bar' },
    ]);

    await expect(miniapp.findMiniappTarget('foo')).resolves.toBeNull();
  });

  it('falls back to a page target when no webview exists', async () => {
    cdpFactory.List.mockResolvedValueOnce([
      { id: 'page-2', type: 'page', url: 'https://app.example.com/foo' },
    ]);

    const target = await miniapp.findMiniappTarget('foo');
    expect(target.id).toBe('page-2');
  });
});

describe('findMainChatTarget', () => {
  it('returns the main chat page target', async () => {
    cdpFactory.List.mockResolvedValueOnce([
      { id: 't1', type: 'page', url: 'https://localhost:33013/#/main/chat' },
      { id: 't2', type: 'webview', url: 'https://other.example.com' },
    ]);

    const target = await miniapp.findMainChatTarget();
    expect(target.id).toBe('t1');
  });
});

describe('withMiniappTarget', () => {
  it('throws when the miniapp is not open', async () => {
    ensureDebugMode.mockResolvedValueOnce(undefined);
    cdpFactory.List.mockResolvedValueOnce([]);

    await expect(miniapp.withMiniappTarget('foo', 'Foo', async () => null))
      .rejects.toThrow('Foo is not open. Please open Foo first.');
    expect(ensureDebugMode).toHaveBeenCalledTimes(1);
  });

  it('connects to an existing target and closes the client afterwards', async () => {
    ensureDebugMode.mockResolvedValueOnce(undefined);
    cdpFactory.List.mockResolvedValueOnce([
      { id: 'target-3', type: 'webview', url: 'https://app.example.com/foo' },
    ]);
    const { client } = makeRuntimeClient([{ result: { value: 'from-page' } }]);
    cdpFactory.mockResolvedValueOnce(client);

    const result = await miniapp.withMiniappTarget('foo', 'Foo', async (page) => page.evaluate('window.value'));
    expect(result).toBe('from-page');
    expect(client.close).toHaveBeenCalledTimes(1);
  });
});

describe('openMiniappAndConnect', () => {
  const opts = {
    urlPattern: 'foo',
    sidenavText: 'Foo',
    friendlyName: 'Foo',
    timeout: 1000,
  };

  it('connects immediately when the miniapp is already open', async () => {
    ensureDebugMode.mockResolvedValueOnce(undefined);
    cdpFactory.List.mockResolvedValueOnce([
      { id: 'target-4', type: 'webview', url: 'https://app.example.com/foo' },
    ]);
    const { client } = makeRuntimeClient([{ result: { value: 'ready' } }]);
    cdpFactory.mockResolvedValueOnce(client);

    const result = await miniapp.openMiniappAndConnect(opts, async (page) => page.evaluate('document.title'));
    expect(result).toBe('ready');
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it('fails when the main chat page is unavailable', async () => {
    ensureDebugMode.mockResolvedValueOnce(undefined);
    cdpFactory.List
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(miniapp.openMiniappAndConnect(opts, async () => null))
      .rejects.toThrow('360Teams main chat not found. Please open 360Teams.');
  });

  it('fails when the sidenav button cannot be found', async () => {
    ensureDebugMode.mockResolvedValueOnce(undefined);
    cdpFactory.List
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'main-1', type: 'page', url: 'https://localhost:33013/#/main/chat' }]);
    const { client } = makeRuntimeClient([{ result: { value: 'not found' } }]);
    cdpFactory.mockResolvedValueOnce(client);

    await expect(miniapp.openMiniappAndConnect(opts, async () => null))
      .rejects.toThrow('Could not find "Foo" button. Is 360Teams on the correct screen?');
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it('opens the miniapp from main chat and then connects to the new target', async () => {
    ensureDebugMode.mockResolvedValueOnce(undefined);
    cdpFactory.List
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'main-2', type: 'page', url: 'https://localhost:33013/#/main/chat' }])
      .mockResolvedValueOnce([{ id: 'target-5', type: 'webview', url: 'https://app.example.com/foo' }]);

    const { client: mainClient } = makeRuntimeClient([{ result: { value: 'clicked sidenav-item' } }]);
    const { client: targetClient } = makeRuntimeClient([{ result: { value: 'opened' } }]);
    cdpFactory
      .mockResolvedValueOnce(mainClient)
      .mockResolvedValueOnce(targetClient);

    const result = await miniapp.openMiniappAndConnect(opts, async (page) => page.evaluate('location.href'));
    expect(result).toBe('opened');
    expect(mainClient.close).toHaveBeenCalledTimes(1);
    expect(targetClient.close).toHaveBeenCalledTimes(1);
  });

  it('times out when the miniapp never appears after clicking', async () => {
    vi.useFakeTimers();
    ensureDebugMode.mockResolvedValueOnce(undefined);
    cdpFactory.List
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'main-3', type: 'page', url: 'https://localhost:33013/#/main/chat' }])
      .mockResolvedValue([]);

    const { client: mainClient } = makeRuntimeClient([{ result: { value: 'clicked div' } }]);
    cdpFactory.mockResolvedValueOnce(mainClient);

    const promise = miniapp.openMiniappAndConnect(opts, async () => null);
    void promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(1500);
    await expect(promise).rejects.toThrow('Foo did not open after clicking. Please try again.');
    expect(mainClient.close).toHaveBeenCalledTimes(1);
  });

  it('uses the default timeout when opts.timeout is omitted', async () => {
    ensureDebugMode.mockResolvedValueOnce(undefined);
    cdpFactory.List
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'main-4', type: 'page', url: 'https://localhost:33013/#/main/chat' }])
      .mockResolvedValueOnce([{ id: 'target-6', type: 'webview', url: 'https://app.example.com/foo' }]);

    const { client: mainClient } = makeRuntimeClient([{ result: { value: 'clicked sidenav-item' } }]);
    const { client: targetClient } = makeRuntimeClient([{ result: { value: 'opened-with-default-timeout' } }]);
    cdpFactory
      .mockResolvedValueOnce(mainClient)
      .mockResolvedValueOnce(targetClient);

    const result = await miniapp.openMiniappAndConnect({
      urlPattern: 'foo',
      sidenavText: 'Foo',
      friendlyName: 'Foo',
    }, async (page) => page.evaluate('location.href'));

    expect(result).toBe('opened-with-default-timeout');
    expect(mainClient.close).toHaveBeenCalledTimes(1);
    expect(targetClient.close).toHaveBeenCalledTimes(1);
  });
});

describe('connectToTargetWithIframe', () => {
  it('creates an isolated world for the matching iframe', async () => {
    const { client, Page, Runtime } = makeIframeClient({
      frameTrees: [{
        frame: { id: 'root', url: 'https://host.example.com' },
        childFrames: [
          { frame: { id: 'iframe-1', url: 'https://doc.example.com/frame' } },
        ],
      }],
      runtimeResponses: [{ result: { value: 'main-page' } }, { result: { value: 'iframe-page' } }],
    });
    cdpFactory.mockResolvedValueOnce(client);

    const connected = await miniapp.connectToTargetWithIframe('iframe-target', 'doc.example.com');
    await expect(connected.page.evaluate('main()')).resolves.toBe('main-page');
    await expect(connected.iframePage.evaluate('iframe()')).resolves.toBe('iframe-page');
    expect(Page.enable).toHaveBeenCalledTimes(1);
    expect(Runtime.enable).toHaveBeenCalledTimes(1);
    expect(Page.createIsolatedWorld).toHaveBeenCalledWith({
      frameId: 'iframe-1',
      worldName: 'iframe-reader',
      grantUniveralAccess: true,
    });
    expect(connected._client).toBe(client);
  });

  it('refreshes the iframe context when Runtime reports a stale context id', async () => {
    const { client, Page } = makeIframeClient({
      frameTrees: [
        {
          frame: { id: 'root', url: 'https://host.example.com' },
          childFrames: [{ frame: { id: 'iframe-ctx-1', url: 'https://doc.example.com/frame' } }],
        },
        {
          frame: { id: 'root', url: 'https://host.example.com' },
          childFrames: [{ frame: { id: 'iframe-ctx-2', url: 'https://doc.example.com/frame' } }],
        },
      ],
      createIsolatedWorld: [{ executionContextId: 42 }, { executionContextId: 84 }],
      runtimeResponses: [
        new Error('Cannot find context with specified id'),
        { result: { value: 'recovered' } },
      ],
    });
    cdpFactory.mockResolvedValueOnce(client);

    const connected = await miniapp.connectToTargetWithIframe('iframe-target', 'doc.example.com');
    await expect(connected.iframePage.evaluate('iframe()')).resolves.toBe('recovered');
    expect(Page.createIsolatedWorld).toHaveBeenCalledTimes(2);
  });

  it('refreshes the iframe context when Runtime rejects with a stale string message', async () => {
    const { client, Page } = makeIframeClient({
      frameTrees: [
        {
          frame: { id: 'root', url: 'https://host.example.com' },
          childFrames: [{ frame: { id: 'iframe-ctx-3', url: 'https://doc.example.com/frame' } }],
        },
        {
          frame: { id: 'root', url: 'https://host.example.com' },
          childFrames: [{ frame: { id: 'iframe-ctx-4', url: 'https://doc.example.com/frame' } }],
        },
      ],
      createIsolatedWorld: [{ executionContextId: 52 }, { executionContextId: 96 }],
      runtimeResponses: [
        'Cannot find object with given id',
        { result: { value: 'recovered-from-string' } },
      ],
    });
    cdpFactory.mockResolvedValueOnce(client);

    const connected = await miniapp.connectToTargetWithIframe('iframe-target', 'doc.example.com');
    await expect(connected.iframePage.evaluate('iframe()')).resolves.toBe('recovered-from-string');
    expect(Page.createIsolatedWorld).toHaveBeenCalledTimes(2);
  });

  it('throws after three stale-context retries are exhausted', async () => {
    const { client, Page } = makeIframeClient({
      frameTrees: [
        {
          frame: { id: 'root', url: 'https://host.example.com' },
          childFrames: [{ frame: { id: 'iframe-ctx-5', url: 'https://doc.example.com/frame' } }],
        },
        {
          frame: { id: 'root', url: 'https://host.example.com' },
          childFrames: [{ frame: { id: 'iframe-ctx-6', url: 'https://doc.example.com/frame' } }],
        },
        {
          frame: { id: 'root', url: 'https://host.example.com' },
          childFrames: [{ frame: { id: 'iframe-ctx-7', url: 'https://doc.example.com/frame' } }],
        },
      ],
      createIsolatedWorld: [
        { executionContextId: 61 },
        { executionContextId: 62 },
        { executionContextId: 63 },
      ],
      runtimeResponses: [
        new Error('Cannot find context with specified id'),
        new Error('Execution context was destroyed'),
        new Error('Cannot find object with given id'),
      ],
    });
    cdpFactory.mockResolvedValueOnce(client);

    const connected = await miniapp.connectToTargetWithIframe('iframe-target', 'doc.example.com');
    await expect(connected.iframePage.evaluate('iframe()')).rejects.toThrow('Cannot find object with given id');
    expect(Page.createIsolatedWorld).toHaveBeenCalledTimes(3);
  });

  it('throws when the iframe never appears', async () => {
    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(0);
    nowSpy.mockReturnValueOnce(0);
    nowSpy.mockReturnValue(6000);
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn) => {
      fn();
      return 0;
    });
    const { client } = makeIframeClient();
    cdpFactory.mockResolvedValueOnce(client);

    const promise = miniapp.connectToTargetWithIframe('iframe-target', 'missing.example.com');
    void promise.catch(() => {});
    await expect(promise).rejects.toThrow('No iframe matching "missing.example.com" found in frame tree');
    expect(client.close).toHaveBeenCalledTimes(1);
    setTimeoutSpy.mockRestore();
    nowSpy.mockRestore();
  });

  it('surfaces iframe evaluation errors from Runtime', async () => {
    const { client } = makeIframeClient({
      frameTrees: [{
        frame: { id: 'root', url: 'https://host.example.com' },
        childFrames: [
          { frame: { id: 'iframe-err', url: 'https://doc.example.com/frame' } },
        ],
      }],
      runtimeResponses: [{ result: {}, exceptionDetails: { text: 'iframe boom' } }],
    });
    cdpFactory.mockResolvedValueOnce(client);

    const connected = await miniapp.connectToTargetWithIframe('iframe-target', 'doc.example.com');
    await expect(connected.iframePage.evaluate('broken()')).rejects.toThrow('iframe boom');
  });

  it('prefers exception descriptions from iframe evaluation errors', async () => {
    const { client } = makeIframeClient({
      frameTrees: [{
        frame: { id: 'root', url: 'https://host.example.com' },
        childFrames: [
          { frame: { id: 'iframe-desc', url: 'https://doc.example.com/frame' } },
        ],
      }],
      runtimeResponses: [{ result: {}, exceptionDetails: { exception: { description: 'iframe description' } } }],
    });
    cdpFactory.mockResolvedValueOnce(client);

    const connected = await miniapp.connectToTargetWithIframe('iframe-target', 'doc.example.com');
    await expect(connected.iframePage.evaluate('broken()')).rejects.toThrow('iframe description');
  });

  it('falls back to Unknown CDP error for iframe evaluation failures without detail', async () => {
    const { client } = makeIframeClient({
      frameTrees: [{
        frame: { id: 'root', url: 'https://host.example.com' },
        childFrames: [
          { frame: { id: 'iframe-unknown', url: 'https://doc.example.com/frame' } },
        ],
      }],
      runtimeResponses: [{ result: {}, exceptionDetails: {} }],
    });
    cdpFactory.mockResolvedValueOnce(client);

    const connected = await miniapp.connectToTargetWithIframe('iframe-target', 'doc.example.com');
    await expect(connected.iframePage.evaluate('broken()')).rejects.toThrow('Unknown CDP error');
  });

  it('finds nested iframes recursively', async () => {
    const { client } = makeIframeClient({
      frameTrees: [{
        frame: { id: 'root', url: 'https://host.example.com' },
        childFrames: [
          {
            frame: { id: 'parent-frame', url: 'https://container.example.com' },
            childFrames: [
              { frame: { id: 'nested-frame', url: 'https://doc.example.com/nested' } },
            ],
          },
        ],
      }],
      runtimeResponses: [{ result: { value: 'nested-ok' } }],
    });
    cdpFactory.mockResolvedValueOnce(client);

    const connected = await miniapp.connectToTargetWithIframe('iframe-target', 'doc.example.com');
    await expect(connected.iframePage.evaluate('nested()')).resolves.toBe('nested-ok');
  });

  it('continues searching sibling frames when a nested branch does not match', async () => {
    const { client } = makeIframeClient({
      frameTrees: [{
        frame: { id: 'root', url: 'https://host.example.com' },
        childFrames: [
          {
            frame: { id: 'parent-frame', url: 'https://container.example.com' },
            childFrames: [
              { frame: { id: 'nested-miss', url: 'https://other.example.com/nested' } },
            ],
          },
          { frame: { id: 'sibling-match', url: 'https://doc.example.com/final' } },
        ],
      }],
      runtimeResponses: [{ result: { value: 'sibling-ok' } }],
    });
    cdpFactory.mockResolvedValueOnce(client);

    const connected = await miniapp.connectToTargetWithIframe('iframe-target', 'doc.example.com');
    await expect(connected.iframePage.evaluate('sibling()')).resolves.toBe('sibling-ok');
  });
});

describe('refreshIframeContext', () => {
  it('recreates an isolated world after iframe navigation', async () => {
    const Page = {
      getFrameTree: vi.fn().mockResolvedValue({
        frameTree: {
          frame: { id: 'root', url: 'https://host.example.com' },
          childFrames: [
            { frame: { id: 'iframe-2', url: 'https://doc.example.com/next' } },
          ],
        },
      }),
      createIsolatedWorld: vi.fn().mockResolvedValue({ executionContextId: 77 }),
    };
    const Runtime = {
      evaluate: vi.fn().mockResolvedValue({ result: { value: 'refreshed' } }),
    };

    const iframePage = await miniapp.refreshIframeContext(Page, Runtime, 'doc.example.com');
    await expect(iframePage.evaluate('iframe()')).resolves.toBe('refreshed');
    expect(Page.createIsolatedWorld).toHaveBeenCalledTimes(1);
  });

  it('refreshes again when the new iframe context is already stale', async () => {
    const Page = {
      getFrameTree: vi.fn()
        .mockResolvedValueOnce({
          frameTree: {
            frame: { id: 'root', url: 'https://host.example.com' },
            childFrames: [{ frame: { id: 'iframe-5', url: 'https://doc.example.com/next' } }],
          },
        })
        .mockResolvedValueOnce({
          frameTree: {
            frame: { id: 'root', url: 'https://host.example.com' },
            childFrames: [{ frame: { id: 'iframe-6', url: 'https://doc.example.com/next' } }],
          },
        }),
      createIsolatedWorld: vi.fn()
        .mockResolvedValueOnce({ executionContextId: 88 })
        .mockResolvedValueOnce({ executionContextId: 99 }),
    };
    const Runtime = {
      evaluate: vi.fn()
        .mockRejectedValueOnce(new Error('Execution context was destroyed'))
        .mockResolvedValueOnce({ result: { value: 'refreshed-again' } }),
    };

    const iframePage = await miniapp.refreshIframeContext(Page, Runtime, 'doc.example.com');
    await expect(iframePage.evaluate('iframe()')).resolves.toBe('refreshed-again');
    expect(Page.createIsolatedWorld).toHaveBeenCalledTimes(2);
  });

  it('throws when a refreshed iframe context cannot be found', async () => {
    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(0);
    nowSpy.mockReturnValueOnce(0);
    nowSpy.mockReturnValue(6000);
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn) => {
      fn();
      return 0;
    });
    const Page = {
      getFrameTree: vi.fn().mockResolvedValue({
        frameTree: { frame: { id: 'root', url: 'https://host.example.com' }, childFrames: [] },
      }),
      createIsolatedWorld: vi.fn(),
    };
    const Runtime = { evaluate: vi.fn() };

    const promise = miniapp.refreshIframeContext(Page, Runtime, 'missing.example.com');
    void promise.catch(() => {});
    await expect(promise).rejects.toThrow('No iframe matching "missing.example.com" found after navigation');
    setTimeoutSpy.mockRestore();
    nowSpy.mockRestore();
  });

  it('throws when the frame tree does not expose childFrames at all', async () => {
    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(0);
    nowSpy.mockReturnValueOnce(0);
    nowSpy.mockReturnValue(6000);
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn) => {
      fn();
      return 0;
    });
    const Page = {
      getFrameTree: vi.fn().mockResolvedValue({
        frameTree: { frame: { id: 'root', url: 'https://host.example.com' } },
      }),
      createIsolatedWorld: vi.fn(),
    };
    const Runtime = { evaluate: vi.fn() };

    const promise = miniapp.refreshIframeContext(Page, Runtime, 'missing.example.com');
    void promise.catch(() => {});
    await expect(promise).rejects.toThrow('No iframe matching "missing.example.com" found after navigation');
    setTimeoutSpy.mockRestore();
    nowSpy.mockRestore();
  });

  it('surfaces evaluation errors from a refreshed iframe context', async () => {
    const Page = {
      getFrameTree: vi.fn().mockResolvedValue({
        frameTree: {
          frame: { id: 'root', url: 'https://host.example.com' },
          childFrames: [
            { frame: { id: 'iframe-7', url: 'https://doc.example.com/next' } },
          ],
        },
      }),
      createIsolatedWorld: vi.fn().mockResolvedValue({ executionContextId: 108 }),
    };
    const Runtime = {
      evaluate: vi.fn().mockResolvedValue({ result: {}, exceptionDetails: { text: 'refresh boom' } }),
    };

    const iframePage = await miniapp.refreshIframeContext(Page, Runtime, 'doc.example.com');
    await expect(iframePage.evaluate('broken()')).rejects.toThrow('refresh boom');
  });

  it('falls back to Unknown CDP error for refreshed iframe evaluation failures without detail', async () => {
    const Page = {
      getFrameTree: vi.fn().mockResolvedValue({
        frameTree: {
          frame: { id: 'root', url: 'https://host.example.com' },
          childFrames: [
            { frame: { id: 'iframe-8', url: 'https://doc.example.com/next' } },
          ],
        },
      }),
      createIsolatedWorld: vi.fn().mockResolvedValue({ executionContextId: 109 }),
    };
    const Runtime = {
      evaluate: vi.fn().mockResolvedValue({ result: {}, exceptionDetails: {} }),
    };

    const iframePage = await miniapp.refreshIframeContext(Page, Runtime, 'doc.example.com');
    await expect(iframePage.evaluate('broken()')).rejects.toThrow('Unknown CDP error');
  });
});

describe('openMiniappIframeAndConnect', () => {
  const opts = {
    urlPattern: 'docs',
    sidenavText: '云文档',
    friendlyName: '云文档',
    iframeUrlPattern: 'doc.example.com',
    timeout: 1000,
  };

  it('connects immediately when the iframe miniapp is already open', async () => {
    ensureDebugMode.mockResolvedValueOnce(undefined);
    cdpFactory.List.mockResolvedValueOnce([
      { id: 'docs-1', type: 'webview', url: 'https://app.example.com/docs' },
    ]);
    const { client } = makeIframeClient({
      frameTrees: [{
        frame: { id: 'root', url: 'https://host.example.com' },
        childFrames: [{ frame: { id: 'iframe-3', url: 'https://doc.example.com/frame' } }],
      }],
      runtimeResponses: [{ result: { value: 'iframe' } }],
    });
    cdpFactory.mockResolvedValueOnce(client);

    const result = await miniapp.openMiniappIframeAndConnect(opts, async (_page, iframePage) => iframePage.evaluate('iframe()'));
    expect(result).toBe('iframe');
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it('opens the iframe miniapp from main chat and connects after it appears', async () => {
    ensureDebugMode.mockResolvedValueOnce(undefined);
    cdpFactory.List
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'main-4', type: 'page', url: 'https://localhost:33013/#/main/chat' }])
      .mockResolvedValueOnce([{ id: 'docs-2', type: 'webview', url: 'https://app.example.com/docs' }]);

    const { client: mainClient } = makeRuntimeClient([{ result: { value: 'clicked sidenav-item' } }]);
    const { client: iframeClient } = makeIframeClient({
      frameTrees: [{
        frame: { id: 'root', url: 'https://host.example.com' },
        childFrames: [{ frame: { id: 'iframe-4', url: 'https://doc.example.com/frame' } }],
      }],
      runtimeResponses: [{ result: { value: 'iframe' } }],
    });
    cdpFactory
      .mockResolvedValueOnce(mainClient)
      .mockResolvedValueOnce(iframeClient);

    const result = await miniapp.openMiniappIframeAndConnect(opts, async (_page, iframePage) => iframePage.evaluate('iframe()'));
    expect(result).toBe('iframe');
    expect(mainClient.close).toHaveBeenCalledTimes(1);
    expect(iframeClient.close).toHaveBeenCalledTimes(1);
  });

  it('fails when the main chat page is unavailable for iframe miniapps', async () => {
    ensureDebugMode.mockResolvedValueOnce(undefined);
    cdpFactory.List
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(miniapp.openMiniappIframeAndConnect(opts, async () => null))
      .rejects.toThrow('360Teams main chat not found. Please open 360Teams.');
  });

  it('fails when the iframe miniapp sidenav button cannot be found', async () => {
    ensureDebugMode.mockResolvedValueOnce(undefined);
    cdpFactory.List
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'main-5', type: 'page', url: 'https://localhost:33013/#/main/chat' }]);
    const { client: mainClient } = makeRuntimeClient([{ result: { value: 'not found' } }]);
    cdpFactory.mockResolvedValueOnce(mainClient);

    await expect(miniapp.openMiniappIframeAndConnect(opts, async () => null))
      .rejects.toThrow('Could not find "云文档" button. Is 360Teams on the correct screen?');
    expect(mainClient.close).toHaveBeenCalledTimes(1);
  });

  it('times out when the iframe miniapp never appears after clicking', async () => {
    vi.useFakeTimers();
    ensureDebugMode.mockResolvedValueOnce(undefined);
    cdpFactory.List
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'main-6', type: 'page', url: 'https://localhost:33013/#/main/chat' }])
      .mockResolvedValue([]);

    const { client: mainClient } = makeRuntimeClient([{ result: { value: 'clicked sidenav-item' } }]);
    cdpFactory.mockResolvedValueOnce(mainClient);

    const promise = miniapp.openMiniappIframeAndConnect(opts, async () => null);
    void promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(1500);
    await expect(promise).rejects.toThrow('云文档 did not open after clicking. Please try again.');
    expect(mainClient.close).toHaveBeenCalledTimes(1);
  });

  it('uses the default timeout when opts.timeout is omitted', async () => {
    ensureDebugMode.mockResolvedValueOnce(undefined);
    cdpFactory.List
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'main-7', type: 'page', url: 'https://localhost:33013/#/main/chat' }])
      .mockResolvedValueOnce([{ id: 'docs-3', type: 'webview', url: 'https://app.example.com/docs' }]);

    const { client: mainClient } = makeRuntimeClient([{ result: { value: 'clicked sidenav-item' } }]);
    const { client: iframeClient } = makeIframeClient({
      frameTrees: [{
        frame: { id: 'root', url: 'https://host.example.com' },
        childFrames: [{ frame: { id: 'iframe-7', url: 'https://doc.example.com/frame' } }],
      }],
      runtimeResponses: [{ result: { value: 'iframe-default-timeout' } }],
    });
    cdpFactory
      .mockResolvedValueOnce(mainClient)
      .mockResolvedValueOnce(iframeClient);

    const optsWithoutTimeout = {
      urlPattern: 'docs',
      sidenavText: '云文档',
      friendlyName: '云文档',
      iframeUrlPattern: 'doc.example.com',
    };
    const result = await miniapp.openMiniappIframeAndConnect(optsWithoutTimeout, async (_page, iframePage) => {
      return await iframePage.evaluate('iframe()');
    });

    expect(result).toBe('iframe-default-timeout');
    expect(mainClient.close).toHaveBeenCalledTimes(1);
    expect(iframeClient.close).toHaveBeenCalledTimes(1);
  });
});
