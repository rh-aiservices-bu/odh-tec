/* eslint-disable @typescript-eslint/no-var-requires */

const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');
const Dotenv = require('dotenv-webpack');
const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');

// Load environment variables from backend/.env before webpack config evaluation
// This ensures process.env.NB_PREFIX is available for webpack config logic
require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });

const BG_IMAGES_DIRNAME = 'bgimages';

/**
 * Normalizes a path prefix to ensure it has a leading slash and a trailing slash.
 * Returns '/' if input is empty or only slashes (for root deployment).
 * Note: For publicPath, we need trailing slash for webpack asset loading.
 */
const normalizePublicPath = (prefix) => {
  if (!prefix) return '/';

  // Remove all leading and trailing slashes
  const trimmed = prefix.replace(/^\/+|\/+$/g, '');

  // If nothing left after trimming, return root
  if (!trimmed) return '/';

  // Add leading and trailing slash for publicPath
  return `/${trimmed}/`;
};

// Use NB_PREFIX for path prefix (for Gateway API routing, etc.)
const PUBLIC_PATH = normalizePublicPath(process.env.NB_PREFIX);
module.exports = (env) => {
  return {
    module: {
      rules: [
        {
          test: /\.(tsx|ts|jsx)?$/,
          use: [
            {
              loader: 'ts-loader',
              options: {
                transpileOnly: true,
                experimentalWatchApi: true,
              },
            },
          ],
        },
        {
          test: /\.(svg|ttf|eot|woff|woff2)$/,
          type: 'asset/resource',
          // only process modules with this loader
          // if they live under a 'fonts' or 'pficon' directory
          include: [
            path.resolve(__dirname, 'node_modules/patternfly/dist/fonts'),
            path.resolve(__dirname, 'node_modules/@patternfly/react-core/dist/styles/assets/fonts'),
            path.resolve(__dirname, 'node_modules/@patternfly/react-core/dist/styles/assets/pficon'),
            path.resolve(__dirname, 'node_modules/@patternfly/patternfly/assets/fonts'),
            path.resolve(__dirname, 'node_modules/@patternfly/patternfly/assets/pficon'),
          ],
        },
        {
          test: /\.svg$/,
          type: 'asset/inline',
          include: (input) => input.indexOf('background-filter.svg') > 1,
          use: [
            {
              options: {
                limit: 5000,
                outputPath: 'svgs',
                name: '[name].[ext]',
              },
            },
          ],
        },
        {
          test: /\.svg$/,
          // only process SVG modules with this loader if they live under a 'bgimages' directory
          // this is primarily useful when applying a CSS background using an SVG
          include: (input) => input.indexOf(BG_IMAGES_DIRNAME) > -1,
          type: 'asset/inline',
        },
        {
          test: /\.svg$/,
          // only process SVG modules with this loader when they don't live under a 'bgimages',
          // 'fonts', or 'pficon' directory, those are handled with other loaders
          include: (input) =>
            input.indexOf(BG_IMAGES_DIRNAME) === -1 &&
            input.indexOf('fonts') === -1 &&
            input.indexOf('background-filter') === -1 &&
            input.indexOf('pficon') === -1,
          use: {
            loader: 'raw-loader',
            options: {},
          },
        },
        {
          test: /\.(jpg|jpeg|png|gif)$/i,
          include: [
            path.resolve(__dirname, 'src/app/assets/images'),
          ],
          use:
          {
            loader: 'file-loader',
            options: {
              name: '[path][name].[ext]',
              outputPath: 'images',
            }
          },
        },
        {
          test: /\.(jpg|jpeg|png|gif)$/i,
          include: [
            //path.resolve(__dirname, 'src'),
            path.resolve(__dirname, 'node_modules/patternfly'),
            path.resolve(__dirname, 'node_modules/@patternfly/patternfly/assets/images'),
            path.resolve(__dirname, 'node_modules/@patternfly/react-styles/css/assets/images'),
            path.resolve(__dirname, 'node_modules/@patternfly/react-core/dist/styles/assets/images'),
            path.resolve(
              __dirname,
              'node_modules/@patternfly/react-core/node_modules/@patternfly/react-styles/css/assets/images'
            ),
            path.resolve(
              __dirname,
              'node_modules/@patternfly/react-table/node_modules/@patternfly/react-styles/css/assets/images'
            ),
            path.resolve(
              __dirname,
              'node_modules/@patternfly/react-inline-edit-extension/node_modules/@patternfly/react-styles/css/assets/images'
            ),
          ],
          type: 'asset/inline',
          use: [
            {
              loader: 'url-loader',
              options: {
                limit: 5000,
                outputPath: 'images',
                name: '[name].[ext]',
              },
            },
          ],
        },
      ],
    },
    output: {
      filename: '[name].bundle.js',
      path: path.resolve(__dirname, 'dist'),
      // In dev: use PUBLIC_PATH for webpack-dev-server
      // In prod: use 'auto' to generate relative paths that work with <base> tag
      publicPath: env === 'development' ? PUBLIC_PATH : 'auto',
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: path.resolve(__dirname, 'src', 'index.html'),
        // In dev: use PUBLIC_PATH for webpack-dev-server
        // In prod: use empty string for backend runtime injection
        publicPath: env === 'development' ? PUBLIC_PATH : '',
        templateParameters: {
          // In dev: inject NB_PREFIX at build time for webpack-dev-server
          // In prod: empty for backend runtime injection
          nbPrefix: env === 'development' ? process.env.NB_PREFIX || '' : '',
        },
      }),
      new Dotenv({
        path: path.resolve(__dirname, '../backend/.env'),
        systemvars: true,
        silent: true,
        defaults: false,
      }),
      new CopyPlugin({
        patterns: [{ from: './src/favicon.svg', to: 'images' }, { from: './public/locales', to: 'locales' }],
      }),
      new MonacoWebpackPlugin({
        // Include commonly used languages for file preview
        languages: ['javascript', 'typescript', 'json', 'python', 'yaml', 'css', 'html', 'markdown', 'shell', 'dockerfile', 'xml', 'sql'],
        // Include all features for a complete editor experience
        features: ['!gotoSymbol'],
        // Output workers to monaco subdirectory for better organization
        // Note: publicPath is omitted to inherit from main webpack config (PUBLIC_PATH)
        filename: 'monaco/[name].worker.js',
      }),
    ],
    resolve: {
      extensions: ['.js', '.ts', '.tsx', '.jsx'],
      plugins: [
        new TsconfigPathsPlugin({
          configFile: path.resolve(__dirname, './tsconfig.json'),
        }),
      ],
      symlinks: false,
      cacheWithContext: false,
    },
  };
};
