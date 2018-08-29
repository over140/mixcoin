import './index.scss';
import $ from 'jquery';
import 'intl-tel-input/build/css/intlTelInput.css';
import 'intl-tel-input';
import uuid from 'uuid/v4';
import Mixin from '../api/mixin.js';
import {BigNumber} from 'bignumber.js';
import TimeUtils from '../utils/time.js';

function Account(router, api) {
  this.router = router;
  this.api = api;
  this.templateOrders = require('./orders.html');
  this.itemOrder = require('./order_item.html');
  this.mixin = new Mixin(this);
  this.assets = {};
}

Account.prototype = {

  hideLoader: function() {
    $('.cancel.order.form .submit-loader').hide();
    $('.cancel.order.form :submit').show();
    $('.cancel.order.form :submit').prop('disabled', false);
  },

  encode: function (buffer) {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  },

  decode: function (base64) {
    return new Buffer(base64.replace(/\-/g, '+').replace(/\_/g, '/'), 'base64');
  },

  isOrderMemo: function (base64) {
    return /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/.test(base64.replace(/\-/g, '+').replace(/\_/g, '/'));
  },

  fetchAssets: function (callback) {
    this.api.mixin.assets(function (resp) {
      if (resp.error) {
        return;
      }

      var assets = {};
      for (var i = 0; i < resp.data.length; i++) {
        const asset = resp.data[i];
        assets[asset.asset_id] = asset;
      }

      callback(assets);
    });
  },

  decodeArray: function (uuidParse, buf, offset, length, headerLength) {
    var result = []
    var i
    var totalBytesConsumed = 0

    offset += headerLength
    for (i = 0; i < length; i++) {
      var decodeResult = this.tryDecode(uuidParse, buf, offset)
      if (decodeResult) {
        result.push(decodeResult.value)
        offset += decodeResult.length
        totalBytesConsumed += decodeResult.length
      } else {
        return null
      }
    }
    return { value: uuidParse.unparse(result), length: headerLength + totalBytesConsumed }
  },

  getSize: function (first) {
    switch (first) {
      case 0xc4:
        return 2
      case 0xc5:
        return 3
      case 0xc6:
        return 5
      case 0xc7:
        return 3
      case 0xc8:
        return 4
      case 0xc9:
        return 6
      case 0xca:
        return 5
      case 0xcb:
        return 9
      case 0xcc:
        return 2
      case 0xcd:
        return 3
      case 0xce:
        return 5
      case 0xcf:
        return 9
      case 0xd0:
        return 2
      case 0xd1:
        return 3
      case 0xd2:
        return 5
      case 0xd3:
        return 9
      case 0xd4:
        return 3
      case 0xd5:
        return 4
      case 0xd6:
        return 6
      case 0xd7:
        return 10
      case 0xd8:
        return 18
      case 0xd9:
        return 2
      case 0xda:
        return 3
      case 0xdb:
        return 5
      case 0xde:
        return 3
      default:
        return -1
    }
  },

  hasMinBufferSize: function (first, length) {
    var size = this.getSize(first)

    if (size !== -1 && length < size) {
      return false
    } else {
      return true
    }
  },

  tryDecode: function (uuidParse, buf, offset) {
    offset = offset === undefined ? 0 : offset
    var bufLength = buf.length - offset
    if (bufLength <= 0) {
      return null;
    }

    var type = buf.readUInt8(offset);
    if (!this.hasMinBufferSize(type, bufLength)) {
      return null
    }

    switch (type) {
      case 0xc0:
      return { value: null, length: 1 };
      case 0xc2:
        return { value: false, length: 1 };
      case 0xc3:
        return { value: true, length: 1 };
      case 0xcc:  // 1-byte unsigned int
        return { value: buf.readUInt8(offset + 1), length: 2 };
      case 0xcd:  // 2-bytes BE unsigned int
        return { value: buf.readUInt16BE(offset + 1), length: 3 };
      case 0xce:  // 4-bytes BE unsigned int
        return { value: buf.readUInt32BE(offset + 1), length: 5 };
      case 0xd0:  // 1-byte signed int
        return { value: buf.readInt8(offset + 1), length: 2 };
      case 0xd1:
        return { value: buf.readInt16BE(offset + 1), length: 3 };
      case 0xd2:
        return { value: buf.readInt32BE(offset + 1), length: 5 };
      case 0xd9:  // strings up to 2^8 - 1 bytes
        length = buf.readUInt8(offset + 1);
        return { value: buf.toString('utf8', offset + 2, offset + 2 + length), length: length };
      case 0xda:  // strings up to 2^16 - 2 bytes
        length = buf.readUInt16BE(offset + 1)
        return { value: buf.toString('utf8', offset + 3, offset + 3 + length), length: length };
      case 0xdb:  // strings up to 2^32 - 4 bytes
        length = buf.readUInt32BE(offset + 1);
        return { value: buf.toString('utf8', offset + 5, offset + 5 + length), length: length };
      case 0xdc:
        length = buf.readUInt16BE(offset + 1)
        return this.decodeArray(uuidParse, buf, offset, length, 3);
      case 0xb0:
        length = buf.readUInt16BE(offset + 1);
        return { value: uuidParse.unparse(buf.slice(offset + 1, offset + 1 + 16)), length: 16 + 1 };
      default:
        if ((type & 0xf0) === 0x90) {
          length = type & 0x0f;
          return this.decodeArray(uuidParse, buf, offset, length, 1);
        } else if ((type & 0xf0) === 0x80) {
          length = type & 0x0f;
          return self.decodeMap(uuidParse, buf, offset, length, 1);
        } else if ((type & 0xe0) === 0xa0) {
          length = type & 0x1f
          return { value: buf.toString('utf8', offset + 1, offset + length + 1), length: length + 1 };
        } else if (type >= 0xe0) {
          return { value: type - 0x100, length: 1 };
        } else if (type < 0x80) {
          return { value: type, length: 1 };
        }
        break;
    }
    return null;
  },

  decodeMap: function (buf, offset, length, headerLength) {
    var result = {};
    offset += headerLength;

    const uuidParse = require('uuid-parse');

    for (var i = 0; i < length; i++) {
      const key = this.tryDecode(uuidParse, buf, offset);
      if (key) {
        offset += key.length;
        const value = this.tryDecode(uuidParse, buf, offset);
        if (value) {
          result[key.value] = value.value;
          offset += value.length;
        }
      }
    }

    return result
  },

  decodeMemo: function(memo) {
    const buf = this.decode(memo);
    return this.decodeMap(buf, 0, buf.readUInt8(0) & 0x0f, 1);
  },

  orders: function () {
    const self = this;
    self.fetchAssets(function (assets) {

      self.assets = assets;
      self.api.mixin.snapshots(function (resp) {
        if (resp.error) {
          self.api.notifyError('error', resp.error);
          return;
        }
  
        resp.data = resp.data.filter(function(snapshot) {
          return snapshot.memo !== '' && snapshot.memo !== undefined && self.isOrderMemo(snapshot.memo)
        });
  
        var orders = {};
        var entryOrders = [];
  
        for (var i = 0; i < resp.data.length; i++) {
          const snapshot = resp.data[i];
          var amount = new BigNumber(snapshot.amount);
          if (amount.isNegative()) {
            const orderAction = self.decodeMemo(snapshot.memo);
            if (orderAction && !orderAction.O && orderAction.T) {
              entryOrders.push(snapshot.trace_id);
              var order = {};
              order.state = 'PENDING';

              if (orderAction.S === 'B') {
                order.quote = assets[orderAction.A];
                order.base = assets[snapshot.asset_id];
              } else {
                order.quote = assets[snapshot.asset_id];
                order.base = assets[orderAction.A];
              }
              order.assetId = orderAction.A;

              if (orderAction.T === 'L' && orderAction.S === 'B') {
                amount = amount.div(new BigNumber(orderAction.P));
              }

              if (orderAction.T === 'M' && orderAction.S === 'A') {
                order.amount_symbol = order.base.symbol;
              } else {
                if (order.quote) {
                  order.amount_symbol = order.quote.symbol;
                } else {
                  order.amount_symbol = '???'
                }
              }

              if (orderAction.T === 'L') {
                order.price = orderAction.P.replace(/\.?0+$/,"");
                if (order.base) {
                  order.price_symbol = order.base.symbol;
                } else {
                  order.price_symbol = '???'
                }
              }
              
              order.type = orderAction.T;
              order.side = orderAction.S === 'B' ? 'Buy' : 'Sell';
              order.sideLocale = orderAction.S === 'B' ? window.i18n.t('market.form.buy') : window.i18n.t('market.form.sell');
              order.created_at = TimeUtils.short(snapshot.created_at);
              order.amount = amount.abs();
              order.order_id = snapshot.trace_id;
              order.trace = uuid().toLowerCase();

              orders[snapshot.trace_id] = order;
            }
          }
        }

        for (var i = 0; i < resp.data.length; i++) {
          const snapshot = resp.data[i];
          const amount = new BigNumber(snapshot.amount);
          if (amount.isPositive()) {
            const orderAction = self.decodeMemo(snapshot.memo);
            if (orderAction && orderAction.S) {
              switch (orderAction.S) {
                case 'FILL':
                case 'REFUND':
                case 'CANCEL':
                  const orderId = orderAction.O;
                  var order = orders[orderId];
                  if (order) {
                    order.filled_amount = undefined;
                    order.state = 'DONE';
                    orders[orderId] = order;
                  }
                  break;
                case 'MATCH':
                  const askOrderId = orderAction.A;
                  const bidOrderId = orderAction.B;

                  var order = orders[askOrderId];
                  if (!order || order.state === 'DONE' || order.assetId !== snapshot.asset_id) {
                    order = orders[bidOrderId];
                    if (!order || order.state === 'DONE' || order.assetId !== snapshot.asset_id) {
                      break;
                    }
                  }
                  
                  
                  if (!order.filled_amount) {
                    order.filled_amount = new BigNumber(0);
                  }
                  var fill_amount = amount;
                  if (order.type === 'L' && order.side === 'Sell') {
                    fill_amount = amount.div(new BigNumber(order.price));
                  }
                  order.filled_amount = order.filled_amount.plus(fill_amount.abs());
                  if (order.filled_amount.multipliedBy(1.0011).isGreaterThanOrEqualTo(order.amount)) {
                    order.filled_amount = undefined;
                    order.state = 'DONE';
                  }
                  orders[order.order_id] = order;
                  break;
              } 
            }
          }
        }
  
        var orderArray = [];
        for (var i = 0; i < entryOrders.length; i++) {
          const order = orders[entryOrders[i]];
          if (order) {
            orderArray.push(order)
          }
        }
        self.orders = orderArray;
  
        $('body').attr('class', 'account layout');
        $('#layout-container').html(self.templateOrders({
          guideURL: require('./cancel_guide.png')
        }));

        self.orderFilterType = 'L';
        self.orderFilterState = 'PENDING';
        self.filterOrders();

        $('#orders-type').on('change', function() {
          self.orderFilterType = $(this).val();
          self.filterOrders();
        });
        $('#orders-status').on('change', function() {
          self.orderFilterState = $(this).val();
          self.filterOrders();
        });

        if (self.mixin.environment() == undefined) {
          $('.header').on('click', '.account.sign.out.button', function () {
            self.api.account.clear();
            window.location.href = '/';
          });
        } else {
          $('.account.sign.out.button').hide();
        }
        self.router.updatePageLinks();

      });

    });
  },

  filterOrders: function () {
    const type = this.orderFilterType;
    const state = this.orderFilterState;
    const orders = this.orders.filter(function(order) {
      return order.type === type && order.state === state;
    });

    $('#orders-content').html(this.itemOrder({
      canCancel: type === 'L' && state === 'PENDING',
      orders: orders
    }));

    this.handleOrderCancel();
  },

  getCancelOrderAsset: function () {
    const oooAssetId = "de5a6414-c181-3ecc-b401-ce375d08c399";
    const cnbAssetId = "965e5c6e-434c-3fa9-b780-c50f43cd955c";
    const nxcAssetId = "66152c0b-3355-38ef-9ec5-cae97e29472a";
    const candyAssetId = "01c46685-f6b0-3c16-95c1-b3d9515e2c9f";

    const cancelAssets = [oooAssetId, cnbAssetId, nxcAssetId, candyAssetId];
    for (var i = 0; i < cancelAssets.length; i++) {
      const asset = this.assets[cancelAssets[i]];
      if (asset && parseFloat(asset.balance) > 0.00000001) {
        return asset;
      }
    }
    return undefined;
  },

  handleOrderCancel: function () {
    const self = this;
    $('.orders.list .cancel.action a').click(function () {
      var item = $(this).parents('.order.item');
      const orderId = $(item).attr('data-id');
      const traceId = $(item).attr('trace-id');

      const asset = self.getCancelOrderAsset();
      if (!asset) {
        self.api.notify('error', window.i18n.t('invalid.insufficient.balance'));
        return;
      }  

      const msgpack = require('msgpack5')();
      const uuidParse = require('uuid-parse');
      const memo = self.encode(msgpack.encode({"O": uuidParse.parse(orderId)}));

      var redirect_to;
      var url = 'pay?recipient=' + ENGINE_USER_ID + '&asset=' + asset.asset_id + '&amount=0.00000001&memo=' + memo + '&trace=' + traceId;
  
      if (self.mixin.environment() == undefined) {
        redirect_to = window.open("");
      }
      
      self.created_at = new Date();
      
      clearInterval(self.paymentInterval);
      var verifyTrade = function() {
        self.api.mixin.verifyTrade(function (resp) {
          if ((new Date() - self.created_at) > 60 * 1000) {
            if (redirect_to != undefined) {
              redirect_to.close();
            }
            window.location.reload();
            return
          }
          if (resp.error) {
            console.info(resp.error)
            return true;
          }
  
          $(item).fadeOut().remove();

          const data = resp.data;
          if (redirect_to != undefined) {
            redirect_to.close();
          }
  
          clearInterval(self.paymentInterval);
        }, traceId);
      }
      self.paymentInterval = setInterval(function() { verifyTrade(); }, 3000);
  
      if (self.mixin.environment() == undefined) {
        redirect_to.location = 'https://mixin.one/' + url;
      } else {
        window.location.replace('mixin://' + url);
      }
    });
  }
};

export default Account;
