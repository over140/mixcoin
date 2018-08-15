const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const ExtractTextPlugin = require("extract-text-webpack-plugin");
const ScriptExtHtmlWebpackPlugin = require("script-ext-html-webpack-plugin");
const FaviconsWebpackPlugin = require('favicons-webpack-plugin');

const extractSass = new ExtractTextPlugin({
    filename: "[name]-[hash].css"
});

const webRoot = function (env) {
  if (env === 'production') {
    return 'http://ex.otcxin.one';
  } else {
    return 'http://wallet.exchange.local';
  }
};

const appId = function (env) {
  if (env === 'production') {
    return '82d20bc7-9a97-4a69-bcd0-4da502374f6c';
  } else {
    return 'c2ab81d4-2226-4d0c-a49a-dc59b34f7972';
  }
};

const appSecret = function (env) {
  // return your app secret
};

module.exports = {
  entry: {
    app: './src/app.js'
  },

  output: {
    publicPath: '/assets/',
    path: path.resolve(__dirname, 'dist'),
    filename: '[name]-[chunkHash].js'
  },

  resolve: {
    alias: {
      jquery: "jquery/dist/jquery",
      handlebars: "handlebars/dist/handlebars.runtime"
    }
  },

  module: {
    rules: [{
      test: /\.html$/, loader: "handlebars-loader?helperDirs[]=" + __dirname + "/src/helpers"
    }, {
      test: /\.(scss|css)$/,
      use: extractSass.extract({
        use: [{
          loader: "css-loader"
        }, {
          loader: "sass-loader"
        }],
        fallback: "style-loader"
      })
    }, {
      test: /\.(woff|woff2|eot|ttf|otf|svg|png|jpg|gif)$/,
      use: [
        'file-loader'
      ]
    }]
  },

  plugins: [
    new webpack.DefinePlugin({
      PRODUCTION: (process.env.NODE_ENV === 'production'),
      WEB_ROOT: JSON.stringify(webRoot(process.env.NODE_ENV)),
      API_ROOT: JSON.stringify("https://example.ocean.one"),
      ENGINE_ROOT: JSON.stringify("wss://events.ocean.one"),
      APP_NAME: JSON.stringify("Wallet Exchange"),
      CLIENT_ID: JSON.stringify(appId(process.env.NODE_ENV)),
      CLIENT_SECRET: JSON.stringify(appSecret(process.env.NODE_ENV)),
      ENGINE_USER_ID: JSON.stringify("aaff5bef-42fb-4c9f-90e0-29f69176b7d4")
    }),
    new HtmlWebpackPlugin({
      template: './src/layout.html'
    }),
    new FaviconsWebpackPlugin({
      logo: './src/launcher.png',
      prefix: 'icons-[hash]-',
      background: '#FFFFFF'
    }),
    new ScriptExtHtmlWebpackPlugin({
      defaultAttribute: 'async'
    }),
    extractSass
  ]
};
