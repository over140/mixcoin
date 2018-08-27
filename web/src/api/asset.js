function Asset(api) {
  this.api = api;
  this.chainAssets = require('./assets.json');
  this.assets = this.chainAssets;
  this.btcAsset = this.getBySym('BTC');
  this.xinAsset = this.getBySym('XIN');
  this.usdtAsset = this.getBySym('USDT');
}

Asset.prototype = {

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
