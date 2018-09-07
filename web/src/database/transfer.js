
function Transfer(database) {
  this.database = database;
}

Transfer.prototype = {

  saveTransfers: function (db, transfers) {
    const transferTable = db.getSchema().table('transfers');
    var rows = [];
    for (var i = 0; i < transfers.length; i++) {
      const transfer = transfers[i];
      rows.push(transferTable.createRow({
        'transfer_id': transfer.transfer_id,
        'source': transfer.source,
        'amount': transfer.amount,
        'asset_id': transfer.asset_id,
        'order_id': transfer.order_id,
        'ask_order_id': transfer.ask_order_id,
        'bid_order_id': transfer.bid_order_id,
        'created_at': transfer.created_at
      }));
    }
    return db.insertOrReplace().into(transferTable).values(rows);
  },

  
  getTransfers: function (callback, orderId) {
    const transferTable = this.database.db.getSchema().table('transfers');
    const predicate = lf.op.or(transferTable.ask_order_id.eq(orderId), transferTable.bid_order_id.eq(orderId), transferTable.order_id.eq(orderId));
    this.database.db.select().from(transferTable).where(predicate).exec().then(function(rows) {
      callback(rows);
    });
  }

};

export default Transfer;
