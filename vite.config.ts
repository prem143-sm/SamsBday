import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import authHandler from './api/auth';
import localMediaHandler from './api/local-media';

function localAuthApi(): Plugin {
  return {
    name: 'local-auth-api',
    configureServer(server) {
      const serve = (route: string, handler: (request: Request) => Promise<Response>) => server.middlewares.use(route, async (req, res, next) => {
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          // Keep multipart uploads as raw bytes. Converting binary image data
          // to UTF-8 text here corrupts it before Request.formData() parses it.
          const body = chunks.length ? Buffer.concat(chunks) : undefined;
          const url = `http://${req.headers.host ?? '127.0.0.1:3000'}${route}${req.url ?? ''}`;
          const response = await handler(new Request(url, {
            method: req.method,
            headers: req.headers as HeadersInit,
            body: body && req.method !== 'GET' && req.method !== 'HEAD' ? body : undefined,
          }));
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          next(error);
        }
      });
      serve('/api/auth', authHandler);
      serve('/api/local-media', localMediaHandler);
    },
  };
}

export default defineConfig(({ mode }) => {
  // Server-only credentials in .env.local are available to the local API
  // adapter but are never injected into the browser bundle.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return {
  plugins: [react(), localAuthApi()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'three-core': ['three'],
          'react-three': ['@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
};
});
