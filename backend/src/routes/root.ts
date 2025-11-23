import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getLastAccessLogEntry } from '../utils/logAccess';
import { NB_PREFIX } from '../utils/constants';

// Route configuration
const ROUTES = {
  API: '/api',
  KERNELS: '/api/kernels',
  TERMINALS: '/api/terminals',
} as const;

// Route handlers
const handlers = {
  healthCheck: async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.send({ status: 'ok' });
  },

  getAccessLog: (log: any) => async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const replyData = await getLastAccessLogEntry(log);
      reply.send(replyData);
    } catch (error) {
      reply.status(500).send({
        error: 'Failed to retrieve access log',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  redirectToRoot: async (_req: FastifyRequest, reply: FastifyReply) => {
    const rootPath = NB_PREFIX || '/';
    reply.redirect(rootPath);
  },
};

// Helper function to register routes with optional trailing slash handling
const registerRoute = (
  fastify: FastifyInstance,
  method: 'get' | 'post' | 'put' | 'delete',
  path: string,
  handler: any,
  handleTrailingSlash = true,
) => {
  fastify[method](path, handler);
  if (handleTrailingSlash && !path.endsWith('/')) {
    fastify[method](`${path}/`, handler);
  }
};

export default async (fastify: FastifyInstance): Promise<void> => {
  const accessLogHandler = handlers.getAccessLog(fastify.log);

  // Health check endpoints (prefix applied at app level if NB_PREFIX is set)
  registerRoute(fastify, 'get', ROUTES.API, handlers.healthCheck);

  // OpenShift AI/RHOAI compatibility endpoints for notebook health checks
  // These are used by the platform to verify the workbench is running
  registerRoute(fastify, 'get', ROUTES.KERNELS, accessLogHandler);
  registerRoute(fastify, 'get', ROUTES.TERMINALS, accessLogHandler);
};
