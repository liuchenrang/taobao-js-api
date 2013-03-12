var $events = require('events'), $net = require('net'), $util = require('util');
var $url = require('url');
var $http = require('http');
var $encrypt = require('./md5.js');

var config = require('./config.js');

exports.client = createClient;
exports.Top = Top;

//todo use a third part logger library to log the info to file
var logger = {
  info: function(msg) {
    console.log('[INFO]  ' + msg)
  },
  warn: function(msg) {
    console.log('[WARN]  ' + msg)
  },
  error: function(msg) {
    console.log('[ERROR] ' + msg)
  },
  fatal: function(msg) {
    console.log('[FATAL] ' + msg)
  },
  debug: function(msg) {
    console.log('[DEBUG] ' + msg)
  },
  trace: function(msg) {
    console.log('[TRACE]' + msg)
  }
};

String.prototype.padL = function(len, def) {
  var test = this;
  while (test.length < len) {
    test = def + this;
  }
  return test;
};

Date.prototype.formatDate = function(format) {
  var date = this;
  if (!format)
    format = "MM/dd/yyyy";

  var month = date.getMonth() + 1;
  var year = date.getFullYear();

  format = format.replace("MM", month.toString().padL(2, "0"));

  if (format.indexOf("yyyy") > -1)
    format = format.replace("yyyy", year.toString());
  else if (format.indexOf("yy") > -1)
    format = format.replace("yy", year.toString().substr(2, 2));

  format = format.replace("dd", date.getDate().toString().padL(2, "0"));

  var hours = date.getHours();
  if (format.indexOf("t") > -1) {
    if (hours > 11)
      format = format.replace("t", "pm");
    else
      format = format.replace("t", "am");
  }
  if (format.indexOf("HH") > -1)
    format = format.replace("HH", hours.toString().padL(2, "0"));
  if (format.indexOf("hh") > -1) {
    if (hours > 12) hours - 12;
    if (hours === 0) hours = 12;
    format = format.replace("hh", hours.toString().padL(2, "0"));
  }
  if (format.indexOf("mm") > -1)
    format = format.replace("mm", date.getMinutes().toString().padL(2, "0"));
  if (format.indexOf("ss") > -1)
    format = format.replace("ss", date.getSeconds().toString().padL(2, "0"));
  return format;
};

// -------------------------------- call queue ------------------------------
var callQueue = [];

// -------------------------------- class defined ------------------------------
function Top(appkey, secret) {
  $events.EventEmitter.call(this);
  var self = this;
  self.options = {
    host: 'gw.api.taobao.com',
    port: 80,
    path: '/router/rest'
  };
  self.appKey = appkey || '';
  self.version = '2.0';
  self.sign_method = 'md5';
  self.format = 'json';
  self.secretCode = secret || '';
  if(config.mode === config.M_ONEBYONE){
    self.on('_finish', function(){
      var api = callQueue.shift();
      if(api) self._call(api);
    });
  }
}
$util.inherits(Top, $events.EventEmitter);

// -----------------------------factory method ---------------------------------
function createClient(appkey, secret) {
  return new Top(appkey, secret);
}

// -----------------------------------------------------------------------------
Top.prototype.status = {
  request: 0,
  response: 0,
  data: 0,
  end: 0,
  error: 0
};
///*new Date().formatDate('yyyy-MM-dd HH:mm:ss')*/
Top.prototype.params = function() {
  return {'method':'',
    'timestamp':new Date().formatDate('yyyy-MM-dd HH:mm:ss'),
    'format':this.format,
    'app_key': this.appKey,
    'v': this.version
  };
};

