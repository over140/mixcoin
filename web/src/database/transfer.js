
function Transfer() {

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
    return this.db.insertOrReplace().into(transferTable).values(rows);
  }

};

export default Transfer;
