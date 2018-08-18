import './index.scss';
import $ from 'jquery';
import 'intl-tel-input/build/css/intlTelInput.css';
import 'intl-tel-input';
import uuid from 'uuid/v4';
import FormUtils from '../utils/form.js';
import Mixin from '../api/mixin.js';

function Account(router, api) {
  this.router = router;
  this.api = api;
  this.templateOrders = require('./orders.html');
  this.mixin = new Mixin(this);
}

Account.prototype = {

  hideLoader: function() {
    $('.cancel.order.form .submit-loader').hide();
    $('.cancel.order.form :submit').show();
    $('.cancel.order.form :submit').prop('disabled', false);
  },

  orders: function () {
    const self = this;
    
    self.api.mixin.assets(function (resp) {
      if (resp.error) {
        return;
      }

      self.api.asset.assets = resp.data;

      $('body').attr('class', 'account layout');
      $('#layout-container').html(self.templateOrders({
        guideURL: require('./cancel_guide.png'),
        trace: uuid().toLowerCase()
      }));
  
      $('.cancel.order.form').submit(function (event) {
        event.preventDefault();
        var form = $(this);
        var data = FormUtils.serialize(form);
  
        if (data.snapshot_id === "") {
          self.hideLoader();
          return;
        }
       
        self.api.mixin.snapshot(function (resp) {
          if (resp.error) {
            self.api.notify('error', window.i18n.t('orders.invalid.transaction.id') + ' Error Code:' + resp.error.code);
            self.hideLoader();
            return true;
          }
  
          const orderId = resp.data.trace_id;
          if (orderId) {
            const msgpack = require('msgpack5')();
            const uuidParse = require('uuid-parse');
            if (orderId) {
              self.handleOrderCancel(data.trace_id, msgpack.encode({"O": uuidParse.parse(orderId)}).toString('base64'));
              return;
            }
            self.api.notify('error', window.i18n.t('invalid.transaction.id'));
            self.hideLoader();
          }
        }, data.snapshot_id);
      });
      $('.cancel.order.form :submit').click(function (event) {
        event.preventDefault();
        $(this).hide();
        $(this).prop('disabled', true);
        var form = $(this).parents('form');
        $('.submit-loader', form).show();
        form.submit();
      });
    });
    
  },

  handleOrderCancel: function (trace, memo) {
    const self = this;

    const asset = this.api.asset.getCancelOrderAsset();
    if (!asset) {
      self.api.notify('error', window.i18n.t('invalid.insufficient.balance'));
      return;
    }

    var redirect_to;
    var url = 'pay?recipient=' + ENGINE_USER_ID + '&asset=' + asset.asset_id + '&amount=0.00000001&memo=' + encodeURI(memo) + '&trace=' + trace;

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

        const data = resp.data;
        if (redirect_to != undefined) {
          redirect_to.close();
        }

        clearInterval(self.paymentInterval);
        
        self.hideLoader();
        $('.cancel.order.form input[name="trace_id"]').val(uuid().toLowerCase());
      }, trace);
    }
    self.paymentInterval = setInterval(function() { verifyTrade(); }, 3000);

    if (self.mixin.environment() == undefined) {
      redirect_to.location = 'https://mixin.one/' + url;
    } else {
      window.location.replace('mixin://' + url);
    }
  }
};

export default Account;
