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