Top.prototype.afterGet = function(res) {
  logger.info("Got response: " + res.statusCode);
  res.setEncoding('utf8');
  res.on('data', function(data) {
    logger.info(data);
  });
};
// ...
Top.prototype.generateSig = function(args, secret) {
  // sort
  var names = [];
  for (var arg in args) {
    names.push(arg);
  }
  names = names.sort();
  // concat & wrap with sercetCode
  var ss = [secret];
  for (var i in names) {
    var n = names[i];
    ss.push(n);
    ss.push(args[n]);
  }
  ss.push(secret);
  var str = ss.join('');
  // encode by md5
  var md5 = $encrypt.hex_md5(str);
  // upcase
  return md5.toUpperCase();
};

Top.prototype.apiSample = function() {
  return {session:'', method:'', args:{}};
};
//api={'session':'','method':'','args':{key:'value'}};
Top.prototype._call = function(api) {
  var self = this;
  var s = self.status;
  s.request += 1;
  logger.info("Call Api[" + api + "] with session key[" + api.session + "]");
  //format[xml,json],app_key,v[2.0],sign_method[md5/hmac]
  //method,session,timestamp,sign
  var params = self.params();
  if (api.session) {
    params.session = api.session;
  }
  params.method = api.method;
  for (var i in api.args) {
    if (api.args[i])
      params[i] = api.args[i];
  }
  params.sign_method = 'md5';
  params.sign = self.generateSig(params, self.secretCode);
  var urlToGet = {
    pathname: self.options.path,
    query: params
  };
  var path = $url.format(urlToGet);
  // -------------------------------------------------
  logger.info("GET http://" + self.options.host + ":" + self.options.port + path);
  var opts = {
    host:self.options.host        ,
    port:self.options.port        ,
    path:path        ,
    method:'GET'
  };
  //callback for the whole response
  // todo is there another good method to get the json?
  var callback = function(res) {
    function callbackOrEmit(err, api, jres) {
      if (api.callback) {
        api.callback(jres, api, err);
      } else {
        self.emit(api.method, jres, api, err);
      }
      self.emit('_finished');
    }

    s.response += 1;
    logger.info("Got response: " + res.statusCode);
    res.setEncoding('utf8');
    var result = '';
    res.on('data', function(data) {
      result += data.toString();
      s.data += 1;
    });
    res.on('end', function() {
      try {
        var jres = (new Function("return " + result))()
        logger.info("success to call[" + api.method + "]:" + jres.toString());
        callbackOrEmit(null, api, jres)
      } catch(err) {
        s.error += 1;
        logger.error("err: " + err + "  result : " + result);
        callbackOrEmit(err, api, null)
      }
      s.end += 1;
    });
    res.on("error", function(err) {
      logger.error("Unknown error occurred : " + err.message);
      s.error += 1;
      callbackOrEmit(err, api, null)
    })
  };
  var try_cnt = 4;

  function get_url() {
//        logger.info("$http.get ... ")
    $http.get(opts, callback).on('error', function(e) {
      logger.error("Got error: " + e.message);
      if (try_cnt > 0) {
        try_cnt -= 1;
        logger.warn("Try again to get the request(" + try_cnt + " times rest)");
        get_url();
      }
    });
  }

  get_url();
};

Top.prototype.periodCall = function(api){
  callQueue.push(api);
};

Top.prototype.delayCall = function(api) {
  var status = this.status;
  if(status.request < (status.response + status.error)){
    callQueue.push(api);
  }else{
    this._call(api);
  }
};

Top.prototype.call = function(api){
  switch(config.mode){
    case config.M_PERIOD:
      this.periodCall(api);
      break;
    case config.M_ONEBYONE:
      this.delayCall(api);
      break;
    case config.M_DIRECT:
    default: this._call(api);break;
  }
};

//
if (config.mode === config.M_PERIOD) {
  setInterval(function() {
    var api = callQueue.shift();
    if(api){
      this._call(api)
    }
  }, 10);
}

//exports.client=new Top();
//api={'session':'...','method':'taobao.item.get',
// 'args':{fields:'approve_status,num_iid,title,nick,type,cid,pic_url,num,props,list_time,price,modified,delist_time,seller_cids'};
// api.callback
// client.on(api.method, callback);
//





