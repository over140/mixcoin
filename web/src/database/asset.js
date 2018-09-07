
function Asset(database) {
  this.database = database;
  const assets = require('./assets.json');
  this.cache(assets);
  this.btcAsset = this.cacheAssets['c6d0c728-2624-429b-8e0d-d9d19b6592fa'];
  this.xinAsset = this.cacheAssets['c94ac88f-4671-3976-b60a-09064f1811e8'];
  this.usdtAsset = this.cacheAssets['815b0b1a-2764-3736-8faa-42d694fa620a'];
}

Asset.prototype = {

  getById: function (assetId) {
    const asset = this.cacheAssets[assetId];
    if (asset) {
      return asset;
    }
    switch (assetId) {
      case this.btcAsset.asset_id:
        return this.btcAsset;
      case this.xinAsset.asset_id:
        return this.xinAsset;
      case this.usdtAsset.asset_id:
        return this.usdtAsset;
      default:
        return null;
    }
  },

  cache: function (assets) {
    var cacheAssets = {};
    for (var j = 0; j < assets.length; j++) {
      const asset = assets[j];
      cacheAssets[asset.asset_id] = asset;
    }
    this.cacheAssets = cacheAssets;
  },

  saveAsset: function (asset, callback) {
    const assetTable = this.database.db.getSchema().table('assets');
    var row = assetTable.createRow({
      'asset_id': asset.asset_id,
      'chain_id': asset.chain_id,
      'icon_url': asset.icon_url,
      'symbol': asset.symbol,
      'balance': asset.balance,
      'price_usd': asset.price_usd,
      'name': asset.name
    });
    this.database.db.insertOrReplace().into(assetTable).values([row]).exec().then(function(rows) {
      if (callback) {
        callback(rows);
      }
    });
  },

  saveAssets: function (assets, callback) {
    const assetTable = this.database.db.getSchema().table('assets');
    var rows = [];
    for (var i = 0; i < assets.length; i++) {
      const asset = assets[i];
      rows.push(assetTable.createRow({
        'asset_id': asset.asset_id,
        'chain_id': asset.chain_id,
        'icon_url': asset.icon_url,
        'symbol': asset.symbol,
        'balance': asset.balance,
        'price_usd': asset.price_usd,
        'name': asset.name
      }));
    }
    this.database.db.insertOrReplace().into(assetTable).values(rows).exec().then(function(rows) {
      if (callback) {
        callback(rows);
      }
    });
  },

  fetchAssets: function (callback) {
    const assetTable = this.database.db.getSchema().table('assets');
    this.database.db.select().from(assetTable).exec().then(function(rows) {
      callback(rows);
    });
  }

};

export default Asset;
