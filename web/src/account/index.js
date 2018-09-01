import './index.scss';
import $ from 'jquery';
import 'intl-tel-input/build/css/intlTelInput.css';
import 'intl-tel-input';
import uuid from 'uuid/v4';
import Mixin from '../api/mixin.js';
import {BigNumber} from 'bignumber.js';
import TimeUtils from '../utils/time.js';
import Msgpack from '../helpers/msgpack.js';

function Account(router, api, db, bugsnag) {
  this.router = router;
  this.api = api;
  this.db = db;
  this.bugsnag = bugsnag;
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

  decodeMemo: function(snapshot) {
    const buf = this.decode(snapshot.memo);
    try {
      return this.msgpack.decodeMap(buf, 0, buf.readUInt8(0) & 0x0f, 1);
    } catch (error) {
      this.bugsnag.notify(error, { metaData: snapshot });
    }
    return null;
  },

  fetchAsset: function (assetId) {
    const self = this;
    self.api.mixin.asset(function (resp) {
      if (resp.error) {
        return;
      }
      self.db.asset.cacheAssets[resp.data.asset_id] = resp.data;
      self.db.asset.saveAsset(resp.data);
    }, assetId);
  },

  fetchAssets: function (callback) {
    const self = this;
    self.db.prepare(function () {
      self.db.asset.fetchAssets(function (assets) {
        self.db.asset.cache(assets);
        callback();
      });
    });
  },

  orders: function () {
    const self = this;
    self.fetchAssets(function () {
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
            const orderAction = self.decodeMemo(snapshot);
            if (orderAction && !orderAction.O && orderAction.S && orderAction.A && orderAction.T) {
              if (orderAction.T === 'L' && !orderAction.P) {
                self.bugsnag.notify(new Error('Error Limit Order'), { metaData: snapshot });
                continue;
              }

              var order = {};

              var baseAssetId;
              if (orderAction.S === 'B') {
                order.quote = self.db.asset.getById(snapshot.asset_id);
                order.base = self.db.asset.getById(orderAction.A);
                baseAssetId = orderAction.A;
              } else {
                order.quote = self.db.asset.getById(orderAction.A);
                order.base = self.db.asset.getById(snapshot.asset_id);
                baseAssetId = snapshot.asset_id;
              }

              if (!order.base) {
                self.fetchAsset(baseAssetId);
              }
              order.assetId = orderAction.A;

              if (orderAction.T === 'L' && orderAction.S === 'B') {
                const priceDecimal = new BigNumber(orderAction.P);
                if (isNaN(priceDecimal) || priceDecimal.isZero()) {
                  continue;
                }
                order.amount = amount.div(priceDecimal).abs();
              } else {
                order.amount = amount.abs();
              }

              if (orderAction.T === 'M' && orderAction.S === 'B') {
                if (order.quote) {
                  order.amount_symbol = order.quote.symbol;
                } else {
                  order.amount_symbol = '???'
                }
              } else {
                if (order.base) {
                  order.amount_symbol = order.base.symbol;
                } else {
                  order.amount_symbol = '???'
                }
              }

              if (orderAction.T === 'L') {
                order.price = orderAction.P.replace(/\.?0+$/,"");
                if (order.quote) {
                  order.price_symbol = order.quote.symbol;
                } else {
                  order.price_symbol = '???'
                }
              }
              
              order.state = 'PENDING';
              order.type = orderAction.T;
              order.side = orderAction.S === 'B' ? 'Buy' : 'Sell';
              order.sideLocale = orderAction.S === 'B' ? window.i18n.t('market.form.buy') : window.i18n.t('market.form.sell');
              order.created_at = TimeUtils.short(snapshot.created_at);
              order.order_id = snapshot.trace_id;
              order.trace = uuid().toLowerCase();

              orders[snapshot.trace_id] = order;
              entryOrders.push(order);
            }
          }
        }

        for (var i = 0; i < resp.data.length; i++) {
          const snapshot = resp.data[i];
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
                  order.filled_amount = order.filled_amount.plus(amount);
                  if (order.amount.isEqualTo(order.filled_amount)) {
                    order.filled_amount = undefined;
                    order.state = 'DONE';
                  }
                  orders[order.order_id] = order;
                  break;
              } 
            }
          }
        }

        self.orders = entryOrders;

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
