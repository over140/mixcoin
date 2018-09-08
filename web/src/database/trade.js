import TimeUtils from '../utils/time.js';
import {BigNumber} from 'bignumber.js';

function Trade(database) {
  this.database = database;
}

Trade.prototype = {

  saveTrades: function (callback, trades, baseAssetId, quoteAssetId, market) {
    const db = this.database.db;
    const tradeTable = db.getSchema().table('trades');
    const marketTable = db.getSchema().table('markets');
    const predicate = lf.op.and(tradeTable.base.eq(baseAssetId), tradeTable.quote.eq(quoteAssetId));

    if (trades.length > 0) {
      const tx = db.createTransaction();
      tx.begin([tradeTable, marketTable]).then(function() {
        var rows = [];
        for (var i = 0; i < trades.length; i++) {
          const trade = trades[i];
          rows.push(tradeTable.createRow({
            'trade_id': trade.trade_id,
            'side': trade.side,
            'quote': trade.quote,
            'base': trade.base,
            'price': trade.price,
            'amount': trade.amount,
            'created_at': trade.created_at
          }));
        }
        return tx.attach(db.insertOrReplace().into(tradeTable).values(rows));
      }).then(function() {
        const date = TimeUtils.rfc3339(new Date(new Date().getTime() - 24*60*60*1000));
        const predicate = lf.op.and(tradeTable.base.eq(baseAssetId), tradeTable.quote.eq(quoteAssetId), tradeTable.created_at.gte(date));
        return tx.attach(db.select(tradeTable.amount, tradeTable.price).from(tradeTable).where(predicate).limit(1000).orderBy(tradeTable.created_at, lf.Order.DESC));
      }).then(function(trades) {
        var total = new BigNumber(0);
        var volume = new BigNumber(0);
        var price = market ? Number(market.price) : 0;
        var change = new BigNumber(0);
  
        for (var i = 0; i < trades.length; i++) {
          const trade = trades[i];
          const amount = new BigNumber(trade.amount);
          volume = volume.plus(amount);
          total = total.plus(amount.times(trade.price));
        }
  
        if (trades.length > 0) {
          price = trades[0].price;
        }
        if (trades.length > 1) {
          const open = new BigNumber(trades[trades.length - 1].price);
          const close = trades[0].price;
          change = open.minus(close);
        }

        const row = marketTable.createRow({
          'base': baseAssetId,
          'quote': quoteAssetId,
          'price': price,
          'volume': volume.toString(),
          'total': total.toString(),
          'change': change.toString(),
          'source': 'CLIENT',
          'favorite_time': ''
        })

        return tx.attach(db.insertOrReplace().into(marketTable).values([row]));
      }).then(function() {
        return tx.attach(db.select().from(tradeTable).where(predicate).limit(50).orderBy(tradeTable.created_at, lf.Order.DESC));
      }).then(function(rows) {
        callback(rows);
        return tx.commit();
      });
    } else {
      db.select().from(tradeTable).where(predicate).limit(50).orderBy(tradeTable.created_at, lf.Order.DESC).exec().then(function(rows) {
        callback(rows);
      });
    }
  },

  fetchTrades: function (callback, baseAssetId, quoteAssetId, limit) {
    const tradeTable = this.database.db.getSchema().table('trades');
    const predicate = lf.op.and(tradeTable.base.eq(baseAssetId), tradeTable.quote.eq(quoteAssetId));
    this.database.db.select().from(tradeTable).where(predicate).limit(limit).orderBy(tradeTable.created_at, lf.Order.DESC).exec().then(function(rows) {
      callback(rows);
    });
  },

  getLastTrade: function (callback, baseAssetId, quoteAssetId) {
    return this.fetchTrades(callback, baseAssetId, quoteAssetId, 1)
  }

};

export default Trade;
