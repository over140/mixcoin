
import Msgpack from '../helpers/msgpack.js';

function Trade() {
}

Trade.prototype = {

  saveTrades: function (trades, callback) {
    const tradeTable = this.db.getSchema().table('trades');
    var rows = [];
    for (var i = 0; i < trades.length; i++) {
      const trade = trades[i];
      rows.push(orderTable.createRow({
        'trade_id': trade.trade_id,
        'side': trade.side,
        'quote': trade.quote,
        'base': trade.base,
        'price': trade.price,
        'amount': trade.amount,
        'created_at': trade.created_at
      }));
    }

    this.db.insertOrReplace().into(tradeTable).values(rows).exec().then(function(rows) {
      if (callback) {
        callback(rows);
      }
    });
  },

  fetchTrade: function (callback) {
    const tradeTable = this.db.getSchema().table('trades');
    this.db.select().from(tradeTable).exec().then(function(rows) {
      callback(rows);
    });
  }

};

export default Trade;
