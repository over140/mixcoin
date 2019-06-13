import TimeUtils from '../utils/time.js';
import {BigNumber} from 'bignumber.js';

function MarketController(api, db) {
  this.api = api;
  this.db = db;
}

MarketController.prototype = {

  getTimestamp: function(created_at) {
    const date = new Date(created_at);
    return parseInt((TimeUtils.getUTCDate(date).getTime() / 1000).toFixed(0));
  },

  processCandles: function (callback, baseAssetId, quoteAssetId, granularity) {
    const self = this;
    this.db.trade.fetchTrades(function (trades) {
      if (trades.length == 0) {
        callback([]);
        return;
      }
      trades = trades.reverse();
      var timestamp = new BigNumber(parseInt((new Date().getTime() / 1000).toFixed(0)));
      timestamp = timestamp.minus(new BigNumber(granularity).times(60));
      var candles = [];
      var tradeIdx = 0;
      
      var tradeTimestamp = new BigNumber(self.getTimestamp(trades[tradeIdx].created_at));
      var price = Number(trades[tradeIdx].price);
      var firstOrder = false

      for (var i = 0; i < 60; i++) {
        if (tradeTimestamp.gt(timestamp.minus(granularity)) && tradeTimestamp.lte(timestamp) && tradeIdx < trades.length) {
          firstOrder = true
          var open = price;
          var close = price;
          var high = price;
          var low = price;
          var volume = new BigNumber(trades[tradeIdx].amount);
          var total = new BigNumber(price).times(volume);
          tradeIdx += 1;
          for (; tradeIdx < trades.length; tradeIdx++) {
            price = Number(trades[tradeIdx].price);
            tradeTimestamp = new BigNumber(self.getTimestamp(trades[tradeIdx].created_at));

            if (tradeTimestamp.gt(timestamp.minus(granularity)) && tradeTimestamp.lte(timestamp)) {
              if (price > high) {
                high = price;
              }
              if (price < low) {
                low = price;
              }
              volume = volume.plus(trades[tradeIdx].amount);
              total = total.plus(new BigNumber(price).times(trades[tradeIdx].amount));
            } else {
              close = price;
              break;
            }
          }
          
          candles.push([timestamp.toNumber(), Number(open), close, high, low, volume.toNumber(), total.toNumber()]);
        } else {
          if (firstOrder) {
            candles.push([timestamp.toNumber(), price, price, price, price, 0, 0]); 
          } else {
            candles.push([timestamp.toNumber(), 0, 0, 0, 0, 0, 0]); 
          }
        }
        timestamp = timestamp.plus(granularity);
      }
      callback(candles);
    }, baseAssetId, quoteAssetId, 500);
  },

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
        var offset = trade ? trade.created_at : '2018-08-05T23:59:59.779447612Z';
        if (!limit) {
          limit = trade ? 50 : 500;
        }

        if (!offset) {
          offset = TimeUtils.rfc3339(new Date())
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
          }, resp.data, baseAssetId, quoteAssetId, market, trade);
        }, baseAssetId + '-' + quoteAssetId, offset, limit);

      }, baseAssetId, quoteAssetId);
    }, baseAssetId, quoteAssetId);
  },

};

export default MarketController;
