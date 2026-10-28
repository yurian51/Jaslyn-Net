import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApp } from '../src/main';

let handler: ((req: VercelRequest, res: VercelResponse) => void) | undefined;
let initializing: Promise<void> | undefined;

async function getHandler() {
  if (handler) return handler;
  initializing ??= createApp().then(({ app }) => {
    handler = app.getHttpAdapter().getInstance();
  });
  await initializing;
  return handler!;
}

export default async function api(req: VercelRequest, res: VercelResponse) {
  const expressHandler = await getHandler();
  return expressHandler(req, res);
}
