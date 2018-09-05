import Asset from './asset.js';
import Order from './order.js';
import Trade from './trade.js';
import Transfer from './transfer.js';

function Database() {
  this.asset = new Asset();
  this.trade = new Trade();
  this.order = new Order();
  this.transfer = new Transfer();
  this.lf = require("lovefield");
}

Database.prototype = {

  prepare: function(callback) {
    const self = this;
    if (self.db) {
      if (callback) {
        callback();
      }
    } else {
      var schemaBuilder = lf.schema.create('mixcoin', 8);

      schemaBuilder.createTable('assets').
        addColumn('asset_id', lf.Type.STRING).
        addColumn('chain_id', lf.Type.STRING).
        addColumn('icon_url', lf.Type.STRING).
        addColumn('symbol', lf.Type.STRING).
        addColumn('balance', lf.Type.STRING).
        addColumn('price_usd', lf.Type.STRING).
        addColumn('name', lf.Type.STRING).
        addPrimaryKey(['asset_id']);

      schemaBuilder.createTable('markets').
        addColumn('base', lf.Type.STRING).
        addColumn('quote', lf.Type.STRING).
        addColumn('price', lf.Type.NUMBER).
        addColumn('volume', lf.Type.NUMBER).
        addColumn('total', lf.Type.NUMBER).
        addColumn('change', lf.Type.NUMBER).
        addColumn('quote_usd', lf.Type.NUMBER).
        addColumn('favorite_time', lf.Type.DATE_TIME).
        addColumn('source', lf.Type.STRING).
        addPrimaryKey(['base', 'quote']);

      schemaBuilder.createTable('trades').
        addColumn('trade_id', lf.Type.STRING).
        addColumn('side', lf.Type.STRING).
        addColumn('quote', lf.Type.STRING).
        addColumn('base', lf.Type.STRING).
        addColumn('price', lf.Type.STRING).
        addColumn('amount', lf.Type.STRING).
        addColumn('created_at', lf.Type.STRING).
        addPrimaryKey(['trade_id']).
        addIndex('idx_created_at', ['base', 'quote', 'created_at'], true, lf.Order.DESC);

      schemaBuilder.createTable('orders').
        addColumn('order_id', lf.Type.STRING).
        addColumn('order_type', lf.Type.STRING).
        addColumn('quote_asset_id', lf.Type.STRING).
        addColumn('base_asset_id', lf.Type.STRING).
        addColumn('amount', lf.Type.STRING).
        addColumn('filled_amount', lf.Type.STRING).
        addColumn('side', lf.Type.STRING).
        addColumn('price', lf.Type.STRING).
        addColumn('state', lf.Type.STRING).
        addColumn('created_at', lf.Type.STRING).
        addPrimaryKey(['order_id']).
        addIndex('idx_created_at', ['created_at'], true, lf.Order.DESC).
        addIndex('idx_state', ['state']);

      schemaBuilder.createTable('transfers').
        addColumn('transfer_id', lf.Type.STRING).
        addColumn('source', lf.Type.STRING).
        addColumn('amount', lf.Type.STRING).
        addColumn('asset_id', lf.Type.STRING).
        addColumn('order_id', lf.Type.STRING).
        addColumn('ask_order_id', lf.Type.STRING).
        addColumn('bid_order_id', lf.Type.STRING).
        addColumn('created_at', lf.Type.STRING).
        addPrimaryKey(['transfer_id']);

      schemaBuilder.connect().then(function(database) {
        self.db = database;
        self.asset.db = database;
        self.trade.db = database;
        self.order.db = database;
        self.transfer.db = database;
        if (callback) {
          callback();
        }
      });
    }
  }

};

export default Database;
