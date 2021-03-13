import './index.scss';
import './trade.scss';
import $ from 'jquery';
import jQueryColor from '../jquery-color-plus-names.js';
import { v4 as uuid } from 'uuid';
import { validate as uuidValidate } from 'uuid';
import Chart from './chart.js';
import FormUtils from '../utils/form.js';
import TimeUtils from '../utils/time.js';
import Mixin from '../api/mixin.js';
import {BigNumber} from 'bignumber.js';
import MarketController from './market.js';
import Snapshot from '../account/snapshot.js';
import Group from '../api/group.js';

function Market(router, api, db, bugsnag) {
  this.router = router;
  this.api = api;
  this.db = db;
  this.marketController = new MarketController(api, db);
  this.snapshot = new Snapshot(api, db, bugsnag);
  this.templateIndex = require('./index.html');
  this.templateTrade = require('./trade.html');
  this.itemOrder = require('./order_item.html');
  this.itemTrade = require('./trade_item.html');
  this.itemMarket = require('./market_item.html');
  this.depthLevel = 0;
  this.mixin = new Mixin(this);
  this.group = new Group();
  this.favorited = window.localStorage.getItem("account.favorited");
  if (!this.favorited) {
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
                window.location.replace('https://mixin-www.zeromesh.net/oauth/authorize?client_id=' + CLIENT_ID + '&scope=PROFILE:READ+ASSETS:READ+SNAPSHOTS:READ&response_type=code&return_to=' + returnTo);
              });
    
              self.alertError(window.i18n.t('general.errors.asset_access_denied'));
            }
            return;
          }
  
          const filterPatt = /^[a-zA-Z0-9\-_]+$/;
          resp.data = resp.data.filter(function(asset) {
            return filterPatt.test(asset.symbol)
          });
  
          self.db.asset.saveAssets(resp.data, function (assets) {
            if (!immediatelyReturn) {
              self.db.asset.cache(assets);
              callback(assets);
            }
            self.checkAssets(assets);
          });
        });
      });
    });
  },

  checkAssets: function(assets) {
    const self = this;
    // USDT-OMNI, XIN, pUSD
    const ids = ['815b0b1a-2764-3736-8faa-42d694fa620a', 'c94ac88f-4671-3976-b60a-09064f1811e8', '31d2ea9c-95eb-3355-b65b-ba096853bc18'];
    for (var i = 0; i < ids.length; i++) {
      const assetId = ids[i];
      const filterAssets = assets.filter(function(asset) {
        return asset.asset_id === assetId;
      });
      if (filterAssets.length == 0) {
        self.api.mixin.asset(function (resp) {
          if (resp.error) {
            return;
          }
          self.db.asset.cacheAssets[resp.data.asset_id] = resp.data;
          self.db.asset.saveAsset(resp.data);
        }, assetId);
      }
    }
  },

  defaultMarket: function (baseSymbol) {
    const self = this;
    if (!baseSymbol || baseSymbol.toUpperCase() === 'XIN' || baseSymbol.toUpperCase() === 'USDT' || baseSymbol.toUpperCase() === 'BTC' || baseSymbol.toUpperCase() === 'pUSD') {
      self.assets();
      return;
    }
    self.db.prepare(function () {
      if (uuidValidate(baseSymbol)) {
        const baseAssetId = baseSymbol
        self.api.mixin.asset(function (resp) {
          if (resp.error || resp.data.length == 0) {
            self.assets();
            return;
          }
          const baseAsset = resp.data;
          self.db.asset.cacheAssets[baseAsset.asset_id] = baseAsset;
          self.db.asset.saveAsset(baseAsset);
  
          window.localStorage.setItem('market.default.base', baseAsset.asset_id);
          window.localStorage.setItem('market.default.quote', self.db.asset.pusdAsset.asset_id);
  
          self.assets(baseAsset);
        }, baseAssetId);
      } else {
        self.api.mixin.search(function (resp) {
          if (resp.error || resp.data.length == 0) {
            self.assets();
            return;
          }
          const baseAsset = resp.data[0];
          self.db.asset.cacheAssets[baseAsset.asset_id] = baseAsset;
          self.db.asset.saveAsset(baseAsset);
  
          window.localStorage.setItem('market.default.base', baseAsset.asset_id);
          window.localStorage.setItem('market.default.quote', self.db.asset.pusdAsset.asset_id);
  
          self.assets(baseAsset);
        }, baseSymbol);
      }
    });
  },

  assets: function (topAsset) {
    const self = this;
    self.fetchAssets(function (assets) {

      const defaultIconUrl = 'https://images.mixin.one/yH_I5b0GiV2zDmvrXRyr3bK5xusjfy5q7FX3lw3mM2Ryx4Dfuj6Xcw8SHNRnDKm7ZVE3_LvpKlLdcLrlFQUBhds=s128';
      assets.sort(function (a, b) {
        if (topAsset) {
          if (a.asset_id === topAsset.asset_id && b.asset_id !== topAsset.asset_id) {
            return -1;
          } else if (a.asset_id !== topAsset.asset_id && b.asset_id === topAsset.asset_id) {
            return 1;
          }
        }

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

      if (topAsset) {
        var showTopAsset = true;
        for (var i = 0; i < assets.length; i++) {
          if (assets[i].asset_id === topAsset.asset_id) {
            showTopAsset = false;
          }
        }

        if (showTopAsset) {
          assets = assets.unshift(topAsset);
        }
      }

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
        quoteAssetId = self.db.asset.pusdAsset.asset_id;
      }
  
      var baseAsset = self.db.asset.getById(baseAssetId);
      if (!baseAsset) {
        baseAsset = self.db.asset.getById(self.db.asset.btcAsset.asset_id);
      }
      const quoteAsset = self.db.asset.getById(quoteAssetId);

      self.refreshTrade(baseAsset, quoteAsset);

      $('.nav.overlay .title').on('click', function (event) {
        var marketContainer = $('.layout.markets.container');
        var marketBar = $('.nav.panel');
        var iconArrow = $('.nav.overlay .arrow');
        var tradeView = $('#layout-trade');
        if (marketContainer.is(":visible")) {
          iconArrow.removeClass('icon-arrow-up');  
          iconArrow.addClass('icon-arrow-down');
          marketContainer.hide();
          marketBar.hide();
          tradeView.show();
        } else {
          iconArrow.removeClass('icon-arrow-down');
          iconArrow.addClass('icon-arrow-up');
          marketContainer.show();
          marketBar.show();
          tradeView.hide();
        }
      });

      const markets = ['star', 'pusd', 'btc', 'xin', 'usdt'];
      for (var i = 0; i < markets.length; i++) {
        const market = markets[i];
        $('.' + market + '.tab').on('click', function (event) {
          for (var j = 0; j < markets.length; j++) {
            if (markets[j] !== market) {
              $('.' + markets[j] + '.markets').hide();
            }
            $('.' + markets[j] + '.tab').removeClass('active');
          }
          $('.' + market + '.markets').show();
          $('.' + market + '.tab').addClass('active');
          $(window).scrollTop(0);
        });
      }

      $('.usdt.markets').show();

      const quotes = [self.db.asset.pusdAsset, self.db.asset.btcAsset, self.db.asset.xinAsset, self.db.asset.usdtAsset]

      for (var i = 0; i < 4; i++) {
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
              $('#market-item-' + baseAsset.asset_id + '-' + quoteAsset.asset_id + ' .favor').addClass('active');
            }
          }
        }
      }

      self.refreshMarkets();

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
          $('#market-item-' + baseAsset.asset_id + '-' + quoteAsset.asset_id+' .favor').removeClass('active');
          if (isStarTab) {
            $(item).remove();
          } else {
            $('.star.markets #market-item-' + baseAsset.asset_id + '-' + quoteAsset.asset_id).remove();
          }
        } else {
          self.saveFavoritedPair(baseAsset.asset_id, quoteAsset.asset_id);
          $('#market-item-' + baseAsset.asset_id + '-' + quoteAsset.asset_id+' .favor').addClass('active');
          $('.star.markets').append(item.clone());
        }
      });

      $('.account.orders').on('click', function () {
        self.router.replace('/orders');
      });

      $('.action.ok').on('click', function () {
        $(".modal-container").hide();
      });

      self.router.updatePageLinks();
    });
  },

  refreshMarkets: function () {
    const self = this;
    self.marketController.syncServerMarkets(function (markets) {
      for (var i = 0; i < markets.length; i++) {
        const market = markets[i];
        const marketItem = '#market-item-' + market.base + '-' + market.quote;
        const direction = market.change < 0 ? 'down' : 'up';
        const change = (market.change < 0 ? '' : '+') + Number(market.change * 100).toFixed(2) + '%';

        $(marketItem + ' .price .text').html(market.price);
        $(marketItem + ' .volume .text').html(new BigNumber(market.volume).toFixed(2));
        $(marketItem + ' .change').removeClass('up');
        $(marketItem + ' .change').removeClass('down');
        $(marketItem + ' .change').addClass(direction);
        $(marketItem + ' .change.' + direction).html(change);
      }
    });
  },

  refreshTrade: function (baseAsset, quoteAsset) {
    const self = this;
    if (!baseAsset || !quoteAsset) {
      return;
    }

    $('.nav.overlay .title .text').html(baseAsset.symbol + '-' + quoteAsset.symbol);
    document.title = baseAsset.symbol + ' - ' + quoteAsset.symbol;
    if (window.history.pushState) {
      window.history.pushState("", "", WEB_ROOT + '/market/' + baseAsset.asset_id);  
    }
    
    window.localStorage.setItem('market.default.base', baseAsset.asset_id);
    window.localStorage.setItem('market.default.quote', quoteAsset.asset_id);

    self.base = baseAsset;
    self.quote = quoteAsset;

    self.db.market.getMarket(function (market) {
      self.renderTrade(market);
    }, baseAsset.asset_id, quoteAsset.asset_id);
  },

  pollMarket: function() {
    const self = this;
    self.api.market.oneMarket(function (resp) {
      if (resp.error) {
        if (self.pullMarketInterval) {
          clearInterval(self.pullMarketInterval); 
        }
        return true;
      }
      self.renderMarket(resp.data);
    }, self.base.asset_id, self.quote.asset_id);
  },

  prepareUserId: function(callback) {
    const currentUserId = this.api.account.userId();
    if (currentUserId) {
      callback(currentUserId);
    } else {
      this.api.account.info(function (resp) {
        if (resp.error) {
          return;
        }
        window.localStorage.setItem('user_id', resp.data.user_id);
        callback(resp.data.user_id);
      });
    }
  },

  renderGroup: function() {
    let self = this;
    var group = self.group.getByAsset(navigator.language, self.quote.asset_id);
    if (!group) {
      group = self.group.getByAsset(navigator.language, self.base.asset_id);
    }

    if (group) {
      let conversationId = group.conversation_id;
      self.prepareUserId(function (currentUserId) {
        if (!currentUserId) {
          return;
        }

        self.api.mixin.conversation(function (resp) {
          if (resp.error) {
            return;
          }
  
          let conversation = resp.data;
          let participant = conversation.participants.filter(function(participant) {
            return participant.user_id === currentUserId;
          });
  
          if (participant.length == 0) {
            $('.join.action').attr('href', group.url);
            $('.join.action').html(group.name);
            $('.join.action').show();
          }
        }, conversationId);
      });
    }
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
    if (market && market.source === 'SERVER') {
      clearInterval(self.pullMarketInterval);
      self.pullMarketInterval = setInterval(function() {
        self.pollMarket();
      }, 5000);
    }

    self.renderGroup();

    if (market) {
      self.updateTickerPrice(market.price);
    } else {
      self.updateTickerPrice(0);
    }

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
    self.balanceInterval = setInterval(pollBalance, 8000);

    clearInterval(self.fetchTradesInterval);
    clearInterval(self.candleInterval);
    self.currentMarket = market;

    self.priceChart = null;
    if (market && market.source === 'SERVER') {
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
      $('#granularity60').removeClass('active');
      $('#granularity86400').removeClass('active');
      $('#granularity60').addClass('active');
      
      self.pollCandles(3600);
      self.candleInterval = setInterval(function () {
        self.pollCandles(3600);
      }, 60000);
    } else {
      $('#granularity60').removeClass('active');
      $('#granularity86400').removeClass('active');
      $('#granularity86400').addClass('active');
      self.pollCandles(86400);
      self.marketController.syncTrades(function (trades) {
        self.db.market.updateClientMarket(function(market) {
          if (market) {
            self.currentMarket = market;
            self.renderMarket(market);
            self.updateTickerPrice(market.price);
          }
        }, self.base.asset_id, self.quote.asset_id, market);

        for (var i = trades.length; i > 0; i--) {
          self.addTradeEntry(trades[i-1]);
        }
        $('.trade.history .spinner-container').remove();
        self.fixListItemHeight();
      }, self.base.asset_id, self.quote.asset_id);
    }

    self.handleCandleSwitch(market);

    self.api.engine.subscribe(self.base.asset_id + '-' + self.quote.asset_id, function (msg) {
      self.render(msg);
    });
  },

  renderMarket: function(m) {
    if (m) {
      const direction = m.change < 0 ? 'down' : 'up';
      const change = (m.change < 0 ? '' : '+') + Number(m.change * 100).toFixed(2) + '%';
      const volume = new BigNumber(m.volume).toFixed(2);
      const total = new BigNumber(m.total).toFixed(2);
      m.price_usd = new BigNumber(m.price).times(this.quote.price_usd);
      if (m.price_usd.toFixed(6).indexOf('0.0000') === 0) {
        m.price_usd = new BigNumber(m.price_usd).toFixed(6);
      } else if (m.price_usd.toFixed(4).indexOf('0.00') === 0) {
        m.price_usd = new BigNumber(m.price_usd).toFixed(4);
      } else {
        m.price_usd = new BigNumber(m.price_usd).toFixed(2);
      }

      $('.ticker.change').removeClass('up');
      $('.ticker.change').removeClass('down');
      $('.ticker.change').addClass(direction);
      $('.ticker.change .value').html(change);
      $('.ticker.volume .value').html(volume.replace(/\.?0+$/,""));
      $('.ticker.total .value').html(total.replace(/\.?0+$/,""));
    } else {
      $('.ticker.change .value').html('0');
      $('.ticker.volume .value').html('0');
      $('.ticker.total .value').html('0');
    }
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
    const self = this;
    const maxPrice = new BigNumber(10);
    const maxAmount = new BigNumber(500000);
    const maxFunds = maxPrice.times(maxAmount);

    if (data.type === 'LIMIT') {
      let price = new BigNumber(data.price);
      var quoteMaxPrice = maxPrice;
      if (data.quote === "815b0b1a-2764-3736-8faa-42d694fa620a") {
        quoteMaxPrice = maxPrice.times(10000);
      }
      if (price.gt(quoteMaxPrice)) {
        self.api.notify('error', window.i18n.t('market.errors.price.max', { price: quoteMaxPrice.toFormat(), symbol: self.quote.symbol}));
        return false;
      }
    }

    if (data.side === 'BID') {
      let funds = new BigNumber(data.funds);
      var minFunds = '0.0001';
      if (data.quote === "815b0b1a-2764-3736-8faa-42d694fa620a") {
        minFunds = '1';
      }
      if (funds.lt(minFunds)) {
        self.api.notify('error', window.i18n.t('market.errors.fund.min', { fund: minFunds, symbol: self.quote.symbol}));
        return false;
      }
      var quoteMaxFunds = maxFunds;
      if (data.quote === "815b0b1a-2764-3736-8faa-42d694fa620a") {
        quoteMaxFunds = maxFunds.times(10000);
      }
      if (funds.gt(quoteMaxFunds)) {
        self.api.notify('error', window.i18n.t('market.errors.funds.max', { fund: quoteMaxFunds.toFormat(), symbol: self.quote.symbol}));
        return false;
      }
      
      let amount = new BigNumber(data.amount);
      if (amount.gt(maxAmount)) {
        self.api.notify('error', window.i18n.t('market.errors.amount.max', { amount: maxAmount.toFormat(), symbol: self.base.symbol}));
        return false;
      }
    }

    if (data.side === 'ASK') {
      let amount = new BigNumber(data.amount);
      var minFunds = '0.0001';
      if (data.quote === "815b0b1a-2764-3736-8faa-42d694fa620a") {
        minFunds = '1';
      }
      if (data.type === 'LIMIT' && amount.times(data.price).lt(minFunds)) {
        self.api.notify('error', window.i18n.t('market.errors.fund.min', { fund: minFunds, symbol: self.quote.symbol}));
        return false;
      }
      if (data.type !== 'LIMIT') {
        if (amount.lt('0.0001')) {
          self.api.notify('error', window.i18n.t('market.errors.amount.min', { amount: '0.0001', symbol: self.base.symbol}));
          return false;
        }
      }
      if (amount.gt(maxAmount)) {
        self.api.notify('error', window.i18n.t('market.errors.amount.max', { amount: maxAmount.toFormat(), symbol: self.base.symbol}));
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
      if (data.type === 'LIMIT' && data.side === 'BID') {
        data.funds = new BigNumber(data.amount).times(data.price).toFixed(8);
      }

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
      const orderSide = data.side;
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

          if (redirect_to != undefined) {
            redirect_to.close();
          }

          self.snapshot.syncSnapshots();

          clearInterval(self.paymentInterval);
          
          $('.submit-loader', form).hide();
          $(':submit', form).show();
          $(':submit', form).prop('disabled', false);

          $('.trade.form input[name="amount"]').val('');
          $('.trade.form input[name="funds"]').val('');
          $('.trade.form input[name="trace_id"]').val(uuid().toLowerCase());
          if (orderSide === 'BID') {
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

  handleCandleSwitch: function (market) {
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

      clearInterval(self.candleInterval);
      const granularity = $(this).data('granularity');
      self.pollCandles(granularity);
      if (market && market.source === 'SERVER') {
        self.candleInterval = setInterval(function () {
          self.pollCandles(granularity);
        }, 60000);
      }
    });
  },

  pollCandles: function (granularity) {
    const self = this;
    if (self.currentMarket && self.currentMarket.source === 'SERVER') {
      self.api.market.candles(function (resp) {
        if (resp.error) {
          return true;
        }
        self.renderCandleChart(resp.data);
      }, self.base.asset_id + '-' + self.quote.asset_id, granularity);
    } else {
      self.marketController.processCandles(function (candles) {
        if (candles.length == 0) {
          if (self.priceChart) {
            self.priceChart.series[0].setData([]);
            self.priceChart.series[1].setData([]);
          } else {
            $('.price.chart .spinner-container').remove();
          }
        } else {
          self.renderCandleChart(candles);
        }
        $('.depth.chart .spinner-container').remove();
      }, self.base.asset_id, self.quote.asset_id, granularity);
    }
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
        if (book.asks.length > 1000) {
          self.book.asks = book.asks.slice(0, 1000);
        }
        self.book.bids = book.bids;
        if (book.bids.length > 1000) {
          self.book.bids = book.bids.slice(0, 1000);
        }
        $('.order.book .spinner-container').remove();
        $('.order.book .book.data').show();
        $('.order.book .order.item').remove();
        for (var i = 0; i < book.asks.length; i++) {
          self.orderOpenOnPage(book.asks[i], true, 'asks');
        }
        for (var i = 0; i < book.bids.length; i++) {
          self.orderOpenOnPage(book.bids[i], true, 'bids');
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
    $('.book.data .spread').attr('data-price', price);
    $('.quote.price').html(new BigNumber(price).toFixed(8).replace(/\.?0+$/,""));
    var price_usd = new BigNumber(price).times(this.quote.price_usd);
    if (price_usd.toFixed(6).indexOf('0.0000') === 0) {
      price_usd = new BigNumber(price_usd).toFixed(6);
    } else if (price_usd.toFixed(4).indexOf('0.00') === 0) {
      price_usd = new BigNumber(price_usd).toFixed(4);
    } else {
      price_usd = new BigNumber(price_usd).toFixed(2);
    }
    price_usd = price_usd.replace(/\.?0+$/,"");
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

  orderOpenOnPage: function (o, instant, type) {
    var list = $('.order.item');
    var maxOrders = 50;
    if (type === 'bids') {
      maxOrders = 100;
    }
    if (instant && list.length > maxOrders) {
      return;
    }
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
    if (self.quote.asset_id === '815b0b1a-2764-3736-8faa-42d694fa620a' || self.quote.asset_id === '31d2ea9c-95eb-3355-b65b-ba096853bc18') {
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
    const pusdAssetId = this.db.asset.pusdAsset.asset_id;

    if (quote !== btcAssetId && quote !== usdtAssetId && quote !== xinAssetId && quote !== pusdAssetId) {
      return false;
    }
    if (quote === btcAssetId && base === usdtAssetId) {
      return false;
    }
    if (quote === btcAssetId && base === pusdAssetId) {
      return false;
    }
    if (quote === xinAssetId && base === usdtAssetId) {
      return false;
    }
    if (quote === xinAssetId && base === btcAssetId) {
      return false;
    }
    if (quote === xinAssetId && base === pusdAssetId) {
      return false;
    }
    if (quote === pusdAssetId && base === usdtAssetId) {
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
