
import Msgpack from '../helpers/msgpack.js';

function Order(bugsnagClient) {
  this.bugsnagClient = bugsnagClient;
  this.msgpack = new Msgpack();
}

Order.prototype = {

  decode: function (base64) {
    return new Buffer(base64.replace(/\-/g, '+').replace(/\_/g, '/'), 'base64');
  },

  isOrderMemo: function (base64) {
    return /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/.test(base64.replace(/\-/g, '+').replace(/\_/g, '/'));
  },

  decodeMemo: function(snapshot) {
    const buf = this.decode(snapshot.memo);
    try {
      return this.msgpack.decodeMap(buf, 0, buf.readUInt8(0) & 0x0f, 1);
    } catch (error) {
      this.bugsnagClient.notify(error, { metaData: snapshot });
    }
  },

  processSnapshots: function (snapshots) {
    const self = this;
    snapshots = snapshots.filter(function(snapshot) {
      return snapshot.memo !== '' && snapshot.memo !== undefined && self.isOrderMemo(snapshot.memo)
    });

    var orders = {};
    var entryOrders = [];

    for (var i = 0; i < snapshots.length; i++) {
      const snapshot = snapshots[i];
      var amount = new BigNumber(snapshot.amount);
      if (amount.isNegative()) {
        const orderAction = self.decodeMemo(snapshot);
        if (orderAction && !orderAction.O && orderAction.S && orderAction.A && orderAction.T) {
          if (orderAction.T === 'L' && !orderAction.P) {
            self.bugsnagClient.notify(new Error('Error Limit Order'), { metaData: snapshot });
            continue;
          }

          var order = {};
          order.order_id = snapshot.trace_id;
          order.order_type = orderAction.T;
          order.base_asset_id = orderAction.S === 'B' ? orderAction.A : snapshot.asset_id;
          order.quote_asset_id = orderAction.S === 'B' ? snapshot.asset_id : orderAction.A;
          if (orderAction.T === 'L' && orderAction.S === 'B') {
            const priceDecimal = new BigNumber(orderAction.P);
            if (isNaN(priceDecimal) || priceDecimal.isZero()) {
              continue;
            }
            order.remaining_amount = amount.div(priceDecimal);
          } else {
            order.remaining_amount = amount;
          }
          order.filled_amount = new BigNumber(0);
          order.side = orderAction.S;
          order.price = orderAction.P ? orderAction.P.replace(/\.?0+$/,"") : '0';
          order.state = 'PENDING';
          order.created_at = snapshot.created_at;
          orders[snapshot.trace_id] = order;
          entryOrders.push(order);
        }
      }
    }

    for (var i = 0; i < snapshots.length; i++) {
      const snapshot = snapshots[i];
      const amount = new BigNumber(snapshot.amount);
      if (amount.isPositive()) {
        const orderAction = self.decodeMemo(snapshot);
        if (orderAction && orderAction.S) {
          switch (orderAction.S) {
            case 'FILL':
            case 'REFUND':
            case 'CANCEL':
              const orderId = orderAction.O;
              var order = orders[orderId];
              if (order) {
                order.state = 'DONE';
                orders[orderId] = order;
              }
              break;
            case 'MATCH':
              const bidOrderId = orderAction.B;
              const askOrderId = orderAction.A;

              var order = orders[bidOrderId];
              if (!order || order.state === 'DONE' || order.base_asset_id !== snapshot.asset_id) {
                order = orders[askOrderId];
                if (!order || order.state === 'DONE' || order.quote_asset_id !== snapshot.asset_id) {
                  break;
                }
              }

              order.remaining_amount = order.remaining_amount.minus(amount);
              order.filled_amount = order.filled_amount.plus(amount);

              if (order.remaining_funds.isZero() && order.filled_amount.isZero()) {
                order.state = 'DONE';
              }
              orders[order.order_id] = order;
              break;
          }
        }
      }
    }
    return entryOrders;
  },

  saveOrders: function (orders, callback) {
    const orderTable = this.db.getSchema().table('orders');
    var rows = [];
    for (var i = 0; i < orders.length; i++) {
      const order = orders[i];
      rows.push(orderTable.createRow({
        'order_id': order.order_id,
        'order_type': order.order_type,
        'quote_asset_id': order.quote_asset_id,
        'base_asset_id': order.base_asset_id,
        'remaining_amount': order.remaining_amount,
        'filled_amount': order.filled_amount,
        'remaining_funds': order.remaining_funds,
        'filled_funds': order.filled_funds,
        'side': order.side,
        'price': order.price,
        'state': order.state,
        'created_at': order.created_at
      }));
    }

    this.db.insertOrReplace().into(orderTable).values(rows).exec().then(function(rows) {
      if (callback) {
        callback(rows);
      }
    });
  },

  fetchOrders: function (callback) {
    const orderTable = this.db.getSchema().table('orders');
    this.db.select().from(orderTable).exec().then(function(rows) {
      callback(rows);
    });
  }

};

export default Order;
