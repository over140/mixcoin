import './index.scss';
import $ from 'jquery';
import 'intl-tel-input/build/css/intlTelInput.css';
import 'intl-tel-input';
import uuid from 'uuid/v4';
import Mixin from '../api/mixin.js';
import {BigNumber} from 'bignumber.js';
import TimeUtils from '../utils/time.js';
import Msgpack from '../helpers/msgpack.js';

function Account(router, api) {
  this.router = router;
  this.api = api;
  this.templateOrders = require('./orders.html');
  this.itemOrder = require('./order_item.html');
  this.mixin = new Mixin(this);
  this.msgpack = new Msgpack();
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

  decodeMemo: function(memo) {
    const buf = this.decode(memo);
    return this.msgpack.decodeMap(buf, 0, buf.readUInt8(0) & 0x0f, 1);
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
            if (orderAction && !orderAction.O && orderAction.T && orderAction.A) {
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

              if (orderAction.T === 'L') {
                if (!orderAction.P) {
                  continue;
                }
              }

              if (orderAction.T === 'L' && orderAction.S === 'B') {
                amount = amount.div(new BigNumber(orderAction.P));
              }

              if (orderAction.T === 'M' && orderAction.S === 'A') {
                if (order.base) {
                  order.amount_symbol = order.base.symbol;
                } else {
                  order.amount_symbol = '???'
                }
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
