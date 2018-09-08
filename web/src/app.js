import 'simple-line-icons/scss/simple-line-icons.scss';
import './layout.scss';
import $ from 'jquery';
import Navigo from 'navigo';
import Locale from './locale';
import API from './api';
import Auth from './auth';
import Market from './market';
import Account from './account';
import Database from './database';
import bugsnag from 'bugsnag-js';

const PartialLoading = require('./loading.html');
const Error404 = require('./404.html');
const router = new Navigo(WEB_ROOT);
const api = new API(router, API_ROOT, ENGINE_ROOT);
const bugsnagClient = bugsnag('6a5f428fcc4525507ddb77cc24bdd5c8');
const db = new Database();
const OfflinePlugin = require('offline-plugin/runtime');


window.i18n = new Locale(navigator.language);

router.replace = function(url) {
  this.resolve(url);
  this.pause(true);
  this.navigate(url);
  this.pause(false);
};

router.hooks({
  before: function(done, params) {
    document.title = window.i18n.t('appName');
    $('body').attr('class', 'loading layout');
    $('#layout-container').html(PartialLoading());
    done(true);
  },
  after: function(params) {
    router.updatePageLinks();
  }
});

OfflinePlugin.install({
  onInstalled: function() {
    console.info('OfflinePlugin...onInstalled...');
  },

  onUpdating: function() {
    console.info('OfflinePlugin...onUpdating...');
  },

  onUpdateReady: function() {
    OfflinePlugin.applyUpdate();
  },
  onUpdated: function() {
    console.info('OfflinePlugin...onUpdated...');
    // window.location.reload();
  }
});

router.on({
  '/': function () {
    new Market(router, api, db, bugsnagClient).assets();
  },
  '/auth': function () {
    new Auth(router, api).render();
  },
  '/orders': function () {
    new Account(router, api, db, bugsnagClient).orders();
  }
}).notFound(function () {
  $('#layout-container').html(Error404());
  $('body').attr('class', 'error layout');
  router.updatePageLinks();
}).resolve();