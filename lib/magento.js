var xmlrpc = require("xmlrpc");

var MagentoConnector = function(config) {
  var __privateMethods = {
    _xlog: config.disableLogging ? () => {} : console.log,
    _xcall: function(self, api, apiargs) {
      var MagentoClient = self.MagentoClient;
      var args = Array.prototype.slice.call(apiargs);
      var callback = args.pop();

      var next = function() {
        MagentoClient.methodCall(
          "call",
          [MagentoClient.sessionId, api, args],
          function(err, res) {
            if (err) {
              // try logging in again
              if (err.faultCode == 5 && MagentoClient.sessionId) {
                MagentoClient.sessionId = undefined;
                return this._xcall(self, api, apiargs);
              }
            }
            callback(err, res);
          }
        );
      };

      if (MagentoClient.sessionId == undefined) self.login(next);
      else next();
    },

    _call: function(self, apiargs) {
      var args = Array.prototype.slice.call(apiargs);
      var callback = args.pop();
      var api = args.shift();
      var MagentoClient = self.MagentoClient;

      MagentoClient.methodCall(
        "call",
        [MagentoClient.sessionId, api, args],
        callback
      );
    },

    _discover: function(self, cb) {
      var MagentoClient = self.MagentoClient;
      var next = function() {
        MagentoClient.methodCall(
          "resources",
          [MagentoClient.sessionId],
          function(err, resources) {
            if (!err) {
              for (var j = 0; j < resources.length; j++) {
                var resource = resources[j];
                var methods = resource.methods;
                self[resource.name] = {};
                for (var i = 0; i < methods.length; i++) {
                  var method = methods[i];
                  self.define(method.path);
                }
              }
              cb(null);
            } else {
              __privateMethods._xlog("an error occured " + err);
              cb(err);
            }
          }
        );
      };

      if (MagentoClient.sessionId == undefined) self.login(next);
      else next();
    }
  };

  return {
    MagentoClient: config.isSecure
      ? xmlrpc.createSecureClient(config)
      : xmlrpc.createClient(config),

    init: function(cb) {
      __privateMethods._discover(this, cb);
      return this;
    },

    end: function(cb) {
      var MagentoClient = this.MagentoClient;
      MagentoClient.methodCall("endSession", [MagentoClient.sessionId], cb);
    },

    login: function(next) {
      var self = this;
      self.MagentoClient.methodCall(
        "login",
        [config.login, config.pass],
        function(err, sessionId) {
          if (err) __privateMethods._xlog("Login Error: " + err);
          else {
            __privateMethods._xlog("session-id:" + sessionId);
            self.MagentoClient.sessionId = sessionId;
            next();
          }
        }
      );
    },

    call: function() {
      __privateMethods._xlog("call called with arguments " + arguments);

      var self = this;
      var MagentoClient = self.MagentoClient;
      var apiargs = arguments;

      var next = function() {
        self._call(apiargs);
      };
      if (MagentoClient.sessionId == undefined) self.login(next);
      else next();
    },

    define: function(apiname) {
      var obj = this;
      apis = apiname.split(".");
      if (obj[apis[0]] == undefined) obj[apis[0]] = {};
      obj[apis[0]][apis[1]] = function(...args) {
        // contains optional callback
        var func = function() {
          __privateMethods._xlog(
            "calling xcall for " + apiname + "(" + arguments[0] + "...);"
          );
          __privateMethods._xcall.call(obj, obj, apiname, arguments);
        };
        if (typeof args[args.length - 1] !== "function") {
          // if last arg is not a function,
          return new Promise(function(resolve, reject) {
            func(...args, function(err, result) {
              err ? reject(err) : resolve(result);
            });
          });
        }
        func(...args); // it is a function
      };
    }
  };
};

module.exports = MagentoConnector;
