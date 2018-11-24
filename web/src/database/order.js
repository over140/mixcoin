
function Order(database) {
  this.database = database;
}

Order.prototype = {

  saveOrders: function (db, orders) {
    const orderTable = db.getSchema().table('orders');
    var rows = [];
    for (var i = 0; i < orders.length; i++) {
      var order = orders[i];
      order.amount = order.amount.toString();
      order.filled_amount = order.filled_amount.toString();
      rows.push(orderTable.createRow({
        'order_id': order.order_id,
        'order_type': order.order_type,
        'quote_asset_id': order.quote_asset_id,
        'base_asset_id': order.base_asset_id,
        'amount': order.amount,
        'filled_amount': order.filled_amount,
        'side': order.side,
        'price': order.price,
        'state': order.state,
        'created_at': order.created_at
      }));
    }
    return db.insertOrReplace().into(orderTable).values(rows);
  },

  fetchOrders: function (callback) {
    const orderTable = this.database.db.getSchema().table('orders');
    this.database.db.select().from(orderTable).orderBy(orderTable.created_at, lf.Order.DESC).exec().then(function(rows) {
      callback(rows);
    });
  },

  canceledOrder: function (orderId) {
    const orderTable = this.database.db.getSchema().table('orders');
    this.database.db.update(orderTable).set(orderTable.state, 'DONE').where(orderTable.order_id.eq(orderId)).exec();
  },

  getOrder: function (callback, orderId) {
    const orderTable = this.database.db.getSchema().table('orders');
    this.database.db.select().from(orderTable).where(orderTable.order_id.eq(orderId)).exec().then(function(rows) {
      callback(rows);
    });
  }

};

export default Order;
