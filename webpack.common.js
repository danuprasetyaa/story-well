const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: './src/scripts/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    clean: true,
    publicPath: './',
  },
  module: {
    rules: [
      { test: /\.css$/, use: ['style-loader', 'css-loader'] },
      { test: /\.js$/, exclude: /node_modules/, use: ['babel-loader'] },
      { test: /\.(png|svg|jpg|jpeg|gif)$/i, type: 'asset/resource' },
    ],
  },
    plugins: [
      new HtmlWebpackPlugin({ template: './src/index.html', filename: 'index.html' }),
      new CopyWebpackPlugin({
        patterns: [
          { from: './src/manifest.webmanifest', to: 'manifest.webmanifest' },
          { from: './src/icons', to: 'icons' },
          { from: './src/screenshots', to: 'screenshots', noErrorOnMissing: true },
          { from: './src/scripts/service-worker.js', to: 'service-worker.js' }
        ]
      })
    ],
};
