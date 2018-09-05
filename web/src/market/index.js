import './index.scss';
import './trade.scss';
import $ from 'jquery';
import jQueryColor from '../jquery-color-plus-names.js';
import uuid from 'uuid/v4';
import Chart from './chart.js';
import FormUtils from '../utils/form.js';
import TimeUtils from '../utils/time.js';
import Mixin from '../api/mixin.js';
import {BigNumber} from 'bignumber.js';

function Market(router, api, db) {
  this.router = router;
  this.api = api;
  this.db = db;
  this.templateIndex = require('./index.html');
  this.templateTrade = require('./trade.html');
  this.itemOrder = require('./order_item.html');
  this.itemTrade = require('./trade_item.html');
  this.itemMarket = require('./market_item.html');
  this.depthLevel = 0;
  this.mixin = new Mixin(this);
  this.markets = {};
  this.favorited = window.localStorage.getItem("account.favorited");
  if (!this.favorited || this.favorited === undefined) {
    this.favorited = '';
  }
  jQueryColor($);

  BigNumber.config({ 
    FORMAT: {
      decimalSeparator: '.',
      groupSeparator: ',',
      groupSize: 3,
      secondaryGroupSize: 0
    }
  });
}

Market.prototype = {

  fetchAssets: function (callback) {
    const self = this;
    self.db.prepare(function () {
      self.db.asset.fetchAssets(function (assets) {
        const immediatelyReturn = assets.length > 0;
        if (immediatelyReturn) {
          self.db.asset.cache(assets);
          callback(assets);
        }
        self.api.mixin.assets(function (resp) {
          if (resp.error) {
            if (resp.error.code === 403) {
              $('#layout-container').html(self.templateIndex({
                title: "CNB-USDT",
                logoURL: require('./logo.png'),
                symbolURL: require('./symbol.png')
              }));
    
              $('.action.ok').on('click', function () {
                self.api.account.clear();
                var obj = new URL(window.location);
                var returnTo = encodeURIComponent(obj.href.substr(obj.origin.length));
                window.location.replace('https://mixin.one/oauth/authorize?client_id=' + CLIENT_ID + '&scope=PROFILE:READ+ASSETS:READ&response_type=code&return_to=' + returnTo);
              });
    
              self.alertError(window.i18n.t('general.errors.asset_access_denied'));
            }
            return;
          }
  
          const filterPatt = /^\w+$/;
          resp.data = resp.data.filter(function(asset) {
            return filterPatt.test(asset.symbol)
          });
  
          self.db.asset.saveAssets(resp.data, function (assets) {
            if (!immediatelyReturn) {
              self.db.asset.cache(assets);
              callback(assets);
            }
          });
        });
      });
    });
  },

  assets: function () {
    const self = this;
    self.fetchAssets(function (assets) {

      const defaultIconUrl = 'https://images.mixin.one/yH_I5b0GiV2zDmvrXRyr3bK5xusjfy5q7FX3lw3mM2Ryx4Dfuj6Xcw8SHNRnDKm7ZVE3_LvpKlLdcLrlFQUBhds=s128';
      assets.sort(function (a, b) {
        var at = parseFloat(a.price_usd) * parseFloat(a.balance);
        var bt = parseFloat(b.price_usd) * parseFloat(b.balance);
        if (at > bt) {
          return -1;
        }
        if (at < bt) {
          return 1;
        }

        if (a.icon_url === defaultIconUrl && b.icon_url !== defaultIconUrl) {
          return 1;
        } else if (b.icon_url === defaultIconUrl && a.icon_url !== defaultIconUrl) {
          return -1;
        }

        if (a.symbol < b.symbol) {
          return -1;
        }
        if (a.symbol > b.symbol) {
          return 1;
        }

        return 0;
      });

      $('#layout-container').html(self.templateIndex({
        title: "BTC-USDT",
        logoURL: require('./logo.png'),
        symbolURL: require('./symbol.png')
      }));

      var baseAssetId = window.localStorage.getItem('market.default.base');
      var quoteAssetId = window.localStorage.getItem('market.default.quote');
      if (!baseAssetId || baseAssetId === '') {
        baseAssetId = self.db.asset.btcAsset.asset_id;
      }
      if (!quoteAssetId || quoteAssetId === '') {
        quoteAssetId = self.db.asset.usdtAsset.asset_id;
      }
  
      var baseAsset = self.db.asset.getById(baseAssetId);
      if (baseAsset === undefined) {
        baseAsset = self.db.asset.getById(self.db.asset.btcAsset.asset_id);
      }
      const quoteAsset = self.db.asset.getById(quoteAssetId);

      self.refreshTrade(baseAsset, quoteAsset);

      $('.nav.overlay .title').on('click', function (event) {
        var marketContainer = $('.layout.markets.container');
        var iconArrow = $('.nav.overlay .arrow');
        if (marketContainer.is(":visible")) {
          iconArrow.removeClass('icon-arrow-up');  
          iconArrow.addClass('icon-arrow-down');
          marketContainer.slideUp();
        } else {
          iconArrow.removeClass('icon-arrow-down');
          iconArrow.addClass('icon-arrow-up');
          marketContainer.slideDown();
        }
      });

      const markets = ['star', 'usdt', 'xin', 'btc'];
      for (var i = 0; i < markets.length; i++) {
        const market = markets[i];
        $('.' + market + '.tab').on('click', function (event) {
          for (var j = 0; j < markets.length; j++) {
            if (j !== i) {
              $('.' + markets[j] + '.markets').hide();
            }
            $('.' + markets[j] + '.tab').removeClass('active');
          }
          $('.' + market + '.markets').show();
          $('.' + market + '.tab').addClass('active');
        });
      }

      $('.usdt.markets').show();

      const quotes = [self.db.asset.usdtAsset, self.db.asset.btcAsset, self.db.asset.xinAsset]

      for (var i = 0; i < 3; i++) {
        const quoteAsset = quotes[i];

        for (var j = 0; j < assets.length; j++) {
          const baseAsset = assets[j];

          if (self.validateQuoteBase(baseAsset.asset_id, quoteAsset.asset_id)) {
            const chainAsset = self.db.asset.getById(baseAsset.chain_id);
            if (!chainAsset) {
              continue;
            }
            const isFavorited = self.isFavoritedPair(baseAsset.asset_id, quoteAsset.asset_id);
            if (isFavorited) {
              const starItemMark = self.itemMarket({
                base: baseAsset,
                quote: quoteAsset,
                chain: chainAsset,
                volume: 0,
                price: 0,
                change: 0
              });
              $('.star.markets').append(starItemMark);
            }

            const itemMark = self.itemMarket({
              base: baseAsset,
              quote: quoteAsset,
              chain: chainAsset,
              volume: 0,
              price: 0,
              change: 0
            });
            $('.' + quoteAsset.symbol.toLowerCase() + '.markets').append(itemMark);
            if (isFavorited) {
              $('#market-item-' + baseAsset.symbol + '-' + quoteAsset.symbol+' .favor').addClass('active');
            }
            self.refreshMarket(baseAsset, quoteAsset)
          }
        }
      }

      $('.layout.markets.container').on('click', '.market.item', function (event) {
        event.preventDefault();
        $('.nav.overlay .title').click();
        const baseAsset = self.db.asset.getById($(this).data('base-symbol'));
        const quoteAsset = self.db.asset.getById($(this).data('quote-symbol'));
        self.api.engine.unsubscribe(self.base.asset_id + '-' + self.quote.asset_id);
        self.refreshTrade(baseAsset, quoteAsset);
      });

      $('.layout.markets.container').on('click', '.market.item .favor', function (event) {
        event.preventDefault();
        event.stopPropagation();
        var item = $(this).parent();
        var isStarTab = item.parent().hasClass('star');

        const baseAsset = self.db.asset.getById(item.data('base-symbol'));
        const quoteAsset = self.db.asset.getById(item.data('quote-symbol'));
        if (self.isFavoritedPair(baseAsset.asset_id, quoteAsset.asset_id)) {
          self.removeFavoritedPair(baseAsset.asset_id, quoteAsset.asset_id);
          $('#market-item-' + baseAsset.symbol + '-' + quoteAsset.symbol+' .favor').removeClass('active');
          if (isStarTab) {
            $(item).remove();
          } else {
            $('.star.markets #market-item-' + baseAsset.symbol + '-' + quoteAsset.symbol).remove();
          }
        } else {
          self.saveFavoritedPair(baseAsset.asset_id, quoteAsset.asset_id);
          $('#market-item-' + baseAsset.symbol + '-' + quoteAsset.symbol+' .favor').addClass('active');
          $('.star.markets').append(item.clone());
        }
      });

      $('.action.ok').on('click', function () {
        $(".modal-container").hide();
      });

      self.router.updatePageLinks();
    });
  },

  refreshMarket: function (baseAsset, quoteAsset) {
    const self = this;
    this.api.market.oneMarket(function (resp) {
      if (resp.error) {
        return true;
      }

      var m = resp.data;
      
      m.price = new BigNumber(m.price).toFixed(8).replace(/\.?0+$/,"");
      const marketItem = '#market-item-' + baseAsset.symbol + '-' + quoteAsset.symbol;
      const direction = m.change < 0 ? 'down' : 'up';
      const change = (m.change < 0 ? '' : '+') + Number(m.change * 100).toFixed(2) + '%';
      const volume = new BigNumber(m.volume).toFixed(2);

      self.markets[baseAsset.asset_id + '-' + quoteAsset.asset_id] = m;

      $(marketItem + ' .price .text').html(m.price);
      $(marketItem + ' .volume .text').html(volume);
      $(marketItem + ' .change').removeClass('up');
      $(marketItem + ' .change').removeClass('down');
      $(marketItem + ' .change').addClass(direction);
      $(marketItem + ' .change.' + direction).html(change);
    }, baseAsset.asset_id, quoteAsset.asset_id);
  },

  refreshTrade: function (baseAsset, quoteAsset) {
    const self = this;
    if (!baseAsset || !quoteAsset) {
      return;
    }

    $('.nav.overlay .title .text').html(baseAsset.symbol + '-' + quoteAsset.symbol);

    window.localStorage.setItem('market.default.base', baseAsset.asset_id);
    window.localStorage.setItem('market.default.quote', quoteAsset.asset_id);

    self.base = baseAsset;
    self.quote = quoteAsset;

    var market = this.markets[baseAsset.asset_id + '-' + quoteAsset.asset_id];
    if (market) {
      self.renderTrade(market);
    } else {
      this.api.market.oneMarket(function (resp) {
        if (resp.error) {
          return true;
        }
        self.markets[baseAsset.asset_id + '-' + quoteAsset.asset_id] = resp.data;
        self.renderTrade(resp.data);
      }, baseAsset.asset_id, quoteAsset.asset_id);
    }
  },

  pollMarket: function() {
    const self = this;
    self.api.market.oneMarket(function (resp) {
      if (resp.error) {
        return true;
      }
      self.markets[self.base.asset_id + '-' + self.quote.asset_id] = resp.data;
      self.renderMarket(resp.data);
    }, self.base.asset_id, self.quote.asset_id);
  },

  renderTrade: function (market) {
    const self = this;

    if (self.quote.asset_id === '815b0b1a-2764-3736-8faa-42d694fa620a') {
      self.quote.step = '0.0001';
    } else {
      self.quote.step = '0.00000001';
    }

    $('#layout-trade').attr('class', 'market layout');
    $('#layout-trade').html(self.templateTrade({
      base: self.base,
      quote: self.quote,
      trace: uuid().toLowerCase()
    }));

    self.renderMarket(market);
    clearInterval(self.pullMarketInterval);
    self.pullMarketInterval = setInterval(function() {
      self.pollMarket();
    }, 5000);

    self.updateTickerPrice(market.price);

    $('.order.book').on('click', 'li', function (event) {
      event.preventDefault();
      $('.trade.form input[name="price"]').val($(this).data('price'));
    });

    if (self.mixin.environment() == undefined) {
      $('.charts.container').on('click', '.icon-minus', function (e) {
        e.preventDefault();
        $('.charts.container .icon').removeClass('disabled');
        if (self.depthLevel <= -0.5) {
          $(this).addClass('disabled');
          return;
        }
        self.depthLevel -= 0.1;
        if (self.depthChart) {
          self.depthChart.destroy();
          self.depthChart = new Chart().renderDepth($('.depth.chart')[0], self.book.bids, self.book.asks, self.depthLevel);
        }
      });
  
      $('.charts.container').on('click', '.icon-plus', function (e) {
        e.preventDefault();
        $('.charts.container .icon').removeClass('disabled');
        if (self.depthLevel >= 0.5) {
          $(this).addClass('disabled');
          return;
        }
        self.depthLevel += 0.1;
        if (self.depthChart) {
          self.depthChart.destroy();
          self.depthChart = new Chart().renderDepth($('.depth.chart')[0], self.book.bids, self.book.asks, self.depthLevel);
        }
      });
    } else {
      $('.charts.container .icon-minus').hide();
      $('.charts.container .icon-plus').hide();
    }

    self.handleOrderCreate();
    self.handleFormSwitch();
    self.handleBookHistorySwitch();
    self.fixListItemHeight();

    clearInterval(self.balanceInterval);
    var pollBalance = function () {
      self.pollAccountBalance(self.base.asset_id);
      self.pollAccountBalance(self.quote.asset_id);
    };
    pollBalance();
    self.balanceInterval = setInterval(pollBalance, 7000);

    clearInterval(self.fetchTradesInterval);
    var fetchTrades = function () {
      var offset = TimeUtils.rfc3339(new Date());
      self.api.ocean.trades(function (resp) {
        if (resp.error) {
          return true;
        }
        var trades = resp.data;
        for (var i = trades.length; i > 0; i--) {
          self.addTradeEntry(trades[i-1]);
        }
        $('.trade.history .spinner-container').remove();
        self.fixListItemHeight();
      }, self.base.asset_id + '-' + self.quote.asset_id, offset);
    };
    self.fetchTradesInterval = setTimeout(function() { fetchTrades(); }, 1000);

    clearInterval(self.candleInterval);
    self.pollCandles(3600);
    self.candleInterval = setInterval(function () {
      self.pollCandles(3600);
    }, 60000);
    self.handleCandleSwitch();

    self.api.engine.subscribe(self.base.asset_id + '-' + self.quote.asset_id, function (msg) {
      self.render(msg);
    });
  },

  renderMarket: function(m) {
    const direction = m.change < 0 ? 'down' : 'up';
    const change = (m.change < 0 ? '' : '+') + Number(m.change * 100).toFixed(2) + '%';
    const volume = new BigNumber(m.volume).toFixed(2);
    const total = new BigNumber(m.total).toFixed(2);
    m.price_usd = new BigNumber(m.price).times(m.quote_usd);
    if (m.price_usd.toFixed(6).indexOf('0.0000') === 0) {
      m.price_usd = new BigNumber(m.price_usd).toFixed(6);
    } else if (m.price_usd.toFixed(4).indexOf('0.00') === 0) {
      m.price_usd = new BigNumber(m.price_usd).toFixed(4);
    } else {
      m.price_usd = new BigNumber(m.price_usd).toFixed(2);
    }

    this.quote_usd = m.quote_usd;
    $('.ticker.change').removeClass('up');
    $('.ticker.change').removeClass('down');
    $('.ticker.change').addClass(direction);
    $('.ticker.change .value').html(change);
    $('.ticker.volume .value').html(volume);
    $('.ticker.total .value').html(total);
  },

  handleFormSwitch: function () {
    $('.type.tab').click(function (event) {
      event.preventDefault();
      var type = $(this).attr('data-type').toLowerCase();
      var side = $('.side.tab.active').attr('data-side').toLowerCase();
      $('.type.tab').removeClass('active');
      $(this).addClass('active');
      $('.trade.form form').hide();
      $('.trade.form .form.' + type + '.' + side).show();
    });
    $('.side.tab').click(function (event) {
      event.preventDefault();
      var side = $(this).attr('data-side').toLowerCase();
      var type = $('.type.tab.active').attr('data-type').toLowerCase();
      $('.side.tab').removeClass('active');
      $(this).addClass('active');
      $('.trade.form form').hide();
      $('.trade.form .form.' + type + '.' + side).show();
    });
  },

  handleBookHistorySwitch: function () {
    $('.history.tab').click(function (event) {
      event.preventDefault();
      if ($('.trade.history').width() + $('.order.book').width() < $('.orders.trades .tabs').width()) {
        return;
      }
      $('.book.tab').removeClass('active');
      $(this).addClass('active');
      $('.order.book').hide();
      $('.trade.history').show();
    });
    $('.book.tab').click(function (event) {
      event.preventDefault();
      if ($('.trade.history').width() + $('.order.book').width() < $('.orders.trades .tabs').width()) {
        return;
      }
      $('.history.tab').removeClass('active');
      $(this).addClass('active');
      $('.trade.history').hide();
      $('.order.book').show();
    });
  },

  encode: function (buffer) {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  },

  createMemo: function (data) {
    var msgpack = require('msgpack5')();
    const uuidParse = require('uuid-parse');
    var side = (data.side === 'BID' ? 'B' : 'A');
    var type = (data.type === 'LIMIT' ? 'L' : 'M');
    var price = (data.type === 'LIMIT' ? this.parseNumber(data.price).toFixed(8).replace(/\.?0+$/,"") : '0');
    var asset = (data.side === 'BID' ? this.base.asset_id : this.quote.asset_id);
    return msgpack.encode({'T': type, 'P': price, 'S': side, 'A': uuidParse.parse(asset)});
  },

  quotePrecision: function(assetId) {
    switch (assetId) {
      case this.db.asset.xinAsset.asset_id:
        return 8;
      case this.db.asset.btcAsset.asset_id:
        return 8;
      case this.db.asset.usdtAsset.asset_id:
        return 4;
      default:
        break;
    }
    return 0;
  },

  quoteMinimum: function(assetId) {
    switch (assetId) {
      case this.db.asset.xinAsset.asset_id:
        return 0.0001;
      case this.db.asset.btcAsset.asset_id:
        return 0.0001;
      case this.db.asset.usdtAsset.asset_id:
        return 1;
      default:
        break;
    }
    return 0;
  },

  alertError: function(msg) {
    $('.modal-name').html(msg);
    $('.modal-container').show();
  },

  parseNumber: function(data) {
    if (data === undefined || data === "") {
      return new BigNumber(0);
    }
    const value = new BigNumber(data);
    if (isNaN(value)) {
      return new BigNumber(0);
    }
    return value;
  },

  validateOrder: function(data) {
    const MaximumPrice = new BigNumber(1000000000);
    const MaximumAmount = new BigNumber(5000000000);
    const MaximumFunds = MaximumPrice.times(MaximumAmount);
    const AmountPrecision = 4;

    const quotePrecision = this.quotePrecision(this.quote.asset_id);
    var priceDecimal = new BigNumber(this.parseNumber(data.price).toFixed(8));
    var maxPrice = MaximumPrice.shiftedBy(-quotePrecision);
    if (priceDecimal.isGreaterThan(maxPrice)) {
      this.alertError(window.i18n.t('market.errors.price_max', {price: maxPrice.toFormat(), symbol: this.quote.symbol}));
      return false;
    }

    if (data.type === 'LIMIT' && priceDecimal.isZero()) {
      this.alertError(window.i18n.t('market.errors.price_zero'));
      return false;
    }

    if (this.quote.asset_id === this.db.asset.usdtAsset.asset_id) {
      priceDecimal = new BigNumber(priceDecimal.toFixed(4));
    }

    if (data.type === 'LIMIT') {
      const minPrice = new BigNumber(1).shiftedBy(-quotePrecision);
      if (priceDecimal.isLessThan(minPrice)) {
        this.alertError(window.i18n.t('market.errors.price_max', {price: minPrice.toFormat(), symbol: this.quote.symbol}));
        return false;
      }
    }

    const fundsPrecision = AmountPrecision + quotePrecision;
    const quoteMinimum = new BigNumber(this.quoteMinimum(this.quote.asset_id));
    const amount = data.type === 'MARKET' && data.side === 'BID' ? data.funds : data.amount;

    if (this.parseNumber(amount).isZero()) {
      this.alertError(window.i18n.t('market.errors.amount_zero'));
      return false;
    }

    var funds;
    if (data.type === 'LIMIT') {
      if (data.side === 'BID') {
        funds = new BigNumber(data.amount).times(data.price).toFixed(8);
      } else {
        funds = new BigNumber(data.amount).toFixed(8);
      }
    } else {
      if (data.side === 'ASK') {
        funds = new BigNumber(data.amount).toFixed(8);
      }
    }
    const fundsDecimal = new BigNumber(funds);

    if (data.side === 'BID') {
      const maxFunds = MaximumFunds.shiftedBy(-fundsPrecision);
      if (fundsDecimal.isGreaterThan(maxFunds)) {
        this.alertError(window.i18n.t('market.errors.fund_max', {fund: maxFunds.toFormat(), symbol: this.quote.symbol}));
        return false;
      }

      if (fundsDecimal.isLessThan(quoteMinimum)) {
        this.alertError(window.i18n.t('market.errors.fund_min', {fund: quoteMinimum.toString(), symbol: this.quote.symbol}));
        return false;
      }
    } else {
      const maxAmount = MaximumAmount.shiftedBy(-AmountPrecision);
      if (fundsDecimal.isGreaterThan(maxAmount)) {
        this.alertError(window.i18n.t('market.errors.fund_max', {fund: maxAmount.toFormat(), symbol: this.base.symbol}));
        return false;
      }

      const amountDecimal = this.parseNumber(data.amount);
      if (data.type === 'LIMIT' && priceDecimal.times(amountDecimal).isLessThan(quoteMinimum)) {
        this.alertError(window.i18n.t('market.errors.fund_min', {fund: quoteMinimum.toString(), symbol: this.quote.symbol}));
        return false;
      }
    }

    return true;
  },

  handleOrderCreate: function () {
    const self = this;

    $('.trade.form form').submit(function (event) {
      event.preventDefault();
      var form = $(this);
      var data = FormUtils.serialize(this);
      
      self.validateOrder(data);

      if (!self.validateOrder(data)) {
        $('.submit-loader', form).hide();
        $(':submit', form).show();
        $(':submit', form).prop('disabled', false);
        return;
      }

      if (data.type === 'LIMIT') {
        if (data.side === 'BID') {
          data.funds = new BigNumber(data.amount).times(data.price).toFixed(8);
        } else {
          data.funds = new BigNumber(data.amount).toFixed(8);
        }
      } else {
        if (data.side === 'ASK') {
          data.funds = new BigNumber(data.amount).toFixed(8);
        }
      }
      
      var assetId = (data.side === 'BID' ? data.quote : data.base);
      var redirect_to;
      var memo = self.encode(self.createMemo(data));
      
      if (self.mixin.environment() == undefined) {
        redirect_to = window.open("");
      }
      
      self.created_at = new Date();
      const traceId = data.trace_id;
      var url = 'pay?recipient=' + ENGINE_USER_ID + '&asset=' + assetId + '&amount=' + data.funds + '&memo=' + memo + '&trace=' + traceId;
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

          const data = resp.data;
          if (redirect_to != undefined) {
            redirect_to.close();
          }

          clearInterval(self.paymentInterval);
          
          $('.submit-loader', form).hide();
          $(':submit', form).show();
          $(':submit', form).prop('disabled', false);

          $('.trade.form input[name="amount"]').val('');
          $('.trade.form input[name="funds"]').val('');
          $('.trade.form input[name="trace_id"]').val(uuid().toLowerCase());
          if (data.side === 'BID') {
            self.pollAccountBalance($('.trade.form form input[name="quote"]').val());
          } else {
            self.pollAccountBalance($('.trade.form form input[name="base"]').val());
          }
        }, traceId);
      }
      self.paymentInterval = setInterval(function() { verifyTrade(); }, 3000);

      if (self.mixin.environment() == undefined) {
        redirect_to.location = 'https://mixin.one/' + url;
      } else {
        window.location.replace('mixin://' + url);
      }
    });
    $('.trade.form :submit').click(function (event) {
      event.preventDefault();
      $(this).hide();
      $(this).prop('disabled', true);
      var form = $(this).parents('.trade.form form');
      $('.submit-loader', form).show();
      form.submit();
    });
  },

  fixListItemHeight: function () {
    var mass = $('.book.data .ask').length - 60;
    if (mass > 0) {
      $('.book.data li.ask:nth-of-type(-1n+' + mass + ')').remove();
    }
    mass = $('.book.data li.ask').length + 60;
    $('.book.data li.bid:nth-of-type(1n+' + mass + ')').remove();

    const itemHeight = 21;
    var total = $('.order.book').height() - $('.order.book .spread').outerHeight() - $('.book.tab').outerHeight();
    var count = parseInt(total / itemHeight / 2) * 2;
    var line = (total / count) + 'px';
    $('.order.book .ask').css({'line-height': line, height: line});
    $('.order.book .bid').css({'line-height': line, height: line});
    var top = -(total / count * $('.order.book .ask').length);
    top = top + $('.book.tab').outerHeight() + total / 2;
    $('.book.data').css({'top': top + 'px'});

    total = $('.trade.history').height() - $('.history.tab').outerHeight();
    count = parseInt(total / itemHeight);
    line = (total / count) + 'px';
    $('.trade.history .ask').css({'line-height': line, height: line});
    $('.trade.history .bid').css({'line-height': line, height: line});
  },

  handleCandleSwitch: function () {
    const self = this;
    $('.charts.container .tabs li').click(function (event) {
      event.preventDefault();
      $('.charts.container .tabs li').removeClass('active');
      $(this).addClass('active');
      if ($(this).hasClass('depth')) {
        $('.price.chart').hide();
        $('.depth.chart').show();
        return;
      }

      if (($('.price.chart').outerHeight() * 3 / 2) > $('.charts.container').outerHeight()) {
        $('.depth.chart').hide();
      }
      $('.price.chart').show();
      const granularity = $(this).data('granularity');
      clearInterval(self.candleInterval);
      self.pollCandles(granularity);
      self.candleInterval = setInterval(function () {
        self.pollCandles(granularity);
      }, 60000);
    });
  },

  pollCandles: function (granularity) {
    const self = this;
    self.api.market.candles(function (resp) {
      if (resp.error) {
        return true;
      }
      self.renderCandleChart(resp.data);
    }, self.base.asset_id + '-' + self.quote.asset_id, granularity);
  },

  renderCandleChart: function (data) {
    const self = this;
    const chart = new Chart();
    if (!self.priceChart) {
      self.priceChart = chart.renderPrice($('.price.chart')[0], self.base.symbol, data);
    } else {
      data = chart.prepareCandleData(data);
      var ohlc = data[0];
      var volume = data[1];
      self.priceChart.series[0].setData(volume);
      self.priceChart.series[1].setData(ohlc);
    }
  },

  renderDepthChart: function () {
    const self = this;
    const chart = new Chart();
    if (self.depthChart) {
      self.depthChart.destroy();
    }
    self.depthChart = chart.renderDepth($('.depth.chart')[0], self.book.bids, self.book.asks, self.depthLevel);
    if (self.depthChart) {
      $('.charts.container .icon').addClass('show');
    }
  },

  render: function (msg) {
    const self = this;
    if (msg.action !== 'EMIT_EVENT') {
      return;
    }
    if (!self.book) {
      self.book = {
        asks: [],
        bids: []
      };
    }

    var data = msg.data;
    switch (data.event) {
      case 'BOOK-T0':
        var book = data.data;
        self.book.asks = book.asks;
        self.book.bids = book.bids;
        $('.order.book .spinner-container').remove();
        $('.order.book .book.data').show();
        $('.order.book .order.item').remove();
        for (var i = 0; i < book.asks.length; i++) {
          self.orderOpenOnPage(book.asks[i], true);
        }
        for (var i = 0; i < book.bids.length; i++) {
          self.orderOpenOnPage(book.bids[i], true);
        }
        self.fixListItemHeight();
        break;
      case 'HEARTBEAT':
        return;
      case 'ORDER-OPEN':
        $('.order.book .spinner-container').remove();
        $('.order.book .book.data').show();
        self.orderOpenOnBook(data.data);
        self.orderOpenOnPage(data.data);
        self.fixListItemHeight();
        break;
      case 'ORDER-CANCEL':
        self.orderRemoveFromBook(data.data);
        self.orderRemoveFromPage(data.data);
        self.fixListItemHeight();
        break;
      case 'ORDER-MATCH':
        data.data.created_at = data.timestamp;
        self.updateTickerPrice(data.data.price);
        self.addTradeEntry(data.data);
        self.orderRemoveFromBook(data.data);
        self.orderRemoveFromPage(data.data);
        self.fixListItemHeight();
        break;
    }

    self.renderDepthChart();
  },

  updateTickerPrice: function (price) {
    const self = this;
    $('.book.data .spread').attr('data-price', price);
    $('.quote.price').html(new BigNumber(price).toFixed(8).replace(/\.?0+$/,""));
    var price_usd = new BigNumber(price).times(self.quote_usd);
    if (price_usd.toFixed(6).indexOf('0.0000') === 0) {
      price_usd = new BigNumber(price_usd).toFixed(6);
    } else if (price_usd.toFixed(4).indexOf('0.00') === 0) {
      price_usd = new BigNumber(price_usd).toFixed(4);
    } else {
      price_usd = new BigNumber(price_usd).toFixed(2);
    }
    $('.fiat.price').html('$' + price_usd);
  },

  addTradeEntry: function (o) {
    const self = this;
    if ($('#trade-item-' + o.trade_id).length > 0) {
      return;
    }
    var items = $('.trade.item');
    if (items.length > 0 && new Date($(items[0]).attr('data-time')) > new Date(o.created_at)) {
      return;
    }
    $('.trade.history .spinner-container').remove();
    if (self.quote.asset_id === '815b0b1a-2764-3736-8faa-42d694fa620a') {
      o.price = new BigNumber(o.price).toFixed(4);
    } else {
      o.price = new BigNumber(o.price).toFixed(8);
    }
    o.amount = new BigNumber(o.amount).toFixed(4);
    if (o.amount === '0.0000') {
      o.amount = '0.0001';
    }
    o.sideClass = o.side.toLowerCase();
    o.time = TimeUtils.short(o.created_at);
    $('.history.data').prepend(self.itemTrade(o));
    $('.history.data li:nth-of-type(1n+100)').remove();
  },

  orderOpenOnPage: function (o, instant) {
    const self = this;
    const price = new BigNumber(o.price);
    const amount = new BigNumber(o.amount);
    var bgColor = 'rgba(0, 181, 110, 0.3)';
    if (o.side === 'ASK') {
      bgColor = 'rgba(229, 85, 65, 0.3)';
    }

    o.sideClass = o.side.toLowerCase()
    if (self.quote.asset_id === '815b0b1a-2764-3736-8faa-42d694fa620a') {
      o.price = new BigNumber(o.price).toFixed(4);
    } else {
      o.price = new BigNumber(o.price).toFixed(8);
    }
    o.pricePoint = o.price.replace('.', '');
    o.amount = amount.toFixed(4);
    if (o.amount === '0.0000') {
      o.amount = '0.0001';
    }
    if ($('#order-point-' + o.pricePoint).length > 0) {
      var bo = $('#order-point-' + o.pricePoint);
      o.amount = new BigNumber(bo.attr('data-amount')).plus(amount).toFixed(4);
      if (instant) {
        bo.replaceWith(self.itemOrder(o));
      } else {
        bo.replaceWith($(self.itemOrder(o)).css('background-color', bgColor).animate({ backgroundColor: "transparent" }, 500));
      }
      return;
    }

    var list = $('.order.item');
    var item = self.itemOrder(o);
    if (!instant) {
      item = $(item).css('background-color', bgColor).animate({ backgroundColor: "transparent" }, 500);
    }
    for (var i = 0; i < list.length; i++) {
      var bo = $(list[i]);
      if (price.isLessThan(bo.attr('data-price'))) {
        continue;
      }

      if (o.side !== bo.attr('data-side')) {
        $('.book.data .spread').before(item);
      } else {
        bo.before(item);
      }
      return;
    }
    if (o.side === 'BID') {
      $('.book.data').append(item);
    } else {
      $('.book.data .spread').before(item);
    }
  },

  orderRemoveFromPage: function (o) {
    const self = this;
    const price = new BigNumber(o.price);
    const amount = new BigNumber(o.amount);

    o.sideClass = o.side.toLowerCase()
    if (self.quote.asset_id === '815b0b1a-2764-3736-8faa-42d694fa620a') {
      o.price = new BigNumber(o.price).toFixed(4);
    } else {
      o.price = new BigNumber(o.price).toFixed(8);
    }
    o.pricePoint = o.price.replace('.', '');
    if ($('#order-point-' + o.pricePoint).length === 0) {
      return;
    }

    var bo = $('#order-point-' + o.pricePoint);
    var bgColor = 'rgba(0, 181, 110, 0.3)';
    if (o.side === 'ASK') {
      bgColor = 'rgba(229, 85, 65, 0.3)';
    }
    o.amount = new BigNumber(bo.attr('data-amount')).minus(amount);
    o.funds = new BigNumber(bo.attr('data-funds')).minus(o.funds);
    if (!o.amount.isGreaterThan(0) || !o.funds.isGreaterThan(0)) {
      bo.remove();
    } else {
      o.amount = o.amount.toFixed(4);
      if (o.amount === '0.0000') {
        o.amount = '0.0001';
      }
      bo.replaceWith($(self.itemOrder(o)).css('background-color', bgColor).animate({ backgroundColor: "transparent" }, 500));
    }
  },

  orderOpenOnBook: function (o) {
    const self = this;
    const price = new BigNumber(o.price);
    const amount = new BigNumber(o.amount);

    if (o.side === 'ASK') {
      for (var i = 0; i < self.book.asks.length; i++) {
        var bo = self.book.asks[i];
        var bp = new BigNumber(bo.price);
        if (bp.isEqualTo(price)) {
          bo.amount = new BigNumber(bo.amount).plus(amount).toFixed(4);
          return;
        }
        if (bp.isGreaterThan(price)) {
          self.book.asks.splice(i, 0, o);
          return;
        }
      }
      self.book.asks.push(o);
    } else if (o.side === 'BID') {
      for (var i = 0; i < self.book.bids.length; i++) {
        var bo = self.book.bids[i];
        var bp = new BigNumber(bo.price);
        if (bp.isEqualTo(price)) {
          bo.amount = new BigNumber(bo.amount).plus(amount).toFixed(4);
          return;
        }
        if (bp.isLessThan(price)) {
          self.book.bids.splice(i, 0, o);
          return;
        }
      }
      self.book.bids.push(o);
    }
  },

  orderRemoveFromBook: function (o) {
    const self = this;
    const price = new BigNumber(o.price);
    const amount = new BigNumber(o.amount);

    var list = self.book.asks;
    if (o.side === 'BID') {
      list = self.book.bids;
    }

    for (var i = 0; i < list.length; i++) {
      var bo = list[i];
      if (!new BigNumber(bo.price).isEqualTo(price)) {
        continue;
      }

      bo.amount = new BigNumber(bo.amount).minus(amount).toFixed(4);
      if (bo.amount === '0.0000') {
        list.splice(i, 1);
      }
      return;
    }
  },

  validateQuoteBase: function (base, quote) {
    if (quote === base) {
      return false;
    }

    const btcAssetId = this.db.asset.btcAsset.asset_id;
    const usdtAssetId = this.db.asset.usdtAsset.asset_id;
    const xinAssetId = this.db.asset.xinAsset.asset_id;

    if (quote !== btcAssetId && quote !== usdtAssetId && quote !== xinAssetId) {
      return false;
    }
    if (quote === btcAssetId && base === usdtAssetId) {
      return false;
    }
    if (quote === xinAssetId && base === usdtAssetId) {
      return false;
    }
    if (quote === xinAssetId && base === btcAssetId) {
      return false;
    }

    return true
  },

  pollAccountBalance: function (asset) {
    const self = this;
    self.api.mixin.asset(function (resp) {
      if (resp.error) {
        return true;
      }

      var data = resp.data;
      $('.balance.' + data.symbol).css({display: 'flex'});
      $('.asset.amount.' + data.symbol).html(data.balance);
    }, asset);
  },

  isFavoritedPair: function(baseAssetId, quoteAssetId) {
    return this.favorited.indexOf(baseAssetId + quoteAssetId + ',') > -1;
  },

  saveFavoritedPair: function(baseAssetId, quoteAssetId) {
    const pair = baseAssetId + quoteAssetId + ',';
    if (this.isFavoritedPair(baseAssetId, quoteAssetId)) {
      return;
    }
    this.favorited += pair;
    window.localStorage.setItem("account.favorited", this.favorited);
  },

  removeFavoritedPair: function(baseAssetId, quoteAssetId) {
    this.favorited = this.favorited.replace(baseAssetId + quoteAssetId + ',', '');
    window.localStorage.setItem("account.favorited", this.favorited);
  }
  
};

export default Market;
