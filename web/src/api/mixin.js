import Account from './account.js';

function Mixin(api) {
  this.api = api;
  this.account = new Account(this);
}

Mixin.prototype = {
  environment: function () {
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.MixinContext) {
      return 'iOS';
    }
    if (window.MixinContext && window.MixinContext.getContext) {
      return 'Android';
    }
    return undefined;
  },

  assets: function (callback) {
    this.api.requestMixin('GET', 'https://mixin-api.zeromesh.net/assets', undefined, function (resp) {
      return callback(resp);
    });
  },

  asset: function (callback, id) {
    this.api.requestMixin('GET', 'https://mixin-api.zeromesh.net/assets/' + id, undefined, function (resp) {
      return callback(resp);
    });
  },

  search: function (callback, symbol) {
    this.api.requestMixin('GET', 'https://mixin-api.zeromesh.net/network/assets/search/' + symbol, undefined, function (resp) {
      return callback(resp);
    });
  },

  snapshot: function (callback, snapshotId) {
    this.api.requestMixin('GET', 'https://mixin-api.zeromesh.net/snapshots/' + snapshotId, undefined, function (resp) {
      return callback(resp);
    });
  },

  snapshots: function (callback, offset, limit, opponent) {
    if (limit === undefined) {
      limit = 500;
    }
    var url = 'https://mixin-api.zeromesh.net/snapshots?limit=' + limit + '&offset=' + offset
    if (opponent) {
      url += '&opponent=' + opponent
    }
    this.api.requestMixin('GET', url, undefined, function (resp) {
      return callback(resp);
    });
  },

  conversation: function (callback, conversationId) {
    this.api.requestMixin('GET', 'https://mixin-api.zeromesh.net/conversations/' + conversationId, undefined, function (resp) {
      return callback(resp);
    });
  },

  verifyTrade: function(callback, trace) {
    this.api.requestMixin('GET', 'https://mixin-api.zeromesh.net/transfers/trace/'+trace, undefined, function(resp) {
      return callback(resp);
    });
  }
};

export default Mixin;
