function Asset(api) {
  this.api = api;
  this.chainAssets = require('./assets.json');
  this.assets = this.chainAssets;
  this.btcAsset = this.getBySym('BTC');
  this.xinAsset = this.getBySym('XIN');
  this.usdtAsset = this.getBySym('USDT');
}

Asset.prototype = {

  getCancelOrderAsset: function () {
    const oooAssetId = "de5a6414-c181-3ecc-b401-ce375d08c399";
    const cnbAssetId = "965e5c6e-434c-3fa9-b780-c50f43cd955c";
    const nxcAssetId = "66152c0b-3355-38ef-9ec5-cae97e29472a";
    const candyAssetId = "01c46685-f6b0-3c16-95c1-b3d9515e2c9f";

    const cancelAssets = [oooAssetId, cnbAssetId, nxcAssetId, candyAssetId];
    for (var i = 0; i < cancelAssets.length; i++) {
      const asset = this.getById(cancelAssets[i]);
      if (asset && parseFloat(asset.balance) > 0.00000001) {
        return asset;
      }
    }
    return undefined;
  },

  getChainById: function (id) {
    var assets = this.chainAssets;
    for (var i = 0; i < assets.length; i++) {
      if (assets[i].asset_id === id) {
        return assets[i];
      }
    }
    return undefined;
  },

  getById: function (id) {
    switch (id) {
      case this.btcAsset.asset_id:
        return this.btcAsset;
      case this.xinAsset.asset_id:
        return this.xinAsset;
      case this.usdtAsset.asset_id:
        return this.usdtAsset;
      default:
        var assets = this.assets;
        for (var i = 0; i < assets.length; i++) {
          if (assets[i].asset_id === id) {
            return assets[i];
          }
        } 
    }
    return undefined;
  },

  getBySym: function (sym) {
    var assets = this.assets;
    for (var i = 0; i < assets.length; i++) {
      if (assets[i].symbol === sym) {
        return assets[i];
      }
    }
    return undefined;
  },

  market: function (sym) {
    var ss = sym.split('-');
    if (ss.length !== 2) {
      return undefined;
    }
    var b = ss[0], q = ss[1];
    if (b === q) {
      return undefined;
    }
    switch (q) {
      case 'USDT':
        break;
      case 'BTC':
        if (b === 'USDT') {
          return undefined;
        }
        break;
      case 'XIN':
        if (b === 'USDT' || b === 'BTC') {
          return undefined;
        }
        break;
      default:
        return undefined;
    }
    var base = this.getBySym(b);
    var quote = this.getBySym(q);
    if (base && quote) {
      return [base, quote];
    }
    return undefined;
  }
};

export default Asset;
