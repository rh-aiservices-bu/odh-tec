/* eslint-disable @typescript-eslint/no-var-requires */

const path = require('path');
const { mergeWithCustomize, customizeArray } = require('webpack-merge');
const common = require('./webpack.common.js');
const { stylePaths } = require('./stylePaths.js');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const TerserJSPlugin = require('terser-webpack-plugin');
const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');
const Dotenv = require('dotenv-webpack');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = mergeWithCustomize({
  customizeArray: customizeArray({
    plugins: 'replace',
  }),
})(common('production'), {
  mode: 'production',
  devtool: 'source-map',
  optimization: {
    minimizer: [
      new TerserJSPlugin({}),
      new CssMinimizerPlugin({
        minimizerOptions: {
          preset: ['default', { mergeLonghand: false }],
        },
      }),
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, 'src', 'index.html'),
      publicPath: '', // Empty string generates relative paths that respect <base> tag
      templateParameters: {
        nbPrefix: '', // Backend will inject NB_PREFIX at runtime
      },
      minify: {
        collapseWhitespace: true,
        removeComments: false, // CRITICAL: Preserve <!-- NB_PREFIX_INJECT_PLACEHOLDER -->
        removeRedundantAttributes: true,
        removeScriptTypeAttributes: true,
        removeStyleLinkTypeAttributes: true,
        useShortDoctype: true,
      },
    }),
    new MiniCssExtractPlugin({
      filename: '[name].css',
      chunkFilename: '[name].bundle.css',
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
  module: {
    rules: [
      {
        // Monaco Editor CSS
        test: /\.css$/,
        include: [path.resolve(__dirname, 'node_modules/monaco-editor')],
        use: [MiniCssExtractPlugin.loader, 'css-loader'],
      },
      {
        // PatternFly and application CSS
        test: /\.css$/,
        include: [...stylePaths],
        use: [MiniCssExtractPlugin.loader, 'css-loader'],
      },
    ],
  },
});
