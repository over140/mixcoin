import TimeUtils from '../utils/time.js';
import {BigNumber} from 'bignumber.js';

function Market(database) {
  this.database = database;
}

Market.prototype = {
  
  saveMarket: function (callback, market) {
    const marketTable = this.database.db.getSchema().table('markets');
    var row = marketTable.createRow({
      'base': market.base,
      'quote': market.quote,
      'price': market.price,
      'volume': market.volume,
      'total': market.total,
      'change': market.change,
      'source': market.source,
      'favorite_time': ''
    });
    this.database.db.insertOrReplace().into(marketTable).values([row]).exec().then(function(rows) {
      if (callback) {
        callback(market);
      }
    });
  },

  saveMarkets: function (callback, markets) {
    const self = this;
    const marketTable = this.database.db.getSchema().table('markets');
    var rows = [];
    for (var i = 0; i < markets.length; i++) {
      const market = markets[i];
      rows.push(marketTable.createRow({
        'base': market.base,
        'quote': market.quote,
        'price': market.price,
        'volume': market.volume,
        'total': market.total,
        'change': market.change,
        'source': market.source,
        'favorite_time': ''
      }));
    }
    this.database.db.insertOrReplace().into(marketTable).values(rows).exec().then(function(rows) {
      if (callback) {
        self.database.db.select().from(marketTable).where(marketTable.price.gt('0')).exec().then(function(rows) {
          callback(rows);
        });
      }
    });
  },

  getMarket: function (callback, baseAssetId, quoteAssetId) {
    const marketTable = this.database.db.getSchema().table('markets');
    const predicate = lf.op.and(marketTable.base.eq(baseAssetId), marketTable.quote.eq(quoteAssetId));
    this.database.db.select().from(marketTable).where(predicate).exec().then(function(rows) {
      callback(rows[0]);
    });
  },

  updateClientMarket: function (callback, baseAssetId, quoteAssetId, market) {
    const db = this.database.db;
    const tx = db.createTransaction();
    const marketTable = db.getSchema().table('markets');
    const tradeTable = db.getSchema().table('trades');
    const marketPredicate = lf.op.and(marketTable.base.eq(baseAssetId), marketTable.quote.eq(quoteAssetId));

    tx.begin([tradeTable, marketTable]).then(function() {
      const date = TimeUtils.rfc3339(new Date(new Date().getTime() - 24*60*60*1000));
      const predicate = lf.op.and(tradeTable.base.eq(baseAssetId), tradeTable.quote.eq(quoteAssetId), tradeTable.created_at.gte(date));
      return tx.attach(db.select(tradeTable.amount, tradeTable.price).from(tradeTable).where(predicate).limit(1000).orderBy(tradeTable.created_at, lf.Order.DESC));
    }).then(function(trades) {
      if (trades.length == 0) {
        return Promise.resolve();
      }
      var total = new BigNumber(0);
      var volume = new BigNumber(0);
      var change = new BigNumber(0);

      for (var i = 0; i < trades.length; i++) {
        const trade = trades[i];
        const amount = new BigNumber(trade.amount);
        volume = volume.plus(amount);
        total = total.plus(amount.times(trade.price));
      }

      const lastTrade = trades[trades.length - 1];
      const open = new BigNumber(lastTrade.price);
      const close = trades[0].price;
      change = open.minus(close);

      if (market) {
        return tx.attach(db.update(marketTable)
          .set(marketTable.volume, volume.toString())
          .set(marketTable.total, total.toString())
          .set(marketTable.change, change.toString())
          .where(marketPredicate));
      } else {
        const row = marketTable.createRow({
          'base': baseAssetId,
          'quote': quoteAssetId,
          'price': lastTrade.price,
          'volume': volume.toString(),
          'total': total.toString(),
          'change': change.toString(),
          'source': 'CLIENT',
          'favorite_time': ''
        });
        return tx.attach(db.insertOrReplace().into(marketTable).values([row]));
      }
    }).then(function() {
      const predicate = lf.op.and(tradeTable.base.eq(baseAssetId), tradeTable.quote.eq(quoteAssetId));
      return tx.attach(db.select().from(tradeTable).where(predicate).limit(1).orderBy(tradeTable.created_at, lf.Order.DESC));
    }).then(function(trades) {
      const lastTrade = trades[0];
      if (!lastTrade) {
        return Promise.resolve();
      }
      if (market) {
        return tx.attach(db.update(marketTable).set(marketTable.price, lastTrade.price).where(marketPredicate));
      } else {
        const row = marketTable.createRow({
          'base': baseAssetId,
          'quote': quoteAssetId,
          'price': lastTrade.price,
          'volume': '0',
          'total': '0',
          'change': '0',
          'source': 'CLIENT',
          'favorite_time': ''
        });
        return tx.attach(db.insertOrReplace().into(marketTable).values([row]));
      }
    }).then(function() {
      return tx.attach(db.select().from(marketTable).where(marketPredicate));
    }).then(function(markets) {
      callback(markets[0]);
      return tx.commit();
    });
  },

  fetchMarkets: function (callback) {
    const marketTable = this.database.db.getSchema().table('markets');
    const predicate = marketTable.price.gt('0');
    this.database.db.select().from(marketTable).where(predicate).exec().then(function(rows) {
      callback(rows);
    });
  }

};

export default Market;
