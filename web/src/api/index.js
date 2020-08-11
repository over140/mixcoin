import $ from 'jquery';
import Noty from 'noty';
import Account from './account.js';
import Engine from './engine.js';
import Mixin from './mixin.js';
import Ocean from './ocean.js';
import Market from './market.js';

function API(router, root, engine) {
  this.router = router;
  this.root = root;
  this.account = new Account(this);
  this.mixin = new Mixin(this);
  this.ocean = new Ocean(this);
  this.engine = new Engine(engine);
  this.market = new Market(this);
  this.Error404 = require('../404.html');
  this.ErrorGeneral = require('../error.html');
}

API.prototype = {

  requestMixin: function(method, path, params, callback) {
    const self = this;
    $.ajax({
      type: method,
      url: path,
      contentType: "application/json",
      data: JSON.stringify(params),
      beforeSend: function(xhr) {
        xhr.setRequestHeader("Authorization", "Bearer " + self.account.token());
      },
      success: function(resp) {
        var consumed = false;
        if (typeof callback === 'function') {
          consumed = callback(resp);
        }
        if (!consumed && resp.error !== null && resp.error !== undefined) {
          self.error(resp);
        }
      },
      error: function(event) {
        self.error(event.responseJSON, callback);
      }
    });
  },

  request: function(method, path, params, callback) {
    const self = this;
    var body = JSON.stringify(params);
    var url = self.root + path;
    if (path.indexOf('https://') === 0) {
      url = path;
    }
    if (url.indexOf('https://mixin-api.zeromesh.net') === 0) {
      var uri = path.slice('https://mixin-api.zeromesh.net'.length);
      self.account.mixinToken(uri, function (resp) {
        if (resp.error) {
          return callback(resp);
        }
        return self.send(resp.data.token, method, url, body, callback);
      });
    } else {
      var token = self.account.token(method, path, body);
      return self.send(token, method, url, body, callback);
    }
  },

  send: function (token, method, url, body, callback) {
    const self = this;
    $.ajax({
      type: method,
      url: url,
      contentType: "application/json",
      data: body,
      beforeSend: function(xhr) {
        xhr.setRequestHeader("Authorization", "Bearer " + token);
      },
      success: function(resp) {
        var consumed = false;
        if (typeof callback === 'function') {
          consumed = callback(resp);
        }
        if (!consumed && resp.error !== null && resp.error !== undefined) {
          self.error(resp);
        }
      },
      error: function(event) {
        self.error(event.responseJSON, callback);
      }
    });
  },

  error: function(resp, callback) {
    if (resp == null || resp == undefined || resp.error === null || resp.error === undefined) {
      resp = {error: { code: 0, description: 'unknown error' }};
    }

    var consumed = false;
    if (typeof callback === 'function') {
      consumed = callback(resp);
    }
    if (!consumed) {
      switch (resp.error.code) {
        case 401:
          this.account.clear();
          var obj = new URL(window.location);
          var returnTo = encodeURIComponent(obj.href.substr(obj.origin.length));
          window.location.replace('https://mixin-www.zeromesh.net/oauth/authorize?client_id=' + CLIENT_ID + '&scope=PROFILE:READ+ASSETS:READ+SNAPSHOTS:READ&response_type=code&return_to=' + returnTo);
          break;
        case 404:
          $('#layout-container').html(this.Error404());
          $('body').attr('class', 'error layout');
          this.router.updatePageLinks();
          break;
        default:
          if ($('#layout-container > .spinner-container').length === 1) {
            $('#layout-container').html(this.ErrorGeneral());
            $('body').attr('class', 'error layout');
            this.router.updatePageLinks();
          }
          this.notify('error', i18n.t('general.errors.' + resp.error.code));
          break;
      }
    }
  },

  notifyError: function(type, error) {
    var errorInfo = '';
    if (error.description) {
      errorInfo += error.description;
    }
    if (error.code) {
      errorInfo += ' ' + error.code;
    }
    if (errorInfo !== '') {
      this.notify('error', errorInfo);
    }
  },

  notify: function(type, text) {
    new Noty({
      type: type,
      layout: 'top',
      theme: 'nest',
      text: text,
      timeout: 3000,
      progressBar: false,
      queue: 'api',
      killer: 'api',
      force: true,
      animation: {
        open: 'animated bounceInDown',
        close: 'animated slideOutUp noty'
      }
    }).show();
  }
};

export default API;
