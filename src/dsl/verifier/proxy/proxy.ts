import express from 'express';
import HttpProxy from 'http-proxy';
import bodyParser from 'body-parser';
import * as http from 'http';

import { ProxyOptions } from './types';
import logger from '../../../common/logger';
import { createProxyStateHandler } from './stateHandler/stateHandler';
import { registerAfterHook, registerBeforeHook } from './hooks';
import { createRequestTracer, createResponseTracer } from './tracer';
import { parseBody } from './parseBody';

// Listens for the server start event
export const waitForServerReady = (server: http.Server): Promise<http.Server> =>
  new Promise((resolve, reject) => {
    server.on('listening', () => resolve(server));
    server.on('error', () =>
      reject(new Error('Unable to start verification proxy server'))
    );
  });

// Get the Proxy we'll pass to the CLI for verification
export const createProxy = (
  config: ProxyOptions,
  stateSetupPath: string
): http.Server => {
  const app = express();
  const proxy = new HttpProxy();
  logger.trace(`Setting up state proxy with path: ${stateSetupPath}`);

  // NOTE: if you change any of these global middleware that consumes the body
  //       review the "proxyReq" event reader below
  app.use(
    bodyParser.json({
      type: [
        'application/json',
        'application/json; charset=utf-8',
        'application/json; charset=utf8',
      ],
    })
  );
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use('/*', bodyParser.raw({ type: '*/*' }));
  registerBeforeHook(app, config, stateSetupPath);
  registerAfterHook(app, config, stateSetupPath);

  // Trace req/res logging
  if (config.logLevel === 'debug' || config.logLevel === 'trace') {
    logger.info('debug request/response logging enabled');
    app.use(createRequestTracer());
    app.use(createResponseTracer());
  }

  // Allow for request filtering
  if (config.requestFilter !== undefined) {
    app.use(config.requestFilter);
  }

  // Setup provider state handler
  app.post(stateSetupPath, createProxyStateHandler(config));

  // Proxy server will respond to Verifier process
  app.all('/*', (req, res) => {
    logger.debug(`Proxying ${req.method}: ${req.path}`);

    proxy.web(req, res, {
      changeOrigin: config.changeOrigin === true,
      secure: config.validateSSL === true,
      target: config.providerBaseUrl,
    });
  });

  proxy.on('proxyReq', (proxyReq, req) => parseBody(proxyReq, req));

  return http.createServer(app).listen();
};
