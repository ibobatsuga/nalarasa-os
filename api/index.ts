import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

let fastifyPromise: Promise<FastifyInstance> | null = null;

async function getFastify(): Promise<FastifyInstance> {
  if (!fastifyPromise) {
    fastifyPromise = buildApp().then(async (app) => {
      await app.ready();
      return app;
    });
  }
  return fastifyPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await getFastify();
  app.server.emit('request', req, res);
}
