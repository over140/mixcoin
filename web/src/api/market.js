import { isString, isObject } from "util";

function Market(api) {
  this.api = api;
}

Market.prototype = {
  index: function (callback) {
    this.api.request('GET', '/markets', undefined, function (resp) {
      return callback(resp);
    });
  },

  market: function (callback, market) {
    const self = this;
    this.api.request('GET', '/markets/' + market, undefined, function (resp) {
      return callback(resp);
    });
  },

  oneMarket: function (callback, baseAssetId, quoteAssetId) {
    const self = this;
    this.api.request('GET', '/markets/' + baseAssetId + '-' + quoteAssetId, undefined, function (resp) {
      if (resp.error && resp.error.code && resp.error.code === 404) {
        callback({data: {base: baseAssetId, change: 0, price: 0, quote: quoteAssetId, quote_usd: 0, total: 0, volume: 0 }});
        return true;
      }
      return callback(resp);
    });
  },

  candles: function (callback, market, granularity) {
    this.api.request('GET', '/markets/' + market + '/candles/' + granularity, undefined, function (resp) {
      return callback(resp);
    });
  }
};

export default Market;
