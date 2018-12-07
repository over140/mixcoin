import './index.scss';
import $ from 'jquery';
import 'intl-tel-input/build/css/intlTelInput.css';
import 'intl-tel-input';
import uuid from 'uuid/v4';
import Mixin from '../api/mixin.js';
import TimeUtils from '../utils/time.js';
import Msgpack from '../helpers/msgpack.js';
import Snapshot from './snapshot.js';


function Account(router, api, db, bugsnag) {
  this.router = router;
  this.api = api;
  this.db = db;
  this.bugsnag = bugsnag;
  this.templateOrders = require('./orders.html');
  this.itemOrder = require('./order_item.html');
  this.mixin = new Mixin(this);
  this.msgpack = new Msgpack();
  this.snapshot = new Snapshot(api, db, bugsnag);
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

  fetchOrders: function (callback) {
    const self = this;
    self.fetchAssets(function () {
      self.db.order.fetchOrders(function (orders) {
        callback(orders);
        self.snapshot.syncSnapshots();
      });
    });
  },

  orders: function () {
    const self = this;
    self.fetchOrders(function (orders) {
      for (var i = 0; i < orders.length; i++) {
        var order = orders[i];
        order.trace = uuid().toLowerCase();
        order.time = TimeUtils.short(order.created_at);
        order.sideLocale = order.side === 'B' ? window.i18n.t('market.form.buy') : window.i18n.t('market.form.sell');
        order.sideColor = order.side === 'B' ? 'Buy' : 'Sell';
        order.quote = self.db.asset.getById(order.quote_asset_id);
        order.base = self.db.asset.getById(order.base_asset_id);

        if (order.order_type === 'M' && order.side === 'B') {
          order.amount_symbol = order.quote ? order.quote.symbol : '???';
        } else {
          order.amount_symbol = order.base ? order.base.symbol : '???';
        }
        if (order.order_type === 'L' && order.price) {
          order.price_symbol = order.quote ? order.quote.symbol : '???';
        }

        if (!order.base) {
          self.fetchAsset(order.base_asset_id);
        }
      }

      self.orders = orders;

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

      $('.header').on('click', '.nav.back', function () {
        self.router.replace('/');
      });

      if (self.mixin.environment() == undefined) {
        $('.nav.power.account.sign.out.button').html('<i class="icon-power"></i>');
        $('.header').on('click', '.account.sign.out.button', function () {
          self.api.account.clear();
          window.location.href = '/';
        });
      } else {
        $('.nav.power.account.sign.out.button').html('<i class="icon-refresh"></i>');
        $('.header').on('click', '.account.sign.out.button', function () {
          window.localStorage.removeItem('start_snapshots');
          window.localStorage.removeItem('end_snapshots');
          window.location.reload();
        });
      }
      self.router.updatePageLinks();
    });
  },

  filterOrders: function () {
    const type = this.orderFilterType;
    const state = this.orderFilterState;
    const orders = this.orders.filter(function(order) {
      return order.order_type === type && order.state === state;
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
      const asset = this.db.asset.getById(cancelAssets[i]);
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
        self.api.notify('error', window.i18n.t('orders.insufficient.balance'));
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
            return true;
          }
  
          for (var i = 0; i < self.orders.length; i++) {
            var order = self.orders[i];
            if (order.order_id === orderId) {
              order.state = 'DONE';
              break;
            }
          }
          self.db.order.canceledOrder(orderId);
          self.snapshot.syncSnapshots();

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
