import TimeUtils from '../utils/time.js';

function MarketController(api, db) {
  this.api = api;
  this.db = db;
}

MarketController.prototype = {

  syncServerMarket: function (baseAssetId, quoteAssetId) {
    const self = this;
    self.api.market.market(function (resp) {
      if (resp.error) {
        return true;
      }

      const market = resp.data;
      var m = {};
      m.base = market.base;
      m.quote = market.quote;
      m.price = market.price;
      m.volume = market.volume;
      m.total = market.total;
      m.change = market.change;
      m.quote_usd = market.quote_usd;
      m.source = 'SERVER';
      m.updated_at = TimeUtils.rfc3339(new Date());

      self.db.market.saveMarkets(function (markets) {
        callback(markets);
      }, [m]);
    }, baseAssetId + '-' + quoteAssetId);
  },

  syncServerMarkets: function (callback) {
    const self = this;
    self.api.market.markets(function (resp) {
      if (resp.error) {
        return true;
      }

      var markets = [];
      for (var i = 0; i < resp.data.length; i++) {
        const market = resp.data[i];
        var m = {};
        m.base = market.base;
        m.quote = market.quote;
        m.price = market.price;
        m.volume = market.volume;
        m.total = market.total;
        m.change = market.change;
        m.quote_usd = market.quote_usd;
        m.source = 'SERVER';
        markets.push(m);
      }

      self.db.market.saveMarkets(function (markets) {
        callback(markets);
      }, markets);
    });
  },

  syncTrades: function (callback, baseAssetId, quoteAssetId, limit) {
    if (!baseAssetId || !quoteAssetId) {
      return;
    }

    const self = this;
    self.db.market.getMarket(function (market) {
      if (market && market.source === 'SERVER') {
        return;
      }

      self.db.trade.getLastTrade(function (trade) {
        const offset = trade ? trade.created_at : '2018-08-05T23:59:59.779447612Z';
        if (!limit) {
          limit = trade ? 50 : 500;
        }

        self.api.ocean.trades(function (resp) {
          if (resp.error) {
            return true;
          }

          const isPageEnded = resp.data.length < limit;
          self.db.trade.saveTrades(function(trades) {
            if (isPageEnded) {
              callback(trades);
            } else {
              self.syncTrades(callback, baseAssetId, quoteAssetId, 500);
            }
          }, resp.data, baseAssetId, quoteAssetId, market);
        }, baseAssetId + '-' + quoteAssetId, offset, limit);

      }, baseAssetId, quoteAssetId);
    }, baseAssetId, quoteAssetId);
  },

};

export default MarketController;
