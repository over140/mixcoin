import Asset from './asset.js';
import Trade from './trade.js';

function Database(api, bugsnagClient) {
  this.api = api;
  this.asset = new Asset();
  this.trade = new Trade();
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
      var schemaBuilder = lf.schema.create('mixcoin', 4);

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
        addPrimaryKey(['base', 'quote']);

      schemaBuilder.createTable('trades').
        addColumn('trade_id', lf.Type.STRING).
        addColumn('side', lf.Type.STRING).
        addColumn('quote', lf.Type.STRING).
        addColumn('base', lf.Type.STRING).
        addColumn('price', lf.Type.STRING).
        addColumn('amount', lf.Type.STRING).
        addColumn('created_at', lf.Type.STRING).
        addPrimaryKey(['trade_id']);

      schemaBuilder.connect().then(function(database) {
        self.db = database;
        self.asset.db = database;
        self.trade.db = database;
        if (callback) {
          callback();
        }
      });
    }
  }

};

export default Database;
