
import Msgpack from '../helpers/msgpack.js';
import TimeUtils from '../utils/time.js';
import {BigNumber} from 'bignumber.js';

function Snapshot(api, db, bugsnag) {
  this.api = api
  this.database = db;
  this.bugsnag = bugsnag;
  this.firstTradeTime = '2018-08-11T23:59:59.779447612Z'
  this.msgpack = new Msgpack();
}

Snapshot.prototype = {

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
      this.bugsnag.notify(error, { metaData: snapshot });
    }
  },

  fetchNextPage: function(resp, pageEnd, limit) {
    if (resp.data.length === 0) {
      return;
    }

    const lastSnapshot = resp.data[resp.data.length - 1];
    const firstSnapshot = resp.data[0];
    const endTime = window.localStorage.getItem('end_snapshots');
    const startTime = window.localStorage.getItem('start_snapshots');

    if (startTime == null || firstSnapshot.created_at > startTime) {
      window.localStorage.setItem('start_snapshots', firstSnapshot.created_at);
    }

    if (pageEnd || lastSnapshot.created_at <= this.firstTradeTime) {
      window.localStorage.setItem('end_snapshots', this.firstTradeTime);
    } else if (endTime == null || lastSnapshot.created_at < endTime) {
      window.localStorage.setItem('end_snapshots', lastSnapshot.created_at);
      this.syncSnapshots(lastSnapshot.created_at, limit);
    }
  },

  syncSnapshots: function (offset, limit) {
    const self = this;
    const endTime = window.localStorage.getItem('end_snapshots');
    const maxLimit = 500;

    if (limit === undefined) {
      limit = 50;
    }

    if (offset == undefined) {
      if (endTime == null) {
        offset = TimeUtils.rfc3339(new Date());
        limit = maxLimit;
      } else {
        if (endTime > this.firstTradeTime) {
          offset = endTime;
          limit = maxLimit;
        } else {
          offset = TimeUtils.rfc3339(new Date());
        }
      }
    }

    self.api.mixin.snapshots(function (resp) {
      if (resp.error) {
        self.api.notifyError('error', resp.error);
        return;
      }
      if (!resp.data) {
        return;
      }

      if (resp.data.length == 0) {
        if (endTime == null) {
          window.localStorage.setItem('end_snapshots', this.firstTradeTime);
        }
        return;
      }

      self.processSnapshots(resp, limit);
    }, offset, limit);
  },

  processSnapshots: function (resp, limit) {
    const self = this;
    const startTime = window.localStorage.getItem('start_snapshots');
    const endTime = window.localStorage.getItem('end_snapshots');
    const isPageEnded = resp.data.length < limit;
    var snapshots = resp.data;

    if (startTime != null && endTime != null) {
      snapshots = resp.data.filter(function(snapshot) {
        return snapshot.created_at > startTime || snapshot.created_at < endTime;
      });
    }

    snapshots = snapshots.filter(function(snapshot) {
      return snapshot.memo !== '' && snapshot.memo !== undefined && self.isOrderMemo(snapshot.memo)
    });

    var orderMaps = {};
    var orders = [];
    var transfers = [];

    for (var i = 0; i < snapshots.length; i++) {
      const snapshot = snapshots[i];
      var amount = new BigNumber(snapshot.amount);
      const orderAction = self.decodeMemo(snapshot);
      if (!orderAction) {
        continue;
      }
      
      if (amount.isNegative()) {
        if (!orderAction.O && orderAction.S && orderAction.A && orderAction.T) {
          if (orderAction.T === 'L' && !orderAction.P) {
            self.bugsnag.notify(new Error('Error Limit Order'), { metaData: snapshot });
            continue;
          }

          var order = {};
          order.order_id = snapshot.trace_id;
          order.order_type = orderAction.T;
          order.quote_asset_id = orderAction.S === 'B' ? snapshot.asset_id : orderAction.A;
          order.base_asset_id = orderAction.S === 'B' ? orderAction.A : snapshot.asset_id;
          if (orderAction.T === 'L' && orderAction.S === 'B') {
            const priceDecimal = new BigNumber(orderAction.P);
            if (isNaN(priceDecimal) || priceDecimal.isZero()) {
              continue;
            }
            order.amount = amount.div(priceDecimal).abs();
          } else {
            order.amount = amount.abs();
          }
          order.filled_amount = new BigNumber(0);
          order.side = orderAction.S;
          order.price = orderAction.P ? orderAction.P.replace(/\.0+$/,"") : '0';
          order.state = 'PENDING';
          order.created_at = snapshot.created_at;
          orderMaps[snapshot.trace_id] = order;
          orders.push(order);
        }
      } else {
        if (orderAction.S) {
          var transfer = {};
          transfer.transfer_id = snapshot.trace_id;
          transfer.source = orderAction.S;
          transfer.amount = snapshot.amount;
          transfer.asset_id = snapshot.asset_id;
          transfer.order_id = '';
          transfer.ask_order_id = '';
          transfer.bid_order_id = '';
          transfer.created_at = snapshot.created_at;
          switch (orderAction.S) {
            case 'FILL':
            case 'REFUND':
            case 'CANCEL':
              const order_id = orderAction.O;
              if (order_id) {
                transfer.order_id = order_id;
                transfers.push(transfer);
              }
              break;
            case 'MATCH':
              transfer.ask_order_id = orderAction.A;
              transfer.bid_order_id = orderAction.B;
              transfers.push(transfer);
              break;
          }
        }
      }
    }

    for (var i = 0; i < transfers.length; i++) {
      const transfer = transfers[i];
      if (transfer.source !== 'MATCH') {
        var order = orderMaps[transfer.order_id];
        if (order) {
          order.state = 'DONE';
        }
      }
    }

    if (orders.length === 0 && transfers.length === 0) {
      self.fetchNextPage(resp, isPageEnded, limit);
      return;
    }

    const db = self.database.db;
    if (db) {
      const tx = db.createTransaction();
      const orderTable = db.getSchema().table('orders');
      const transferTable = db.getSchema().table('transfers');

      tx.begin([orderTable, transferTable]).then(function() {
        return tx.attach(self.database.order.saveOrders(db, orders));
      }).then(function() {
        return tx.attach(self.database.transfer.saveTransfers(db, transfers));
      }).then(function() {
        return tx.attach(db.select().from(orderTable).where(orderTable.state.eq('PENDING')));
      }).then(function(orders) {
        self.pendingOrders = orders;
        var ids = orders.map(function(row) {
          return row['order_id'];
        });
        const predicate = lf.op.or(transferTable.ask_order_id.in(ids), transferTable.bid_order_id.in(ids), transferTable.order_id.in(ids));
        return tx.attach(db.select().from(transferTable).where(predicate));
      }).then(function(transfers) {
        var pendingOrders = self.pendingOrders;
        var orders = {};

        for (var i = 0; i < pendingOrders.length; i++) {
          var order = pendingOrders[i];
          order.filled_amount = new BigNumber(0);
          order.amount = new BigNumber(order.amount);
          orders[order.order_id] = order;
        }

        for (var i = 0; i < transfers.length; i++) {
          const transfer = transfers[i];
          switch (transfer.source) {
            case 'FILL':
            case 'REFUND':
            case 'CANCEL':
              var order = orders[transfer.order_id];
              if (order) {
                order.state = 'DONE';  
              }
              break;
            case 'MATCH':
              var order = orders[transfer.ask_order_id];
              if (!order || order.state === 'DONE' || order.quote_asset_id !== transfer.asset_id) {
                order = orders[transfer.bid_order_id];
                if (!order || order.state === 'DONE' || order.base_asset_id !== transfer.asset_id) {
                  break;
                }
              }
    
              order.filled_amount = order.filled_amount.plus(transfer.amount);
              if (order.order_type === 'L' && order.side === 'S') {
                if (order.filled_amount.multipliedBy(1.0011).isGreaterThanOrEqualTo(order.amount.multipliedBy(order.price))) {
                  order.state = 'DONE';
                }
              } else {
                if (order.filled_amount.multipliedBy(1.0011).isGreaterThanOrEqualTo(order.amount)) {
                  order.state = 'DONE';
                }
              }
              break;
          }
        }
        return tx.attach(self.database.order.saveOrders(db, pendingOrders));
      }).then(function() {
        return tx.commit();
      }).then(function() {
        self.fetchNextPage(resp, isPageEnded, limit);
      });
    }
  }

};

export default Snapshot;
