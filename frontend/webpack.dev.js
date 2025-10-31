/* eslint-disable @typescript-eslint/no-var-requires */

const path = require('path');
const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const { stylePaths } = require('./stylePaths.js');

// Load environment variables from backend/.env before webpack config evaluation
// This ensures process.env.NB_PREFIX and other vars are available
require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });

const HOST = process.env.HOST || 'localhost';
const PORT = process.env.PORT || '9000';

/**
 * Normalizes a path prefix to ensure it has a leading slash and no trailing slash.
 * Returns empty string if input is empty or only slashes (for root deployment).
 */
const normalizePathPrefix = (prefix) => {
  if (!prefix) return '';

  // Remove all leading and trailing slashes
  const trimmed = prefix.replace(/^\/+|\/+$/g, '');

  // If nothing left after trimming, return empty string
  if (!trimmed) return '';

  // Add leading slash, no trailing slash
  return `/${trimmed}`;
};

const pathPrefix = normalizePathPrefix(process.env.NB_PREFIX);

// Configure historyApiFallback for client-side routing with optional path prefix
const historyApiFallbackConfig = pathPrefix
  ? {
      index: `${pathPrefix}/index.html`,
      rewrites: [{ from: new RegExp(`^${pathPrefix}`), to: `${pathPrefix}/index.html` }],
    }
  : true;

module.exports = merge(common('development'), {
  mode: 'development',
  devtool: 'eval-source-map',
  devServer: {
    host: HOST,
    port: PORT,
    historyApiFallback: historyApiFallbackConfig,
    open: pathPrefix ? { target: [`${pathPrefix}/`] } : true,
    static: {
      directory: path.resolve(__dirname, 'dist'),
    },
    client: {
      overlay: true,
    },
  },
  module: {
    rules: [
      {
        // Monaco Editor CSS
        test: /\.css$/,
        include: [path.resolve(__dirname, 'node_modules/monaco-editor')],
        use: ['style-loader', 'css-loader'],
      },
      {
        // PatternFly and application CSS
        test: /\.css$/,
        include: [...stylePaths],
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
});
